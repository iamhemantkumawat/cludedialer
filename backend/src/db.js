const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'autodialer.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS sip_accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    domain TEXT NOT NULL,
    port INTEGER DEFAULT 5060,
    caller_id TEXT DEFAULT '',
    is_active INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sip_account_id TEXT NOT NULL,
    audio_file TEXT,
    audio_type TEXT DEFAULT 'upload',
    tts_text TEXT DEFAULT '',
    dtmf_digits INTEGER DEFAULT 1,
    concurrent_calls INTEGER DEFAULT 2,
    status TEXT DEFAULT 'pending',
    total_numbers INTEGER DEFAULT 0,
    dialed INTEGER DEFAULT 0,
    answered INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
  );

  CREATE TABLE IF NOT EXISTS call_results (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    dtmf TEXT DEFAULT '',
    status TEXT NOT NULL,
    duration INTEGER DEFAULT 0,
    called_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
  );

  CREATE TABLE IF NOT EXISTS contact_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sip_account_id TEXT DEFAULT 'default',
    list_name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS portal_contacts (
    id TEXT PRIMARY KEY,
    sip_account_id TEXT DEFAULT 'default',
    contact_list_id INTEGER,
    phone_number TEXT NOT NULL,
    contact_name TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    last_result TEXT DEFAULT '-',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (contact_list_id) REFERENCES contact_lists(id)
  );
`);

// Add duration column to call_results if it doesn't exist yet (migration)
try {
  db.exec(`ALTER TABLE call_results ADD COLUMN duration INTEGER DEFAULT 0`);
} catch (e) {
  // Column already exists, ignore
}

module.exports = db;
