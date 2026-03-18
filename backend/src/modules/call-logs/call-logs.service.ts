import { Injectable } from '@nestjs/common';
import { AppContextService } from '../../context/app-context.service';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class CallLogsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly appContextService: AppContextService,
  ) {}

  async getCallLogs(filters: { query?: string; status?: string; page: number; limit: number }) {
    const safePage = Math.max(1, filters.page || 1);
    const safeLimit = Math.min(500, Math.max(1, filters.limit || 50));
    const offset = (safePage - 1) * safeLimit;

    const params: any[] = [this.appContextService.getOrganizationId()];
    let whereSql = 'WHERE cdr.organization_id = $1';

    if (filters.query) {
      params.push(`%${filters.query}%`);
      whereSql += ` AND (cdr.to_number_e164 ILIKE $${params.length} OR COALESCE(c.name, '') ILIKE $${params.length})`;
    }

    if (filters.status) {
      params.push(filters.status.toLowerCase());
      whereSql += ` AND LOWER(cdr.disposition) = $${params.length}`;
    }

    const countRow = await this.databaseService.one<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM cdrs cdr
        LEFT JOIN campaigns c ON c.id = cdr.campaign_id
        ${whereSql}
      `,
      params,
    );

    params.push(safeLimit, offset);

    const results = await this.databaseService.many<any>(
      `
        SELECT
          cdr.id,
          cdr.to_number_e164 AS phone_number,
          c.name AS campaign_name,
          COALESCE(cdr.dtmf_summary->>'primary', '') AS dtmf,
          LOWER(cdr.disposition) AS status,
          COALESCE(cdr.bill_duration_ms / 1000, cdr.total_duration_ms / 1000, 0) AS duration,
          COALESCE(cdr.answered_at, cdr.started_at) AS called_at
        FROM cdrs cdr
        LEFT JOIN campaigns c ON c.id = cdr.campaign_id
        ${whereSql}
        ORDER BY cdr.started_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params,
    );

    return {
      total: Number(countRow?.total || 0),
      page: safePage,
      limit: safeLimit,
      results,
    };
  }
}
