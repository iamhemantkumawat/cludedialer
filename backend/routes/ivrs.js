const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const dialer = require('../dialer');
const { requireAccount } = require('../account');
const { rebuildIvrDialplan, serializeIvrDefinition } = require('../ivr');

router.use(requireAccount);

router.get('/', async (req, res) => {
  try {
    const ivrs = await db.all("SELECT * FROM campaigns WHERE account_id = ? AND flow_type = 'ivr' ORDER BY created_at DESC", [req.accountId]);
    res.json(ivrs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const ivr = await db.get("SELECT * FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'ivr'", [req.params.id, req.accountId]);
    if (!ivr) return res.status(404).json({ error: 'Not found' });
    res.json(ivr);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/stats', async (req, res) => {
  try {
    const ivr = await db.get("SELECT * FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'ivr'", [req.params.id, req.accountId]);
    if (!ivr) return res.status(404).json({ error: 'Not found' });

    const contactStats = await db.get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'calling'   THEN 1 ELSE 0 END) as calling,
        SUM(CASE WHEN status = 'answered'  THEN 1 ELSE 0 END) as answered,
        SUM(CASE WHEN status = 'busy'      THEN 1 ELSE 0 END) as busy,
        SUM(CASE WHEN status = 'no-answer' THEN 1 ELSE 0 END) as no_answer,
        SUM(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END) as failed
      FROM contacts WHERE campaign_id = ? AND account_id = ?
    `, [req.params.id, req.accountId]);

    const dtmfStats = await db.all(`
      SELECT dtmf, COUNT(*) as count
      FROM call_results WHERE campaign_id = ? AND account_id = ? AND dtmf != ''
      GROUP BY dtmf ORDER BY count DESC
    `, [req.params.id, req.accountId]);

    res.json({ ivr, contacts: contactStats, dtmf: dtmfStats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const {
      name,
      sip_account_id,
      concurrent_calls,
      call_timeout,
      retry_attempts,
      ivr_definition,
    } = req.body || {};

    if (!name || !sip_account_id) return res.status(400).json({ error: 'name and sip_account_id are required' });

    const sip = await db.get('SELECT id FROM sip_accounts WHERE id = ? AND account_id = ?', [sip_account_id, req.accountId]);
    if (!sip) return res.status(400).json({ error: 'SIP account not found' });

    const id = uuidv4();
    await db.run(`
      INSERT INTO campaigns (
        id, account_id, flow_type, name, sip_account_id, audio_file, audio_type, ivr_definition,
        tts_text, tts_language, tts_voice_type, dtmf_digits, concurrent_calls, call_timeout,
        retry_attempts, transfer_on_dtmf, transfer_dest
      )
      VALUES (?, ?, 'ivr', ?, ?, NULL, 'none', ?, '', 'en-US', 'female', 1, ?, ?, ?, 0, '')
    `, [
      id,
      req.accountId,
      name.trim(),
      sip_account_id,
      serializeIvrDefinition(ivr_definition),
      concurrent_calls || 2,
      call_timeout || 30,
      retry_attempts || 0,
    ]);

    await rebuildIvrDialplan();
    res.json(await db.get("SELECT * FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'ivr'", [id, req.accountId]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await db.get("SELECT * FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'ivr'", [req.params.id, req.accountId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.status === 'running') return res.status(400).json({ error: 'Stop or pause IVR before editing' });

    const {
      name,
      sip_account_id,
      concurrent_calls,
      call_timeout,
      retry_attempts,
      ivr_definition,
    } = req.body || {};

    if (sip_account_id) {
      const sip = await db.get('SELECT id FROM sip_accounts WHERE id = ? AND account_id = ?', [sip_account_id, req.accountId]);
      if (!sip) return res.status(400).json({ error: 'SIP account not found' });
    }

    await db.run(`
      UPDATE campaigns SET
        name = COALESCE(?, name),
        sip_account_id = COALESCE(?, sip_account_id),
        ivr_definition = COALESCE(?, ivr_definition),
        concurrent_calls = COALESCE(?, concurrent_calls),
        call_timeout = COALESCE(?, call_timeout),
        retry_attempts = COALESCE(?, retry_attempts)
      WHERE id = ? AND account_id = ? AND flow_type = 'ivr'
    `, [
      name ? name.trim() : null,
      sip_account_id || null,
      ivr_definition !== undefined ? serializeIvrDefinition(ivr_definition) : null,
      concurrent_calls,
      call_timeout,
      retry_attempts,
      req.params.id,
      req.accountId,
    ]);

    await rebuildIvrDialplan();
    res.json(await db.get("SELECT * FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'ivr'", [req.params.id, req.accountId]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await db.get("SELECT * FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'ivr'", [req.params.id, req.accountId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.status === 'running') return res.status(400).json({ error: 'Stop IVR before deleting' });

    await db.run('DELETE FROM call_results WHERE campaign_id = ? AND account_id = ?', [req.params.id, req.accountId]);
    await db.run('DELETE FROM contacts WHERE campaign_id = ? AND account_id = ?', [req.params.id, req.accountId]);
    await db.run("DELETE FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'ivr'", [req.params.id, req.accountId]);
    await rebuildIvrDialplan();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/start', async (req, res) => {
  const { contact_list_id, sip_account_id } = req.body || {};
  const ivrId = req.params.id;

  try {
    const ivr = await db.get("SELECT * FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'ivr'", [ivrId, req.accountId]);
    if (!ivr) return res.status(404).json({ error: 'IVR not found' });

    if (contact_list_id) {
      if (ivr.status === 'running') return res.status(400).json({ error: 'Stop the IVR before loading a new contact list' });

      const contactList = await db.get('SELECT id FROM contact_lists WHERE id = ? AND account_id = ?', [contact_list_id, req.accountId]);
      if (!contactList) return res.status(404).json({ error: 'Contact list not found' });

      const listContacts = await db.all(
        'SELECT * FROM portal_contacts WHERE contact_list_id = ? AND account_id = ?',
        [contact_list_id, req.accountId]
      );
      if (!listContacts.length) return res.status(400).json({ error: 'Selected contact list is empty' });

      await db.run('DELETE FROM contacts WHERE campaign_id = ? AND account_id = ?', [ivrId, req.accountId]);
      await db.withTransaction(async (client) => {
        for (const row of listContacts) {
          await client.query(
            'INSERT INTO contacts (id, account_id, portal_contact_id, campaign_id, phone_number, attempts) VALUES ($1, $2, $3, $4, $5, 0)',
            [uuidv4(), req.accountId, row.id, ivrId, row.phone_number]
          );
        }
      });

      if (sip_account_id) {
        const sip = await db.get('SELECT id FROM sip_accounts WHERE id = ? AND account_id = ?', [sip_account_id, req.accountId]);
        if (!sip) return res.status(400).json({ error: 'SIP account not found' });
        await db.run(
          "UPDATE campaigns SET sip_account_id = ?, source_contact_list_id = ?, total_numbers = ?, dialed = 0, answered = 0, status = 'pending' WHERE id = ? AND account_id = ? AND flow_type = 'ivr'",
          [sip_account_id, contact_list_id, listContacts.length, ivrId, req.accountId]
        );
      } else {
        await db.run(
          "UPDATE campaigns SET source_contact_list_id = ?, total_numbers = ?, dialed = 0, answered = 0, status = 'pending' WHERE id = ? AND account_id = ? AND flow_type = 'ivr'",
          [contact_list_id, listContacts.length, ivrId, req.accountId]
        );
      }
    } else if (sip_account_id) {
      const sip = await db.get('SELECT id FROM sip_accounts WHERE id = ? AND account_id = ?', [sip_account_id, req.accountId]);
      if (!sip) return res.status(400).json({ error: 'SIP account not found' });
      await db.run("UPDATE campaigns SET sip_account_id = ? WHERE id = ? AND account_id = ? AND flow_type = 'ivr'", [sip_account_id, ivrId, req.accountId]);
    }

    await rebuildIvrDialplan();
    await dialer.startCampaign(ivrId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/pause', async (req, res) => {
  try {
    const existing = await db.get("SELECT id FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'ivr'", [req.params.id, req.accountId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await dialer.pauseCampaign(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:id/stop', async (req, res) => {
  try {
    const existing = await db.get("SELECT id FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'ivr'", [req.params.id, req.accountId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await dialer.stopCampaign(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:id/reset', async (req, res) => {
  try {
    const existing = await db.get("SELECT * FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'ivr'", [req.params.id, req.accountId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.status === 'running') return res.status(400).json({ error: 'Stop IVR before resetting' });

    await db.run("UPDATE contacts SET status = 'pending' WHERE campaign_id = ? AND account_id = ?", [req.params.id, req.accountId]);
    await db.run("UPDATE campaigns SET status = 'pending', dialed = 0, answered = 0 WHERE id = ? AND account_id = ? AND flow_type = 'ivr'", [req.params.id, req.accountId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
