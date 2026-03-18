import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { AppContextService } from '../../context/app-context.service';
import { DatabaseService } from '../../database/database.service';
import { TelephonyService } from '../../telephony/telephony.service';

@Injectable()
export class SipService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly appContextService: AppContextService,
    private readonly telephonyService: TelephonyService,
    private readonly configService: ConfigService,
  ) {}

  async getSipAccounts() {
    const rows = await this.databaseService.many<any>(
      `
        SELECT
          st.id,
          st.name,
          st.username,
          st.password_ciphertext AS password,
          st.domain,
          st.port,
          st.active AS is_active,
          st.created_at,
          COALESCE(cid.number_e164, '') AS caller_id
        FROM sip_trunks st
        LEFT JOIN caller_ids cid ON cid.id = st.default_caller_id_id
        WHERE st.organization_id = $1
          AND st.deleted_at IS NULL
        ORDER BY st.created_at DESC
      `,
      [this.appContextService.getOrganizationId()],
    );

    return rows.map((row) => ({
      ...row,
      port: Number(row.port || 5060),
      is_active: Boolean(row.is_active),
    }));
  }

  async createSipAccount(payload: any) {
    const account = await this.databaseService.tx(async (client) => {
      const callerIdId = await this.resolveCallerIdId(client, payload.caller_id);

      const result = await client.query(
        `
          INSERT INTO sip_trunks (
            organization_id,
            name,
            provider_name,
            host,
            port,
            username,
            auth_username,
            password_ciphertext,
            domain,
            from_user,
            from_domain,
            default_caller_id_id,
            active
          )
          VALUES (
            $1, $2, 'manual', $3, $4, $5, $5, $6, $3, $5, $3, $7, true
          )
          RETURNING id
        `,
        [
          this.appContextService.getOrganizationId(),
          payload.name || payload.username,
          payload.domain,
          Number(payload.port || 5060),
          payload.username,
          payload.password,
          callerIdId,
        ],
      );

      return result.rows[0];
    });

    await this.telephonyService.reloadSipConfiguration();
    return { id: account.id, message: 'SIP account saved and configuration reloaded.' };
  }

  async updateSipAccount(id: string, payload: any) {
    await this.getSipAccountRow(id);

    await this.databaseService.tx(async (client) => {
      const callerIdId = await this.resolveCallerIdId(client, payload.caller_id);

      await client.query(
        `
          UPDATE sip_trunks
          SET
            name = $3,
            host = $4,
            port = $5,
            username = $6,
            auth_username = $6,
            password_ciphertext = $7,
            domain = $4,
            from_user = $6,
            from_domain = $4,
            default_caller_id_id = $8,
            updated_at = now()
          WHERE organization_id = $1
            AND id = $2
        `,
        [
          this.appContextService.getOrganizationId(),
          id,
          payload.name || payload.username,
          payload.domain,
          Number(payload.port || 5060),
          payload.username,
          payload.password,
          callerIdId,
        ],
      );
    });

    await this.telephonyService.reloadSipConfiguration();
    return { message: 'Updated and Asterisk reloaded.' };
  }

  async deleteSipAccount(id: string) {
    await this.getSipAccountRow(id);

    await this.databaseService.query(
      `
        DELETE FROM sip_trunks
        WHERE organization_id = $1
          AND id = $2
      `,
      [this.appContextService.getOrganizationId(), id],
    );

    await this.telephonyService.reloadSipConfiguration();
    return { message: 'Deleted and Asterisk reloaded.' };
  }

  async getSipStatus(id: string) {
    const account = await this.getSipAccountRow(id);
    return this.telephonyService.isUsernameRegistered(account.username);
  }

  async getSipLiveStatus() {
    return this.telephonyService.getSipStatusSnapshot();
  }

  async testCall(payload: any) {
    const account = await this.getSipAccountRow(payload.sip_account_id);
    const snapshot = await this.telephonyService.getSipStatusSnapshot();
    const actionId = `test-${randomUUID()}`;
    const callerId = account.caller_id
      ? `${account.caller_id} <${account.caller_id}>`
      : `${account.username} <${account.username}>`;

    const audioPath = payload.audio_file
      ? `${this.configService.get<string>('ASTERISK_AUDIO_PREFIX', '/srv/var/lib/asterisk/sounds/custom_campaigns')}/${payload.audio_file}`
      : `${this.configService.get<string>('ASTERISK_AUDIO_PREFIX', '/srv/var/lib/asterisk/sounds/custom_campaigns')}/demo-echotest`;

    try {
      const result = await this.telephonyService.originateCall({
        channel: `SIP/${account.username}/${payload.phone_number}`,
        callerId,
        timeout: 30000,
        actionId,
        variables: {
          CAMPAIGN_ID: 'test',
          SIP_USER: account.username,
          ORIGINAL_NUMBER: payload.phone_number,
          AUDIO_FILE: audioPath,
          DTMF_MAX_DIGITS: '1',
        },
      });

      return {
        success: true,
        actionId,
        isRegistered: snapshot.registered,
        registry: snapshot.registry,
        result,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        isRegistered: snapshot.registered,
        registry: snapshot.registry,
      };
    }
  }

  private async getSipAccountRow(id: string) {
    const row = await this.databaseService.one<any>(
      `
        SELECT
          st.id,
          st.name,
          st.username,
          st.password_ciphertext AS password,
          st.domain,
          st.port,
          COALESCE(cid.number_e164, '') AS caller_id
        FROM sip_trunks st
        LEFT JOIN caller_ids cid ON cid.id = st.default_caller_id_id
        WHERE st.organization_id = $1
          AND st.id = $2
          AND st.deleted_at IS NULL
      `,
      [this.appContextService.getOrganizationId(), id],
    );

    if (!row) {
      throw new NotFoundException('SIP account not found');
    }

    return row;
  }

  private async resolveCallerIdId(client: PoolClient, callerId: string | undefined) {
    const trimmed = String(callerId || '').trim();
    if (!trimmed) {
      return null;
    }

    const existing = await client.query(
      `
        SELECT id
        FROM caller_ids
        WHERE organization_id = $1
          AND number_e164 = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [this.appContextService.getOrganizationId(), trimmed],
    );

    if (existing.rows[0]) {
      return existing.rows[0].id as string;
    }

    const inserted = await client.query(
      `
        INSERT INTO caller_ids (
          organization_id,
          label,
          number_e164,
          verification_status,
          source,
          active
        )
        VALUES ($1, $2, $3, 'imported', 'manual', true)
        RETURNING id
      `,
      [this.appContextService.getOrganizationId(), trimmed, trimmed],
    );

    return inserted.rows[0].id as string;
  }
}
