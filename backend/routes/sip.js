const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const ami = require('../ami');
const { requireAccount } = require('../account');

router.use(requireAccount);

// GET all SIP accounts — excludes trunk peers (no password = IP-auth trunk, not a softphone account)
router.get('/', async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT * FROM sip_accounts
       WHERE account_id = ? AND password IS NOT NULL AND password != ''
       ORDER BY created_at DESC`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET AMI connection status
router.get('/ami/status', (req, res) => {
  res.json({ connected: ami.getStatus() });
});

// POST create SIP account
router.post('/', async (req, res) => {
  try {
    const { name, username, password, domain, port, caller_id, channel_type } = req.body;
    if (!name || !domain) return res.status(400).json({ error: 'name and domain are required' });

    const id = uuidv4();
    await db.run(`
      INSERT INTO sip_accounts (id, account_id, name, username, password, domain, port, caller_id, channel_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, req.accountId, name, username || '', password || '', domain, port || 5060, caller_id || '', channel_type || 'PJSIP']);

    res.json(await db.get('SELECT * FROM sip_accounts WHERE id = ? AND account_id = ?', [id, req.accountId]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT update SIP account
router.put('/:id', async (req, res) => {
  try {
    const { name, username, password, domain, port, caller_id, channel_type } = req.body;
    const existing = await db.get('SELECT * FROM sip_accounts WHERE id = ? AND account_id = ?', [req.params.id, req.accountId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await db.run(`
      UPDATE sip_accounts SET
        name         = COALESCE(?, name),
        username     = COALESCE(?, username),
        password     = COALESCE(?, password),
        domain       = COALESCE(?, domain),
        port         = COALESCE(?, port),
        caller_id    = COALESCE(?, caller_id),
        channel_type = COALESCE(?, channel_type)
      WHERE id = ? AND account_id = ?
    `, [name, username, password, domain, port, caller_id, channel_type, req.params.id, req.accountId]);

    res.json(await db.get('SELECT * FROM sip_accounts WHERE id = ? AND account_id = ?', [req.params.id, req.accountId]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE SIP account
router.delete('/:id', async (req, res) => {
  try {
    const existing = await db.get('SELECT * FROM sip_accounts WHERE id = ? AND account_id = ?', [req.params.id, req.accountId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await db.run('DELETE FROM sip_accounts WHERE id = ? AND account_id = ?', [req.params.id, req.accountId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
