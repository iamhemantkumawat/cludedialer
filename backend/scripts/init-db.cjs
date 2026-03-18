#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function log(message) {
  console.log(`[db:init] ${message}`);
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function getTargetConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }

  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'cludedialer_portal',
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD || undefined,
  };
}

function getDatabaseName(config) {
  if (config.connectionString) {
    const url = new URL(config.connectionString);
    return decodeURIComponent(url.pathname.replace(/^\//, '')) || 'cludedialer_portal';
  }

  return config.database || 'cludedialer_portal';
}

function withDatabase(config, database) {
  if (config.connectionString) {
    const url = new URL(config.connectionString);
    url.pathname = `/${database}`;
    return { connectionString: url.toString() };
  }

  return {
    ...config,
    database,
  };
}

async function connectClient(config) {
  const client = new Client(config);
  await client.connect();
  return client;
}

async function ensureDatabase(adminClient, databaseName) {
  const existing = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
  if (existing.rowCount > 0) {
    log(`Database ${databaseName} already exists.`);
    return;
  }

  await adminClient.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  log(`Created database ${databaseName}.`);
}

async function applySchema(client) {
  const schemaCheck = await client.query("SELECT to_regclass('public.organizations') AS table_name");
  if (schemaCheck.rows[0]?.table_name) {
    log('Schema already present, skipping DDL apply.');
    return;
  }

  const schemaPath = path.join(__dirname, '..', '..', 'docs', 'architecture', 'postgresql-schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await client.query(schemaSql);
  log('Applied PostgreSQL schema.');
}

async function seedPermissions(client) {
  const permissions = [
    ['dashboard.read', 'dashboard', 'View dashboard', 'Read organization dashboard metrics'],
    ['sip.read', 'sip', 'View SIP', 'Read SIP trunks and live registration status'],
    ['sip.write', 'sip', 'Manage SIP', 'Create, update, and delete SIP trunks'],
    ['contacts.read', 'contacts', 'View contacts', 'Read contact lists and contacts'],
    ['contacts.write', 'contacts', 'Manage contacts', 'Create, import, update, and delete contacts'],
    ['audio.read', 'audio', 'View audio', 'Read audio assets and playback metadata'],
    ['audio.write', 'audio', 'Manage audio', 'Upload, generate, and delete audio assets'],
    ['campaigns.read', 'campaigns', 'View campaigns', 'Read campaigns and campaign results'],
    ['campaigns.write', 'campaigns', 'Manage campaigns', 'Create, update, start, pause, and stop campaigns'],
    ['calls.read', 'calls', 'View call logs', 'Read CDRs, call results, and call history'],
    ['calls.execute', 'calls', 'Make calls', 'Launch outbound calls from portal or API'],
    ['billing.read', 'billing', 'View billing', 'Read balances, recharges, and billing history'],
    ['billing.write', 'billing', 'Manage billing', 'Create recharges and account adjustments'],
    ['integrations.read', 'integrations', 'View integrations', 'Read Magnus and webhook integrations'],
    ['integrations.write', 'integrations', 'Manage integrations', 'Manage Magnus connections and webhook endpoints'],
    ['api.read', 'api', 'View API access', 'Read API keys and API activity'],
    ['api.write', 'api', 'Manage API access', 'Create or revoke API keys and webhook endpoints'],
    ['settings.read', 'settings', 'View settings', 'Read organization settings and audit logs'],
    ['settings.write', 'settings', 'Manage settings', 'Update organization settings and roles'],
  ];

  for (const [code, category, name, description] of permissions) {
    await client.query(
      `
        INSERT INTO permissions (code, category, name, description)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (code)
        DO UPDATE SET
          category = EXCLUDED.category,
          name = EXCLUDED.name,
          description = EXCLUDED.description
      `,
      [code, category, name, description],
    );
  }

  log(`Seeded ${permissions.length} permission records.`);
}

async function ensureBootstrapState(client) {
  const orgSlug = process.env.APP_ORG_SLUG || 'legacy-autodialer';
  const orgName = process.env.APP_ORG_NAME || 'Legacy AutoDialer';
  const timezone = process.env.APP_DEFAULT_TIMEZONE || 'Asia/Kolkata';
  const currency = process.env.APP_DEFAULT_CURRENCY || 'INR';
  const userEmail = process.env.APP_BOOTSTRAP_USER_EMAIL || 'admin@cyberxcalls.local';
  const userName = process.env.APP_BOOTSTRAP_USER_NAME || 'Hemant';

  await client.query('BEGIN');

  try {
    const orgResult = await client.query(
      `
        INSERT INTO organizations (slug, name, timezone, currency_code, plan_code, settings)
        VALUES ($1, $2, $3, $4, 'local-dev', '{}'::jsonb)
        ON CONFLICT (slug)
        DO UPDATE SET
          name = EXCLUDED.name,
          timezone = EXCLUDED.timezone,
          currency_code = EXCLUDED.currency_code,
          updated_at = now()
        RETURNING id
      `,
      [orgSlug, orgName, timezone, currency],
    );
    const organizationId = orgResult.rows[0].id;

    const userResult = await client.query(
      `
        INSERT INTO users (email, full_name, password_hash, status)
        VALUES ($1, $2, 'local-dev-auth-disabled', 'active')
        ON CONFLICT (email)
        DO UPDATE SET
          full_name = EXCLUDED.full_name,
          updated_at = now()
        RETURNING id
      `,
      [userEmail, userName],
    );
    const userId = userResult.rows[0].id;

    const roleResult = await client.query(
      `
        INSERT INTO organization_roles (organization_id, code, name, is_system)
        VALUES ($1, 'owner', 'Owner', true)
        ON CONFLICT (organization_id, code)
        DO UPDATE SET
          name = EXCLUDED.name,
          updated_at = now()
        RETURNING id
      `,
      [organizationId],
    );
    const roleId = roleResult.rows[0].id;

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
        DO UPDATE SET
          role_id = EXCLUDED.role_id,
          status = 'active',
          updated_at = now()
      `,
      [organizationId, userId, roleId],
    );

    const ownerPermissions = await client.query(
      "SELECT code FROM permissions WHERE category IN ('dashboard', 'sip', 'contacts', 'audio', 'campaigns', 'calls', 'billing', 'integrations', 'api', 'settings')",
    );

    for (const permission of ownerPermissions.rows) {
      await client.query(
        `
          INSERT INTO organization_role_permissions (role_id, permission_code)
          VALUES ($1, $2)
          ON CONFLICT (role_id, permission_code)
          DO NOTHING
        `,
        [roleId, permission.code],
      );
    }

    await client.query(
      `
        INSERT INTO wallets (organization_id, currency_code, balance)
        VALUES ($1, $2, 0)
        ON CONFLICT (organization_id, currency_code)
        DO NOTHING
      `,
      [organizationId, currency],
    );

    await client.query(
      `
        INSERT INTO contact_lists (organization_id, name, description, source, metadata)
        VALUES ($1, 'Default', 'Default contact list', 'system', '{"bootstrapped": true}'::jsonb)
        ON CONFLICT DO NOTHING
      `,
      [organizationId],
    );

    await client.query('COMMIT');
    log(`Bootstrap organization ready: ${orgSlug}`);
    return { organizationId, userId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const targetConfig = getTargetConfig();
  const databaseName = getDatabaseName(targetConfig);
  const adminConfig = withDatabase(targetConfig, 'postgres');

  const adminClient = await connectClient(adminConfig);
  try {
    await ensureDatabase(adminClient, databaseName);
  } finally {
    await adminClient.end();
  }

  const targetClient = await connectClient(targetConfig);
  try {
    await applySchema(targetClient);
    await seedPermissions(targetClient);
    await ensureBootstrapState(targetClient);
    log('Database initialization complete.');
  } finally {
    await targetClient.end();
  }
}

main().catch((error) => {
  console.error(`[db:init] ${error.stack || error.message}`);
  process.exit(1);
});
