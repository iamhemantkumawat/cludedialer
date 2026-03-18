import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { AppContextService } from '../context/app-context.service';
import { CampaignRuntimeService } from '../modules/campaigns/campaign-runtime.service';

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly appContextService: AppContextService,
    private readonly campaignRuntimeService: CampaignRuntimeService,
  ) {}

  async onApplicationBootstrap() {
    const orgSlug = this.configService.get<string>('APP_ORG_SLUG', 'legacy-autodialer');
    const orgName = this.configService.get<string>('APP_ORG_NAME', 'Legacy AutoDialer');
    const timezone = this.configService.get<string>('APP_DEFAULT_TIMEZONE', 'Asia/Kolkata');
    const currency = this.configService.get<string>('APP_DEFAULT_CURRENCY', 'INR');
    const userEmail = this.configService.get<string>('APP_BOOTSTRAP_USER_EMAIL', 'admin@cyberxcalls.local');
    const userName = this.configService.get<string>('APP_BOOTSTRAP_USER_NAME', 'Hemant');

    const { organizationId, userId } = await this.databaseService.tx(async (client) => {
      const organization = await this.ensureOrganization(client, orgSlug, orgName, timezone, currency);
      const user = await this.ensureBootstrapUser(client, userEmail, userName);
      const role = await this.ensureOwnerRole(client, organization.id);

      await client.query(
        `
          INSERT INTO organization_memberships (
            organization_id,
            user_id,
            role_id,
            status,
            joined_at
          )
          VALUES ($1, $2, $3, 'active', now())
          ON CONFLICT (organization_id, user_id)
          DO UPDATE SET role_id = EXCLUDED.role_id, status = 'active', updated_at = now()
        `,
        [organization.id, user.id, role.id],
      );

      await client.query(
        `
          INSERT INTO wallets (organization_id, currency_code, balance)
          VALUES ($1, $2, 0)
          ON CONFLICT (organization_id, currency_code)
          DO NOTHING
        `,
        [organization.id, currency],
      );

      await client.query(
        `
          INSERT INTO contact_lists (organization_id, name, description, source)
          VALUES ($1, 'Default', 'Default contact list', 'system')
          ON CONFLICT DO NOTHING
        `,
        [organization.id],
      );

      return {
        organizationId: organization.id as string,
        userId: user.id as string,
      };
    });

    this.appContextService.setOrganizationId(organizationId);
    this.appContextService.setBootstrapUserId(userId);
    await this.campaignRuntimeService.initializeRuntime();
    this.logger.log(`Bootstrap context ready for organization ${orgSlug}`);
  }

  private async ensureOrganization(
    client: PoolClient,
    slug: string,
    name: string,
    timezone: string,
    currency: string,
  ) {
    const result = await client.query(
      `
        INSERT INTO organizations (slug, name, timezone, currency_code, plan_code, settings)
        VALUES ($1, $2, $3, $4, 'local-dev', '{}'::jsonb)
        ON CONFLICT (slug)
        DO UPDATE SET
          name = EXCLUDED.name,
          timezone = EXCLUDED.timezone,
          currency_code = EXCLUDED.currency_code,
          updated_at = now()
        RETURNING id, slug
      `,
      [slug, name, timezone, currency],
    );

    return result.rows[0];
  }

  private async ensureBootstrapUser(client: PoolClient, email: string, name: string) {
    const result = await client.query(
      `
        INSERT INTO users (email, full_name, password_hash, status)
        VALUES ($1, $2, 'local-dev-auth-disabled', 'active')
        ON CONFLICT (email)
        DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = now()
        RETURNING id, email
      `,
      [email, name],
    );

    return result.rows[0];
  }

  private async ensureOwnerRole(client: PoolClient, organizationId: string) {
    const result = await client.query(
      `
        INSERT INTO organization_roles (organization_id, code, name, is_system)
        VALUES ($1, 'owner', 'Owner', true)
        ON CONFLICT (organization_id, code)
        DO UPDATE SET name = EXCLUDED.name, updated_at = now()
        RETURNING id
      `,
      [organizationId],
    );

    return result.rows[0];
  }
}
