require('dotenv').config();
const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const qs       = require('querystring');
const db       = require('../db');
const { v4: uuidv4 } = require('uuid');

const API_KEY    = process.env.MAGNUS_API_KEY    || '';
const API_SECRET = process.env.MAGNUS_API_SECRET || '';
const BASE_URL   = (process.env.MAGNUS_PUBLIC_URL || '').replace(/\/$/, '');

// ─── In-memory session store ──────────────────────────────────────────────────
// sessionId → { username, magnusId, credit, firstname, lastname }
const sessions = new Map();

// ─── Magnus API client ────────────────────────────────────────────────────────
async function magnusRequest(module, action, data = {}) {
  if (!API_KEY || !API_SECRET || !BASE_URL) {
    throw new Error('Magnus API not configured. Set MAGNUS_API_KEY, MAGNUS_API_SECRET, MAGNUS_PUBLIC_URL in .env');
  }

  const mt    = Date.now();
  const nonce = `${Math.floor(mt / 1000)}${String(mt % 1000).padStart(3, '0')}${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`;

  const payload = { module, action, nonce, ...data };
  const encoded = qs.stringify(payload);
  const sign    = crypto.createHmac('sha512', API_SECRET).update(encoded).digest('hex');

  const res = await fetch(`${BASE_URL}/index.php/${module}/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Key':  API_KEY,
      'Sign': sign,
    },
    body: encoded,
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Magnus returned non-JSON: ${text.slice(0, 200)}`);
  }
}

// ─── Session middleware ───────────────────────────────────────────────────────
function requireSession(req, res, next) {
  const sid = req.headers['x-magnus-session'] || req.query.session;
  if (!sid || !sessions.has(sid)) {
    return res.status(401).json({ error: 'Not authenticated with MagnusBilling' });
  }
  req.magnusSession = sessions.get(sid);
  next();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/magnus/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  try {
    const filter = JSON.stringify([{ type: 'string', field: 'username', value: username.trim(), comparison: 'eq' }]);
    const result = await magnusRequest('user', 'read', { filter, page: 1, start: 0, limit: 1 });

    if (!result.rows || !result.rows.length) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const u = result.rows[0];

    if (String(u.password || '').trim() !== String(password).trim()) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const sessionId = crypto.randomBytes(32).toString('hex');
    sessions.set(sessionId, {
      username:  u.username,
      magnusId:  String(u.id),
      credit:    u.credit,
      firstname: u.firstname || '',
      lastname:  u.lastname  || '',
      email:     u.email     || '',
    });

    // Auto-sync SIP accounts into local DB
    syncSipAccountsToLocal(u.id, u.username).catch(e => console.error('[Magnus] SIP sync error:', e.message));

    // Ensure user always has at least one default contact list
    ensureDefaultContactList(u.username).catch(e => console.error('[Magnus] Default list error:', e.message));

    res.json({
      sessionId,
      username:  u.username,
      magnusId:  u.id,
      credit:    parseFloat(u.credit || 0).toFixed(4),
      firstname: u.firstname || '',
      lastname:  u.lastname  || '',
    });
  } catch (err) {
    console.error('[Magnus] Login error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/magnus/logout
router.post('/logout', (req, res) => {
  const sid = req.headers['x-magnus-session'];
  if (sid) sessions.delete(sid);
  res.json({ success: true });
});

// GET /api/magnus/me  — refresh balance + profile
router.get('/me', requireSession, async (req, res) => {
  try {
    const { magnusId } = req.magnusSession;
    const filter = JSON.stringify([{ type: 'numeric', field: 'id', value: magnusId, comparison: 'eq' }]);
    const result = await magnusRequest('user', 'read', { filter, page: 1, start: 0, limit: 1 });

    if (!result.rows || !result.rows.length) return res.status(404).json({ error: 'User not found' });

    const u = result.rows[0];
    req.magnusSession.credit = u.credit;

    res.json({
      username:  u.username,
      firstname: u.firstname || '',
      lastname:  u.lastname  || '',
      credit:    parseFloat(u.credit || 0).toFixed(4),
      active:    u.active == 1,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/magnus/sip-accounts
router.get('/sip-accounts', requireSession, async (req, res) => {
  try {
    const { magnusId } = req.magnusSession;
    const filter = JSON.stringify([{ type: 'numeric', field: 'id_user', value: magnusId, comparison: 'eq' }]);
    const result = await magnusRequest('sip', 'read', { filter, start: 0, limit: 50 });

    const accounts = (result.rows || []).map(s => ({
      id:       s.id,
      username: s.name || s.defaultuser || s.username,
      host:     'sip.cyberxcalls.com',
      callerid: s.callerid || '',
      status:   s.lineStatus || 'unknown',
    }));

    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/magnus/sip-accounts/import  (manual or auto trigger)
router.post('/sip-accounts/import', requireSession, async (req, res) => {
  try {
    const { magnusId, username } = req.magnusSession;
    const added = await syncSipAccountsToLocal(magnusId, username);
    res.json({ success: true, imported: added });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/magnus/sip-accounts/sync  — silent background refresh (same as import, GET-friendly)
router.get('/sip-accounts/sync', requireSession, async (req, res) => {
  try {
    const { magnusId, username } = req.magnusSession;
    const added = await syncSipAccountsToLocal(magnusId, username);
    res.json({ success: true, synced: added });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/magnus/dids
router.get('/dids', requireSession, async (req, res) => {
  try {
    const { magnusId } = req.magnusSession;
    const filter = JSON.stringify([{ type: 'numeric', field: 'id_user', value: magnusId, comparison: 'eq' }]);
    const result = await magnusRequest('did', 'read', { filter, start: 0, limit: 50 });
    res.json(result.rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/magnus/dids/available
router.get('/dids/available', requireSession, async (req, res) => {
  try {
    const filter = JSON.stringify([{ type: 'numeric', field: 'id_user', value: 0, comparison: 'eq' }]);
    const result = await magnusRequest('did', 'read', { filter, start: 0, limit: 100 });
    res.json(result.rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/magnus/dids/buy
router.post('/dids/buy', requireSession, async (req, res) => {
  try {
    const { didId } = req.body || {};
    const { magnusId } = req.magnusSession;
    if (!didId) return res.status(400).json({ error: 'didId is required' });

    const result = await magnusRequest('did', 'buy', { id: didId, id_user: magnusId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/magnus/dids/create
router.post('/dids/create', requireSession, async (req, res) => {
  try {
    const { did, id_sip } = req.body || {};
    const { magnusId } = req.magnusSession;
    if (!did) return res.status(400).json({ error: 'did number is required' });

    const result = await magnusRequest('did', 'save', {
      id:           0,
      did:          did,
      id_user:      magnusId,
      id_sip:       id_sip || 0,
      voipnow_type: 'SIP',
      activated:    1,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Helper: ensure a default contact list exists for first-time users ────────
async function ensureDefaultContactList(accountId) {
  const existing = await db.get('SELECT id FROM contact_lists WHERE account_id = ?', [accountId]);
  if (!existing) {
    await db.run(
      'INSERT INTO contact_lists (account_id, list_name, description) VALUES (?, ?, ?)',
      [accountId, 'My Contacts', 'Default contact list']
    );
    console.log(`[Magnus] Created default contact list for account=${accountId}`);
  }
}

// ─── Helper: sync Magnus SIP accounts into local sip_accounts table ───────────
// Skips trunk peers: those with no password (secret) AND host not 'dynamic'
// (IP-auth trunks have no secret and use a fixed IP for authentication)
// The domain field stores the local Asterisk peer name (= SIP username),
// which is what dialer.js uses to build the channel: SIP/<domain>/<number>
async function syncSipAccountsToLocal(magnusId, username) {
  const filter = JSON.stringify([{ type: 'numeric', field: 'id_user', value: magnusId, comparison: 'eq' }]);
  const result = await magnusRequest('sip', 'read', { filter, start: 0, limit: 50 });

  const rows = result.rows || [];
  let added = 0;
  const accountId = String(username || '').trim();

  for (const s of rows) {
    const sipUsername = s.name || s.defaultuser || s.username || username;
    const secret      = (s.secret || '').trim();
    const host        = (s.host || '').trim().toLowerCase();

    // Skip trunks: no password AND host is an IP or non-"dynamic" hostname
    // A real SIP account always has a password (used by the softphone to register)
    const isTrunk = !secret && host !== 'dynamic' && host !== '';
    if (isTrunk) {
      console.log(`[Magnus] Skipping trunk peer: ${sipUsername} (host=${host}, no secret)`);
      continue;
    }

    const existing = await db.get(
      'SELECT id FROM sip_accounts WHERE username = ? AND account_id = ?',
      [sipUsername, accountId]
    );
    if (!existing) {
      await db.run(`
        INSERT INTO sip_accounts (id, account_id, name, username, password, domain, port, caller_id, channel_type, source)
        VALUES (?, ?, ?, ?, ?, ?, 5060, ?, 'SIP', 'magnus')
      `, [uuidv4(), accountId, `Magnus: ${sipUsername}`, sipUsername, secret, sipUsername, s.callerid || '']);
      added++;
    } else {
      await db.run(
        `UPDATE sip_accounts
         SET name = ?, password = COALESCE(NULLIF(?, ''), password),
             domain = ?, caller_id = COALESCE(NULLIF(?, ''), caller_id),
             channel_type = 'SIP', source = 'magnus'
         WHERE id = ? AND account_id = ?`,
        [`Magnus: ${sipUsername}`, secret, sipUsername, s.callerid || '', existing.id, accountId]
      );
    }
  }

  return added;
}

module.exports = { router, requireSession, sessions, magnusRequest };
