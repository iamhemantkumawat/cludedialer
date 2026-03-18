import { Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { AppContextService } from '../../context/app-context.service';
import { DatabaseService } from '../../database/database.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { normalizePhone } from '../../common/phone.util';
import { CampaignRuntimeService } from './campaign-runtime.service';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly appContextService: AppContextService,
    private readonly eventsGateway: EventsGateway,
    private readonly campaignRuntimeService: CampaignRuntimeService,
  ) {}

  async getCampaigns() {
    const rows = await this.databaseService.many<any>(
      `
        SELECT
          c.id,
          c.name,
          CASE WHEN c.status = 'draft' THEN 'pending' ELSE c.status END AS status,
          st.username AS sip_username,
          st.domain AS sip_domain,
          c.max_concurrent_calls AS concurrent_calls,
          aa.id AS audio_asset_id,
          aa.original_filename AS audio_filename,
          COALESCE(NULLIF(c.metadata->>'legacy_audio_type', ''), aa.kind, 'upload') AS audio_type,
          COALESCE((c.metadata->>'legacy_dtmf_digits')::int, 1) AS dtmf_digits,
          c.metadata->>'legacy_tts_text' AS tts_text,
          c.created_at,
          COALESCE(target_stats.total_numbers, 0)::int AS total_numbers,
          COALESCE(target_stats.dialed, 0)::int AS dialed,
          COALESCE(target_stats.answered, 0)::int AS answered,
          COALESCE(cdr_stats.dtmf_responses, 0)::int AS dtmf_responses
        FROM campaigns c
        LEFT JOIN sip_trunks st ON st.id = c.sip_trunk_id
        LEFT JOIN audio_assets aa ON aa.id = c.audio_asset_id
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS total_numbers,
            COUNT(*) FILTER (WHERE status NOT IN ('pending', 'dialing'))::int AS dialed,
            COUNT(*) FILTER (WHERE status = 'answered')::int AS answered
          FROM campaign_targets ct
          WHERE ct.campaign_id = c.id
        ) target_stats ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS dtmf_responses
          FROM cdrs cdr
          WHERE cdr.campaign_id = c.id
            AND cdr.dtmf_summary ? 'primary'
            AND COALESCE(cdr.dtmf_summary->>'primary', '') <> ''
        ) cdr_stats ON true
        WHERE c.organization_id = $1
          AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC
      `,
      [this.appContextService.getOrganizationId()],
    );

    return rows.map((row) => ({
      ...row,
      total_numbers: Number(row.total_numbers || 0),
      dialed: Number(row.dialed || 0),
      answered: Number(row.answered || 0),
      dtmf_responses: Number(row.dtmf_responses || 0),
      concurrent_calls: Number(row.concurrent_calls || 1),
      dtmf_digits: Number(row.dtmf_digits || 1),
    }));
  }

  async getCampaignHistory() {
    const rows = await this.databaseService.many<any>(
      `
        SELECT
          cr.id,
          cr.campaign_id,
          cr.run_number,
          cr.status,
          cr.started_at,
          cr.finished_at,
          cr.created_at,
          c.name AS campaign_name,
          c.sip_trunk_id,
          st.username AS sip_username,
          st.domain AS sip_domain,
          COUNT(DISTINCT call_row.id)::int AS total_calls,
          COUNT(DISTINCT CASE
            WHEN LOWER(COALESCE(cdr.disposition, '')) IN ('answered', 'answered_dtmf')
            THEN call_row.id
          END)::int AS answered_calls,
          COUNT(DISTINCT CASE
            WHEN LOWER(COALESCE(cdr.disposition, '')) = 'no_dtmf'
            THEN call_row.id
          END)::int AS no_dtmf_calls,
          COUNT(DISTINCT CASE
            WHEN LOWER(COALESCE(cdr.disposition, '')) IN ('failed', 'busy', 'noanswer')
            THEN call_row.id
          END)::int AS failed_calls,
          COUNT(DISTINCT CASE
            WHEN cdr.dtmf_summary ? 'primary'
             AND COALESCE(cdr.dtmf_summary->>'primary', '') <> ''
            THEN call_row.id
          END)::int AS dtmf_responses,
          COALESCE(SUM(cdr.bill_duration_ms), 0)::bigint AS total_bill_duration_ms,
          COALESCE(SUM(cdr.total_duration_ms), 0)::bigint AS total_duration_ms
        FROM campaign_runs cr
        INNER JOIN campaigns c ON c.id = cr.campaign_id
        LEFT JOIN sip_trunks st ON st.id = c.sip_trunk_id
        LEFT JOIN calls call_row ON call_row.campaign_run_id = cr.id
        LEFT JOIN cdrs cdr ON cdr.call_id = call_row.id
        WHERE cr.organization_id = $1
        GROUP BY cr.id, c.id, st.username, st.domain
        ORDER BY COALESCE(cr.started_at, cr.created_at) DESC, cr.run_number DESC
      `,
      [this.appContextService.getOrganizationId()],
    );

    return rows.map((row) => ({
      ...row,
      run_number: Number(row.run_number || 0),
      total_calls: Number(row.total_calls || 0),
      answered_calls: Number(row.answered_calls || 0),
      no_dtmf_calls: Number(row.no_dtmf_calls || 0),
      failed_calls: Number(row.failed_calls || 0),
      dtmf_responses: Number(row.dtmf_responses || 0),
      total_bill_duration_ms: Number(row.total_bill_duration_ms || 0),
      total_duration_ms: Number(row.total_duration_ms || 0),
    }));
  }

  async getCampaign(id: string) {
    const row = await this.databaseService.one<any>(
      `
        SELECT
          c.id,
          c.name,
          CASE WHEN c.status = 'draft' THEN 'pending' ELSE c.status END AS status,
          st.username AS sip_username,
          st.domain AS sip_domain,
          c.max_concurrent_calls AS concurrent_calls,
          COALESCE((c.metadata->>'legacy_dtmf_digits')::int, 1) AS dtmf_digits,
          c.metadata->>'legacy_tts_text' AS tts_text,
          c.created_at,
          COUNT(ct.id)::int AS total_numbers,
          COUNT(ct.id) FILTER (WHERE ct.status = 'pending')::int AS pending,
          COUNT(ct.id) FILTER (WHERE ct.status = 'dialing')::int AS calling,
          COUNT(ct.id) FILTER (WHERE ct.status = 'answered')::int AS answered,
          COUNT(ct.id) FILTER (WHERE ct.last_disposition = 'NO_DTMF')::int AS no_dtmf,
          COUNT(ct.id) FILTER (WHERE ct.last_disposition = 'BUSY')::int AS busy,
          COUNT(ct.id) FILTER (WHERE ct.last_disposition = 'NOANSWER')::int AS noanswer,
          COUNT(ct.id) FILTER (
            WHERE ct.last_disposition = 'FAILED'
               OR (ct.status = 'failed' AND ct.last_disposition IS NULL)
          )::int AS failed
        FROM campaigns c
        LEFT JOIN sip_trunks st ON st.id = c.sip_trunk_id
        LEFT JOIN campaign_targets ct ON ct.campaign_id = c.id
        WHERE c.organization_id = $1
          AND c.id = $2
          AND c.deleted_at IS NULL
        GROUP BY c.id, st.username, st.domain
      `,
      [this.appContextService.getOrganizationId(), id],
    );

    if (!row) {
      throw new NotFoundException('Campaign not found');
    }

    return {
      ...row,
      total_numbers: Number(row.total_numbers || 0),
      concurrent_calls: Number(row.concurrent_calls || 1),
      dtmf_digits: Number(row.dtmf_digits || 1),
      stats: {
        pending: Number(row.pending || 0),
        calling: Number(row.calling || 0),
        answered: Number(row.answered || 0),
        no_dtmf: Number(row.no_dtmf || 0),
        busy: Number(row.busy || 0),
        noanswer: Number(row.noanswer || 0),
        failed: Number(row.failed || 0),
      },
    };
  }

  async createCampaign(payload: any) {
    if (!payload.name) {
      throw new Error('name is required');
    }

    const numbers = Array.isArray(payload.numbers) ? payload.numbers : [];

    const organizationId = this.appContextService.getOrganizationId();
    const campaignId = randomUUID();

    await this.databaseService.tx(async (client) => {
      await client.query(
        `
          INSERT INTO campaigns (
            id,
            organization_id,
            name,
            status,
            sip_trunk_id,
            audio_asset_id,
            max_concurrent_calls,
            metadata,
            created_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, 'draft', $4, $5, $6, $7::jsonb, now(), now()
          )
        `,
        [
          campaignId,
          organizationId,
          payload.name,
          payload.sip_account_id || null,
          payload.audio_file || null,
          Number(payload.concurrent_calls || 1),
          JSON.stringify({
            legacy_audio_type: payload.audio_type || 'upload',
            legacy_tts_text: payload.tts_text || '',
            legacy_dtmf_digits: Number(payload.dtmf_digits || 1),
          }),
        ],
      );

      await client.query(
        `
          INSERT INTO campaign_sources (
            id,
            organization_id,
            campaign_id,
            source_type,
            criteria,
            created_at
          )
          VALUES ($1, $2, $3, 'manual', '{}'::jsonb, now())
        `,
        [randomUUID(), organizationId, campaignId],
      );

      for (const rawNumber of numbers) {
        const phone = normalizePhone(String(rawNumber || ''));
        if (phone.length < 5) {
          continue;
        }

        const contactId = await this.ensureCanonicalContact(client, phone);
        await client.query(
          `
            INSERT INTO campaign_targets (
              id,
              organization_id,
              campaign_id,
              contact_id,
              phone_e164,
              display_name,
              status,
              priority,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, '', 'pending', 100, now(), now())
            ON CONFLICT (campaign_id, phone_e164)
            DO NOTHING
          `,
          [randomUUID(), organizationId, campaignId, contactId, phone],
        );
      }
    });

    return { id: campaignId, message: 'Campaign created' };
  }

  async startCampaign(id: string, sipAccountId: string | null = null, contactListId: string | null = null) {
    await this.getCampaign(id);
    // If a SIP account is selected at run time, set it on the campaign before starting
    if (sipAccountId) {
      await this.databaseService.tx(async (client) => {
        await client.query(
          `UPDATE campaigns SET sip_trunk_id = $1, updated_at = now() WHERE id = $2`,
          [sipAccountId, id],
        );
      });
    }
    return this.campaignRuntimeService.startCampaign(id);
  }

  async pauseCampaign(id: string) {
    await this.getCampaign(id);
    return this.campaignRuntimeService.pauseCampaign(id);
  }

  async stopCampaign(id: string) {
    await this.getCampaign(id);
    return this.campaignRuntimeService.stopCampaign(id);
  }

  async deleteCampaign(id: string) {
    await this.getCampaign(id);

    await this.databaseService.tx(async (client) => {
      await client.query(`DELETE FROM cdrs WHERE campaign_id = $1`, [id]);
      await client.query(`DELETE FROM call_requests WHERE campaign_id = $1`, [id]);
      await client.query(`DELETE FROM campaign_runs WHERE campaign_id = $1`, [id]);
      await client.query(`DELETE FROM campaign_sources WHERE campaign_id = $1`, [id]);
      await client.query(`DELETE FROM campaign_targets WHERE campaign_id = $1`, [id]);
      await client.query(
        `
          DELETE FROM campaigns
          WHERE organization_id = $1
            AND id = $2
        `,
        [this.appContextService.getOrganizationId(), id],
      );
    });

    this.eventsGateway.emitCampaignUpdate({ id, status: 'deleted' });
    return { message: 'Deleted' };
  }

  async getCampaignResults(id: string) {
    await this.getCampaign(id);

    return this.databaseService.many<any>(
      `
        SELECT
          id,
          to_number_e164 AS phone_number,
          COALESCE(dtmf_summary->>'primary', '') AS dtmf,
          disposition AS status,
          COALESCE(answered_at, started_at) AS called_at,
          COALESCE(bill_duration_ms / 1000, total_duration_ms / 1000, 0) AS duration
        FROM cdrs
        WHERE organization_id = $1
          AND campaign_id = $2
        ORDER BY started_at DESC
      `,
      [this.appContextService.getOrganizationId(), id],
    );
  }

  async getCampaignDtmfSummary(id: string) {
    await this.getCampaign(id);

    return this.databaseService.many<any>(
      `
        SELECT
          dtmf_summary->>'primary' AS dtmf,
          COUNT(*)::int AS count
        FROM cdrs
        WHERE organization_id = $1
          AND campaign_id = $2
          AND dtmf_summary ? 'primary'
          AND COALESCE(dtmf_summary->>'primary', '') <> ''
        GROUP BY dtmf_summary->>'primary'
        ORDER BY dtmf_summary->>'primary'
      `,
      [this.appContextService.getOrganizationId(), id],
    );
  }

  async getCampaignContacts(id: string, page = 1, limit = 100) {
    await this.getCampaign(id);

    const safePage = Math.max(1, page || 1);
    const safeLimit = Math.min(500, Math.max(1, limit || 100));
    const offset = (safePage - 1) * safeLimit;

    return this.databaseService.many<any>(
      `
        SELECT
          phone_e164 AS phone_number,
          CASE
            WHEN status = 'dialing' THEN 'calling'
            WHEN status = 'answered' THEN 'answered'
            WHEN last_disposition = 'NO_DTMF' THEN 'no_dtmf'
            WHEN last_disposition = 'NOANSWER' THEN 'noanswer'
            WHEN last_disposition = 'BUSY' THEN 'busy'
            WHEN status = 'failed' THEN 'failed'
            ELSE status
          END AS status,
          last_disposition AS disposition,
          last_attempt_at AS called_at
        FROM campaign_targets
        WHERE campaign_id = $1
        ORDER BY created_at ASC
        LIMIT $2 OFFSET $3
      `,
      [id, safeLimit, offset],
    );
  }

  private async emitCampaignStats(id: string) {
    const campaign = await this.getCampaign(id);
    this.eventsGateway.emitCampaignStats({
      id,
      ...campaign.stats,
    });
  }

  private async ensureCanonicalContact(client: PoolClient, phone: string) {
    const existing = await client.query<{ id: string }>(
      `
        SELECT id
        FROM contacts
        WHERE organization_id = $1
          AND phone_e164 = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [this.appContextService.getOrganizationId(), phone],
    );

    if (existing.rows[0]) {
      return existing.rows[0].id;
    }

    const newId = randomUUID();
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
        VALUES ($1, $2, $3, '', 'active', 'campaign', $4::jsonb)
      `,
      [
        newId,
        this.appContextService.getOrganizationId(),
        phone,
        JSON.stringify({
          dialer_status: 'pending',
          attempts: 0,
          last_result: '-',
        }),
      ],
    );

    return newId;
  }
}
