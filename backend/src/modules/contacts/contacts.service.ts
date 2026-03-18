import { Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { AppContextService } from '../../context/app-context.service';
import { DatabaseService } from '../../database/database.service';
import { normalizePhone, parsePhoneText } from '../../common/phone.util';

@Injectable()
export class ContactsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly appContextService: AppContextService,
  ) {}

  async getContactLists(sipAccountId?: string) {
    await this.ensureDefaultList();

    const rows = await this.databaseService.many<any>(
      `
        SELECT
          cl.id,
          cl.name AS list_name,
          cl.description,
          cl.created_at,
          COUNT(clm.contact_id)::int AS contact_count
        FROM contact_lists cl
        LEFT JOIN contact_list_members clm ON clm.contact_list_id = cl.id
        WHERE cl.organization_id = $1
          AND cl.deleted_at IS NULL
        GROUP BY cl.id
        ORDER BY CASE WHEN LOWER(cl.name) = 'default' THEN 0 ELSE 1 END, cl.created_at ASC
      `,
      [this.appContextService.getOrganizationId()],
    );

    return rows.map((row) => ({
      ...row,
      sip_account_id: sipAccountId || 'default',
    }));
  }

  async createContactList(payload: any) {
    const name = String(payload.list_name || '').trim();
    if (!name) {
      throw new Error('list_name is required');
    }

    const existing = await this.findListByName(name);
    if (existing) {
      return {
        id: existing.id,
        list_name: existing.name,
        description: existing.description,
      };
    }

    const result = await this.databaseService.one<any>(
      `
        INSERT INTO contact_lists (
          organization_id,
          name,
          description,
          source
        )
        VALUES ($1, $2, $3, 'manual')
        RETURNING id, name AS list_name, description
      `,
      [this.appContextService.getOrganizationId(), name, payload.description || ''],
    );

    return result;
  }

  async renameContactList(id: string, listName: string) {
    const list = await this.getList(id);
    if (list.name.toLowerCase() === 'default') {
      throw new Error('Cannot rename the Default list');
    }

    const result = await this.databaseService.one<any>(
      `
        UPDATE contact_lists
        SET name = $3, updated_at = now()
        WHERE organization_id = $1
          AND id = $2
        RETURNING id, name AS list_name, description
      `,
      [this.appContextService.getOrganizationId(), id, listName.trim()],
    );

    return result;
  }

  async deleteContactList(id: string) {
    const list = await this.getList(id);
    if (list.name.toLowerCase() === 'default') {
      throw new Error('Cannot delete the Default list');
    }

    const defaultListId = await this.ensureDefaultList();

    await this.databaseService.tx(async (client) => {
      await client.query(
        `
          INSERT INTO contact_list_members (contact_list_id, contact_id, added_at)
          SELECT $1, contact_id, now()
          FROM contact_list_members
          WHERE contact_list_id = $2
          ON CONFLICT DO NOTHING
        `,
        [defaultListId, id],
      );

      await client.query(
        `
          DELETE FROM contact_lists
          WHERE organization_id = $1
            AND id = $2
        `,
        [this.appContextService.getOrganizationId(), id],
      );
    });

    return { ok: true };
  }

  async getContacts(filters: { listId?: string; query?: string; status?: string }) {
    const params: any[] = [this.appContextService.getOrganizationId()];
    let whereSql = `
      WHERE c.organization_id = $1
        AND c.deleted_at IS NULL
    `;

    let joinSql = '';

    if (filters.listId) {
      joinSql += ` INNER JOIN contact_list_members clm ON clm.contact_id = c.id `;
      whereSql += ` AND clm.contact_list_id = $${params.length + 1}`;
      params.push(filters.listId);
    }

    if (filters.query) {
      whereSql += ` AND (c.phone_e164 ILIKE $${params.length + 1} OR COALESCE(c.display_name, '') ILIKE $${params.length + 1})`;
      params.push(`%${filters.query}%`);
    }

    if (filters.status) {
      whereSql += ` AND COALESCE(c.attributes->>'dialer_status', 'pending') = $${params.length + 1}`;
      params.push(filters.status);
    }

    const rows = await this.databaseService.many<any>(
      `
        SELECT
          c.id,
          c.phone_e164 AS phone_number,
          COALESCE(c.display_name, '') AS contact_name,
          COALESCE(c.attributes->>'dialer_status', 'pending') AS status,
          COALESCE((c.attributes->>'attempts')::int, 0) AS attempts,
          COALESCE(c.attributes->>'last_result', '-') AS last_result,
          c.created_at,
          c.updated_at
        FROM contacts c
        ${joinSql}
        ${whereSql}
        ORDER BY c.created_at DESC
      `,
      params,
    );

    return rows;
  }

  async addContact(payload: any) {
    const listId = payload.contact_list_id || (await this.ensureDefaultList());
    const contact = await this.upsertContactToList(listId, payload.phone_number, payload.contact_name || '');
    return contact;
  }

  async deleteContact(id: string) {
    const result = await this.databaseService.query(
      `
        DELETE FROM contacts
        WHERE organization_id = $1
          AND id = $2
      `,
      [this.appContextService.getOrganizationId(), id],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Contact not found');
    }

    return { ok: true };
  }

  async importContacts(payload: any) {
    const listId = payload.contact_list_id || (await this.ensureDefaultList());
    const parsed = parsePhoneText(payload.text || '');
    if (parsed.length === 0) {
      throw new Error('No valid phone numbers found');
    }

    let inserted = 0;
    let updated = 0;

    for (const item of parsed) {
      const result = await this.upsertContactToList(listId, item.phone_number, item.contact_name);
      if (result.wasExisting) {
        updated += 1;
      } else {
        inserted += 1;
      }
    }

    return {
      ok: true,
      inserted,
      updated,
      total: parsed.length,
    };
  }

  async cleanupContacts(payload: any) {
    const listId = payload.contact_list_id;
    if (!listId) {
      throw new Error('contact_list_id is required');
    }

    if (payload.mode === 'replace_from_text') {
      if (!payload.text) {
        throw new Error('text required for replace_from_text mode');
      }
      await this.cleanupContacts({ mode: 'clear_all', contact_list_id: listId });
      return this.importContacts({ contact_list_id: listId, text: payload.text });
    }

    const filterClause =
      payload.mode === 'clear_answered'
        ? `AND COALESCE(c.attributes->>'dialer_status', 'pending') = 'called'`
        : payload.mode === 'clear_dtmf'
          ? `AND COALESCE(c.attributes->>'last_result', '-') ILIKE '%dtmf%'`
          : '';

    await this.databaseService.tx(async (client) => {
      const contactRows = await client.query<{ id: string }>(
        `
          SELECT c.id
          FROM contacts c
          INNER JOIN contact_list_members clm ON clm.contact_id = c.id
          WHERE c.organization_id = $1
            AND clm.contact_list_id = $2
            ${filterClause}
        `,
        [this.appContextService.getOrganizationId(), listId],
      );

      const contactIds = contactRows.rows.map((row) => row.id);
      if (contactIds.length === 0) {
        return;
      }

      await client.query(
        `
          DELETE FROM contact_list_members
          WHERE contact_list_id = $1
            AND contact_id = ANY($2::uuid[])
        `,
        [listId, contactIds],
      );

      await client.query(
        `
          DELETE FROM contacts c
          WHERE c.organization_id = $1
            AND c.id = ANY($2::uuid[])
            AND NOT EXISTS (
              SELECT 1
              FROM contact_list_members clm
              WHERE clm.contact_id = c.id
            )
        `,
        [this.appContextService.getOrganizationId(), contactIds],
      );
    });

    return { ok: true, mode: payload.mode };
  }

  async ensureDefaultList() {
    const existing = await this.findListByName('Default');
    if (existing) {
      return existing.id as string;
    }

    const created = await this.databaseService.one<any>(
      `
        INSERT INTO contact_lists (
          organization_id,
          name,
          description,
          source
        )
        VALUES ($1, 'Default', 'Default contact list', 'system')
        RETURNING id
      `,
      [this.appContextService.getOrganizationId()],
    );

    return created.id as string;
  }

  private async getList(id: string) {
    const row = await this.databaseService.one<any>(
      `
        SELECT id, name, description
        FROM contact_lists
        WHERE organization_id = $1
          AND id = $2
          AND deleted_at IS NULL
      `,
      [this.appContextService.getOrganizationId(), id],
    );

    if (!row) {
      throw new NotFoundException('List not found');
    }

    return row;
  }

  private async findListByName(name: string) {
    return this.databaseService.one<any>(
      `
        SELECT id, name, description
        FROM contact_lists
        WHERE organization_id = $1
          AND name = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [this.appContextService.getOrganizationId(), name],
    );
  }

  private async upsertContactToList(listId: string, phoneNumber: string, contactName: string) {
    const normalizedPhone = normalizePhone(phoneNumber);
    if (normalizedPhone.length < 5) {
      throw new Error('Invalid phone number');
    }

    return this.databaseService.tx(async (client) => {
      const existing = await client.query<any>(
        `
          SELECT id, attributes
          FROM contacts
          WHERE organization_id = $1
            AND phone_e164 = $2
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [this.appContextService.getOrganizationId(), normalizedPhone],
      );

      let contactId: string;
      let wasExisting = false;

      if (existing.rows[0]) {
        contactId = existing.rows[0].id;
        wasExisting = true;
        const attributes = this.mergeAttributes(existing.rows[0].attributes, {});

        await client.query(
          `
            UPDATE contacts
            SET
              display_name = $3,
              attributes = $4::jsonb,
              updated_at = now()
            WHERE organization_id = $1
              AND id = $2
          `,
          [
            this.appContextService.getOrganizationId(),
            contactId,
            contactName || '',
            JSON.stringify(attributes),
          ],
        );
      } else {
        contactId = randomUUID();
        await client.query(
          `
            INSERT INTO contacts (
              id,
              organization_id,
              phone_e164,
              display_name,
              status,
              source,
              attributes
            )
            VALUES ($1, $2, $3, $4, 'active', 'manual', $5::jsonb)
          `,
          [
            contactId,
            this.appContextService.getOrganizationId(),
            normalizedPhone,
            contactName || '',
            JSON.stringify(this.defaultAttributes()),
          ],
        );
      }

      await client.query(
        `
          INSERT INTO contact_list_members (contact_list_id, contact_id, added_at)
          VALUES ($1, $2, now())
          ON CONFLICT DO NOTHING
        `,
        [listId, contactId],
      );

      return {
        id: contactId,
        phone_number: normalizedPhone,
        contact_name: contactName || '',
        status: 'pending',
        attempts: 0,
        last_result: '-',
        wasExisting,
      };
    });
  }

  private defaultAttributes() {
    return {
      dialer_status: 'pending',
      attempts: 0,
      last_result: '-',
    };
  }

  private mergeAttributes(existing: any, next: Record<string, any>) {
    return {
      ...(existing || {}),
      ...this.defaultAttributes(),
      ...next,
    };
  }
}
