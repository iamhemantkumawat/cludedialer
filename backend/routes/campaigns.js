const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const dialer = require('../dialer');
const { requireAccount } = require('../account');

router.use(requireAccount);

// GET all campaigns
router.get('/', async (req, res) => {
  try {
    const campaigns = await db.all("SELECT * FROM campaigns WHERE account_id = ? AND flow_type = 'campaign' ORDER BY created_at DESC", [req.accountId]);
    res.json(campaigns);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single campaign
router.get('/:id', async (req, res) => {
  try {
    const campaign = await db.get("SELECT * FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'campaign'", [req.params.id, req.accountId]);
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    res.json(campaign);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET campaign stats
router.get('/:id/stats', async (req, res) => {
  try {
    const campaign = await db.get("SELECT * FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'campaign'", [req.params.id, req.accountId]);
    if (!campaign) return res.status(404).json({ error: 'Not found' });

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

    res.json({ campaign, contacts: contactStats, dtmf: dtmfStats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create campaign
router.post('/', async (req, res) => {
  try {
    const { name, sip_account_id, audio_file, audio_type, tts_text, tts_language, tts_voice_type, dtmf_digits, concurrent_calls, call_timeout, transfer_on_dtmf, transfer_dest } = req.body;
    if (!name || !sip_account_id) return res.status(400).json({ error: 'name and sip_account_id are required' });

    const sip = await db.get('SELECT id FROM sip_accounts WHERE id = ? AND account_id = ?', [sip_account_id, req.accountId]);
    if (!sip) return res.status(400).json({ error: 'SIP account not found' });

    const id = uuidv4();
    await db.run(`
      INSERT INTO campaigns (id, account_id, flow_type, name, sip_account_id, audio_file, audio_type, tts_text, tts_language, tts_voice_type, dtmf_digits, concurrent_calls, call_timeout, transfer_on_dtmf, transfer_dest)
      VALUES (?, ?, 'campaign', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, req.accountId, name, sip_account_id,
      audio_file || null,
      audio_type || 'upload',
      tts_text || '',
      tts_language || 'en-US',
      tts_voice_type || 'female',
      dtmf_digits || 1,
      concurrent_calls || 2,
      call_timeout || 30,
      transfer_on_dtmf ? 1 : 0,
      transfer_dest || '',
    ]);

    res.json(await db.get("SELECT * FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'campaign'", [id, req.accountId]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT update campaign
router.put('/:id', async (req, res) => {
  try {
    const existing = await db.get("SELECT * FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'campaign'", [req.params.id, req.accountId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.status === 'running') return res.status(400).json({ error: 'Stop or pause campaign before editing' });

    const { name, audio_file, audio_type, tts_text, tts_language, tts_voice_type, dtmf_digits, concurrent_calls, call_timeout, transfer_on_dtmf, transfer_dest } = req.body;
    await db.run(`
      UPDATE campaigns SET
        name             = COALESCE(?, name),
        audio_file       = COALESCE(?, audio_file),
        audio_type       = COALESCE(?, audio_type),
        tts_text         = COALESCE(?, tts_text),
        tts_language     = COALESCE(?, tts_language),
        tts_voice_type   = COALESCE(?, tts_voice_type),
        dtmf_digits      = COALESCE(?, dtmf_digits),
        concurrent_calls = COALESCE(?, concurrent_calls),
        call_timeout     = COALESCE(?, call_timeout),
        transfer_on_dtmf = COALESCE(?, transfer_on_dtmf),
        transfer_dest    = COALESCE(?, transfer_dest)
      WHERE id = ? AND account_id = ? AND flow_type = 'campaign'
    `, [name, audio_file, audio_type, tts_text, tts_language, tts_voice_type, dtmf_digits, concurrent_calls, call_timeout,
        transfer_on_dtmf !== undefined ? (transfer_on_dtmf ? 1 : 0) : null,
        transfer_dest, req.params.id, req.accountId]);

    res.json(await db.get("SELECT * FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'campaign'", [req.params.id, req.accountId]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE campaign
router.delete('/:id', async (req, res) => {
  try {
    const existing = await db.get("SELECT * FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'campaign'", [req.params.id, req.accountId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.status === 'running') return res.status(400).json({ error: 'Stop campaign before deleting' });

    await db.run('DELETE FROM call_results WHERE campaign_id = ? AND account_id = ?', [req.params.id, req.accountId]);
    await db.run('DELETE FROM contacts WHERE campaign_id = ? AND account_id = ?', [req.params.id, req.accountId]);
    await db.run("DELETE FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'campaign'", [req.params.id, req.accountId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/campaigns/:id/start
router.post('/:id/start', async (req, res) => {
  const { contact_list_id, sip_account_id } = req.body || {};
  const campaignId = req.params.id;

  try {
    const campaign = await db.get("SELECT * FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'campaign'", [campaignId, req.accountId]);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (contact_list_id) {
      if (campaign.status === 'running') return res.status(400).json({ error: 'Stop the campaign before loading a new contact list' });

      const contactList = await db.get('SELECT id FROM contact_lists WHERE id = ? AND account_id = ?', [contact_list_id, req.accountId]);
      if (!contactList) return res.status(404).json({ error: 'Contact list not found' });

      const listContacts = await db.all(
        'SELECT * FROM portal_contacts WHERE contact_list_id = ? AND account_id = ?',
        [contact_list_id, req.accountId]
      );
      if (!listContacts.length) return res.status(400).json({ error: 'Selected contact list is empty' });

      // Replace contacts + reset counters
      await db.run('DELETE FROM contacts WHERE campaign_id = ? AND account_id = ?', [campaignId, req.accountId]);
      await db.withTransaction(async (client) => {
        for (const r of listContacts) {
          await client.query(
            'INSERT INTO contacts (id, account_id, portal_contact_id, campaign_id, phone_number, attempts) VALUES ($1, $2, $3, $4, $5, 0)',
            [uuidv4(), req.accountId, r.id, campaignId, r.phone_number]
          );
        }
      });

      if (sip_account_id) {
        const sip = await db.get('SELECT id FROM sip_accounts WHERE id = ? AND account_id = ?', [sip_account_id, req.accountId]);
        if (!sip) return res.status(400).json({ error: 'SIP account not found' });
        await db.run(
          "UPDATE campaigns SET sip_account_id = ?, source_contact_list_id = ?, total_numbers = ?, dialed = 0, answered = 0, status = 'pending' WHERE id = ? AND account_id = ? AND flow_type = 'campaign'",
          [sip_account_id, contact_list_id, listContacts.length, campaignId, req.accountId]
        );
      } else {
        await db.run(
          "UPDATE campaigns SET source_contact_list_id = ?, total_numbers = ?, dialed = 0, answered = 0, status = 'pending' WHERE id = ? AND account_id = ? AND flow_type = 'campaign'",
          [contact_list_id, listContacts.length, campaignId, req.accountId]
        );
      }
    } else if (sip_account_id) {
      const sip = await db.get('SELECT id FROM sip_accounts WHERE id = ? AND account_id = ?', [sip_account_id, req.accountId]);
      if (!sip) return res.status(400).json({ error: 'SIP account not found' });
      await db.run("UPDATE campaigns SET sip_account_id = ? WHERE id = ? AND account_id = ? AND flow_type = 'campaign'", [sip_account_id, campaignId, req.accountId]);
    }

    await dialer.startCampaign(campaignId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/pause
router.post('/:id/pause', async (req, res) => {
  try {
    const existing = await db.get("SELECT id FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'campaign'", [req.params.id, req.accountId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await dialer.pauseCampaign(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// POST /api/campaigns/:id/stop
router.post('/:id/stop', async (req, res) => {
  try {
    const existing = await db.get("SELECT id FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'campaign'", [req.params.id, req.accountId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await dialer.stopCampaign(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// POST /api/campaigns/:id/reset
router.post('/:id/reset', async (req, res) => {
  try {
    const existing = await db.get("SELECT * FROM campaigns WHERE id = ? AND account_id = ? AND flow_type = 'campaign'", [req.params.id, req.accountId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.status === 'running') return res.status(400).json({ error: 'Stop campaign before resetting' });

    await db.run("UPDATE contacts SET status = 'pending' WHERE campaign_id = ? AND account_id = ?", [req.params.id, req.accountId]);
    await db.run("UPDATE campaigns SET status = 'pending', dialed = 0, answered = 0 WHERE id = ? AND account_id = ? AND flow_type = 'campaign'", [req.params.id, req.accountId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
