require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.PG_HOST     || 'localhost',
  port:     parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'autodialer',
  user:     process.env.PG_USER     || 'autodialer',
  password: process.env.PG_PASSWORD || '',
  max: 10,
});

// Convert ? placeholders → $1, $2, … (SQLite → PostgreSQL)
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// undefined → null so PostgreSQL doesn't complain
function norm(params) {
  return (params || []).map(p => (p === undefined ? null : p));
}

const db = {
  pool,

  /** Return first row or null */
  async get(sql, params = []) {
    const { rows } = await pool.query(toPg(sql), norm(params));
    return rows[0] || null;
  },

  /** Return all rows */
  async all(sql, params = []) {
    const { rows } = await pool.query(toPg(sql), norm(params));
    return rows;
  },

  /** Execute and return full pg Result (access .rows, .rowCount) */
  async run(sql, params = []) {
    return pool.query(toPg(sql), norm(params));
  },

  /** Run fn(client) inside a transaction */
  async withTransaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
};

// ─── Schema bootstrap (runs once on start) ────────────────────────────────────
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sip_accounts (
      id          TEXT PRIMARY KEY,
      account_id  TEXT DEFAULT '',
      name        TEXT NOT NULL,
      username    TEXT NOT NULL DEFAULT '',
      password    TEXT NOT NULL DEFAULT '',
      domain      TEXT NOT NULL,
      port        INTEGER DEFAULT 5060,
      caller_id   TEXT DEFAULT '',
      channel_type TEXT DEFAULT 'PJSIP',
      is_active   INTEGER DEFAULT 1,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id               TEXT PRIMARY KEY,
      account_id       TEXT DEFAULT '',
      flow_type        TEXT DEFAULT 'campaign',
      source_contact_list_id INTEGER DEFAULT NULL,
      name             TEXT NOT NULL,
      sip_account_id   TEXT NOT NULL,
      audio_file       TEXT DEFAULT NULL,
      audio_type       TEXT DEFAULT 'upload',
      ivr_definition   TEXT DEFAULT '',
      tts_text         TEXT DEFAULT '',
      tts_language     TEXT DEFAULT 'en-US',
      tts_voice_type   TEXT DEFAULT 'female',
      dtmf_digits      INTEGER DEFAULT 1,
      concurrent_calls INTEGER DEFAULT 2,
      call_timeout     INTEGER DEFAULT 30,
      retry_attempts   INTEGER DEFAULT 0,
      transfer_on_dtmf INTEGER DEFAULT 0,
      transfer_dest    TEXT DEFAULT '',
      status           TEXT DEFAULT 'pending',
      total_numbers    INTEGER DEFAULT 0,
      dialed           INTEGER DEFAULT 0,
      answered         INTEGER DEFAULT 0,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id           TEXT PRIMARY KEY,
      account_id   TEXT DEFAULT '',
      portal_contact_id TEXT DEFAULT NULL,
      campaign_id  TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      status       TEXT DEFAULT 'pending',
      attempts     INTEGER DEFAULT 0,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );

    CREATE TABLE IF NOT EXISTS call_results (
      id           TEXT PRIMARY KEY,
      account_id   TEXT DEFAULT '',
      campaign_id  TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      dtmf         TEXT DEFAULT '',
      status       TEXT NOT NULL,
      duration     INTEGER DEFAULT 0,
      called_at    TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );

    CREATE TABLE IF NOT EXISTS contact_lists (
      id          SERIAL PRIMARY KEY,
      account_id  TEXT DEFAULT '',
      list_name   TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agents (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      username    TEXT NOT NULL UNIQUE,
      password    TEXT NOT NULL,
      caller_id   TEXT DEFAULT '',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS portal_contacts (
      id               TEXT PRIMARY KEY,
      account_id       TEXT DEFAULT '',
      contact_list_id  INTEGER,
      phone_number     TEXT NOT NULL,
      contact_name     TEXT DEFAULT '',
      status           TEXT DEFAULT 'pending',
      attempts         INTEGER DEFAULT 0,
      last_result      TEXT DEFAULT '-',
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (contact_list_id) REFERENCES contact_lists(id)
    );

    CREATE TABLE IF NOT EXISTS queue_settings (
      id           INT DEFAULT 1 PRIMARY KEY,
      strategy     TEXT DEFAULT 'ringall',
      agent_timeout INT DEFAULT 15,
      max_wait     INT DEFAULT 120,
      moh_file     TEXT DEFAULT ''
    );
  `);

  // Idempotent column / row additions
  await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS in_queue BOOLEAN DEFAULT true`);
  await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS account_id TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE sip_accounts ADD COLUMN IF NOT EXISTS account_id TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE sip_accounts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'external'`);
  // Mark existing Magnus-synced accounts (name starts with "Magnus: ")
  await pool.query(`UPDATE sip_accounts SET source = 'magnus' WHERE source = 'external' AND name LIKE 'Magnus: %'`);
  await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS account_id TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS flow_type TEXT DEFAULT 'campaign'`);
  await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS source_contact_list_id INTEGER DEFAULT NULL`);
  await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ivr_definition TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS tts_voice_type TEXT DEFAULT 'female'`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS account_id TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS portal_contact_id TEXT DEFAULT NULL`);
  await pool.query(`ALTER TABLE call_results ADD COLUMN IF NOT EXISTS account_id TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE contact_lists ADD COLUMN IF NOT EXISTS account_id TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE portal_contacts ADD COLUMN IF NOT EXISTS account_id TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE call_results ADD COLUMN IF NOT EXISTS caller_id TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE call_results ADD COLUMN IF NOT EXISTS cause_txt TEXT DEFAULT ''`);
  await pool.query(`
    UPDATE campaigns
    SET flow_type = 'campaign'
    WHERE COALESCE(flow_type, '') = ''
  `);
  await pool.query(`
    UPDATE campaigns
    SET tts_voice_type = 'female'
    WHERE COALESCE(tts_voice_type, '') = ''
       OR LOWER(COALESCE(tts_voice_type, '')) IN ('neural2', 'wavenet')
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sip_accounts_account_id ON sip_accounts(account_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_campaigns_account_id ON campaigns(account_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_campaigns_flow_type ON campaigns(account_id, flow_type, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id, campaign_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_contacts_portal_contact_id ON contacts(portal_contact_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_call_results_account_id ON call_results(account_id, campaign_id, called_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_contact_lists_account_id ON contact_lists(account_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_portal_contacts_account_id ON portal_contacts(account_id, contact_list_id, created_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS queue_config (
      account_id    TEXT PRIMARY KEY,
      strategy      TEXT DEFAULT 'ringall',
      agent_timeout INT DEFAULT 15,
      max_wait      INT DEFAULT 120,
      moh_file      TEXT DEFAULT ''
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id           TEXT PRIMARY KEY,
      account_id   TEXT NOT NULL,
      plan_name    TEXT NOT NULL,
      plan_days    INTEGER NOT NULL,
      price_eur    DECIMAL(10,2) NOT NULL,
      price_inr    DECIMAL(10,4) NOT NULL,
      status       TEXT DEFAULT 'active',
      activated_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at   TIMESTAMPTZ NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_account_id ON subscriptions(account_id, expires_at DESC)`);
  await pool.query(`
    INSERT INTO queue_settings (id, strategy, agent_timeout, max_wait, moh_file)
    VALUES (1, 'ringall', 15, 120, '')
    ON CONFLICT (id) DO NOTHING
  `);

  // Backfill child ownership where a parent already has an account_id.
  await pool.query(`
    UPDATE contacts AS c
    SET account_id = p.account_id
    FROM campaigns AS p
    WHERE c.campaign_id = p.id
      AND COALESCE(c.account_id, '') = ''
      AND COALESCE(p.account_id, '') <> ''
  `);
  await pool.query(`
    UPDATE call_results AS r
    SET account_id = p.account_id
    FROM campaigns AS p
    WHERE r.campaign_id = p.id
      AND COALESCE(r.account_id, '') = ''
      AND COALESCE(p.account_id, '') <> ''
  `);
  await pool.query(`
    UPDATE portal_contacts AS pc
    SET account_id = cl.account_id
    FROM contact_lists AS cl
    WHERE pc.contact_list_id = cl.id
      AND COALESCE(pc.account_id, '') = ''
      AND COALESCE(cl.account_id, '') <> ''
  `);
  await pool.query(`
    WITH unique_contacts AS (
      SELECT account_id, phone_number, MIN(id) AS portal_contact_id
      FROM portal_contacts
      WHERE COALESCE(account_id, '') <> ''
      GROUP BY account_id, phone_number
      HAVING COUNT(*) = 1
    )
    UPDATE contacts AS c
    SET portal_contact_id = uc.portal_contact_id
    FROM unique_contacts AS uc
    WHERE COALESCE(c.portal_contact_id, '') = ''
      AND COALESCE(c.account_id, '') <> ''
      AND c.account_id = uc.account_id
      AND c.phone_number = uc.phone_number
  `);
  await pool.query(`
    WITH inferred_lists AS (
      SELECT c.campaign_id, MIN(pc.contact_list_id) AS contact_list_id
      FROM contacts AS c
      JOIN portal_contacts AS pc
        ON pc.id = c.portal_contact_id
       AND pc.account_id = c.account_id
      WHERE pc.contact_list_id IS NOT NULL
      GROUP BY c.campaign_id
      HAVING COUNT(DISTINCT pc.contact_list_id) = 1
    )
    UPDATE campaigns AS c
    SET source_contact_list_id = il.contact_list_id
    FROM inferred_lists AS il
    WHERE c.id = il.campaign_id
      AND c.source_contact_list_id IS NULL
  `);
  await pool.query(`
    WITH latest_results AS (
      SELECT DISTINCT ON (c.portal_contact_id)
        c.portal_contact_id,
        c.attempts,
        cr.status,
        cr.dtmf,
        cr.cause_txt,
        cr.called_at
      FROM contacts AS c
      JOIN call_results AS cr
        ON cr.account_id = c.account_id
       AND cr.campaign_id = c.campaign_id
       AND cr.phone_number = c.phone_number
      WHERE COALESCE(c.portal_contact_id, '') <> ''
      ORDER BY c.portal_contact_id, cr.called_at DESC
    )
    UPDATE portal_contacts AS pc
    SET status = CASE
          WHEN lr.status = 'answered' THEN 'called'
          ELSE lr.status
        END,
        attempts = GREATEST(COALESCE(pc.attempts, 0), COALESCE(lr.attempts, 0)),
        last_result = CASE
          WHEN lr.status = 'answered' AND COALESCE(lr.dtmf, '') <> '' THEN 'Answered + DTMF'
          WHEN lr.status = 'answered' THEN 'Answered (No DTMF)'
          WHEN COALESCE(lr.cause_txt, '') <> '' THEN lr.cause_txt
          ELSE INITCAP(REPLACE(COALESCE(lr.status, '-'), '-', ' '))
        END,
        updated_at = GREATEST(pc.updated_at, lr.called_at)
    FROM latest_results AS lr
    WHERE pc.id = lr.portal_contact_id
  `);

  // Remove legacy shared records that were created before per-user ownership existed.
  const cleanupResults = [];
  cleanupResults.push(
    ['call_results', await pool.query(`
      DELETE FROM call_results AS r
      USING campaigns AS c
      WHERE r.campaign_id = c.id
        AND COALESCE(c.account_id, '') = ''
    `)],
    ['contacts', await pool.query(`
      DELETE FROM contacts AS c
      USING campaigns AS p
      WHERE c.campaign_id = p.id
        AND COALESCE(p.account_id, '') = ''
    `)],
    ['portal_contacts', await pool.query(`
      DELETE FROM portal_contacts AS pc
      USING contact_lists AS cl
      WHERE pc.contact_list_id = cl.id
        AND COALESCE(cl.account_id, '') = ''
    `)],
    ['campaigns', await pool.query(`DELETE FROM campaigns WHERE COALESCE(account_id, '') = ''`)],
    ['contact_lists', await pool.query(`DELETE FROM contact_lists WHERE COALESCE(account_id, '') = ''`)],
    ['sip_accounts', await pool.query(`DELETE FROM sip_accounts WHERE COALESCE(account_id, '') = ''`)]
  );

  const removed = cleanupResults.filter(([, result]) => result.rowCount > 0);
  if (removed.length) {
    console.log(
      '[DB] Removed legacy shared data:',
      removed.map(([table, result]) => `${table}=${result.rowCount}`).join(', ')
    );
  }

  console.log('[DB] PostgreSQL schema ready');
}

db.ready = pool.connect()
  .then(client => { client.release(); return initSchema(); })
  .catch(err => {
    console.error('[DB] Connection failed:', err.message);
    process.exit(1);
  });

module.exports = db;
