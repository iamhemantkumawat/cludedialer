const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { startCampaign, pauseCampaign, stopCampaign } = require('../dialer');

const router = express.Router();

// GET all campaigns
router.get('/', (req, res) => {
  const campaigns = db.prepare(`
    SELECT c.*, s.username as sip_username, s.domain as sip_domain
    FROM campaigns c
    LEFT JOIN sip_accounts s ON c.sip_account_id = s.id
    ORDER BY c.created_at DESC
  `).all();
  res.json(campaigns);
});

// GET single campaign with stats
router.get('/:id', (req, res) => {
  const campaign = db.prepare(`
    SELECT c.*, s.username as sip_username, s.domain as sip_domain, s.caller_id
    FROM campaigns c
    LEFT JOIN sip_accounts s ON c.sip_account_id = s.id
    WHERE c.id = ?
  `).get(req.params.id);

  if (!campaign) return res.status(404).json({ error: 'Not found' });

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'calling'  THEN 1 ELSE 0 END) as calling,
      SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered,
      SUM(CASE WHEN status = 'no_dtmf' THEN 1 ELSE 0 END) as no_dtmf,
      SUM(CASE WHEN status = 'busy'     THEN 1 ELSE 0 END) as busy,
      SUM(CASE WHEN status = 'noanswer' THEN 1 ELSE 0 END) as noanswer,
      SUM(CASE WHEN status = 'failed'   THEN 1 ELSE 0 END) as failed
    FROM contacts WHERE campaign_id = ?
  `).get(req.params.id);

  res.json({ ...campaign, stats });
});

// POST create campaign
router.post('/', (req, res) => {
  const {
    name, sip_account_id, audio_file, audio_type,
    tts_text, dtmf_digits, concurrent_calls, numbers
  } = req.body;

  if (!name || !sip_account_id) {
    return res.status(400).json({ error: 'name and sip_account_id required' });
  }

  const numList = Array.isArray(numbers) ? numbers : [];
  const id = uuidv4();
  db.prepare(`
    INSERT INTO campaigns (id, name, sip_account_id, audio_file, audio_type, tts_text, dtmf_digits, concurrent_calls, total_numbers)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, sip_account_id, audio_file || '', audio_type || 'upload',
    tts_text || '', dtmf_digits || 1, concurrent_calls || 2, numList.length);

  // Bulk insert contacts if provided (legacy path)
  if (numList.length > 0) {
    const insertContact = db.prepare(
      `INSERT INTO contacts (id, campaign_id, phone_number) VALUES (?, ?, ?)`
    );
    const insertMany = db.transaction((nums) => {
      for (const num of nums) {
        const clean = String(num).replace(/\s+/g, '').trim();
        if (clean) insertContact.run(uuidv4(), id, clean);
      }
    });
    insertMany(numList);
  }

  res.json({ id, message: 'Campaign created' });
});

// POST start campaign  (optional body: { contact_list_id })
router.post('/:id/start', async (req, res) => {
  try {
    const { contact_list_id } = req.body || {};
    await startCampaign(req.params.id, contact_list_id || null);
    res.json({ message: 'Campaign started' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST pause campaign
router.post('/:id/pause', async (req, res) => {
  await pauseCampaign(req.params.id);
  res.json({ message: 'Campaign paused' });
});

// POST stop campaign
router.post('/:id/stop', async (req, res) => {
  await stopCampaign(req.params.id);
  res.json({ message: 'Campaign stopped' });
});

// DELETE campaign
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM call_results WHERE campaign_id = ?').run(req.params.id);
  db.prepare('DELETE FROM contacts WHERE campaign_id = ?').run(req.params.id);
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// GET DTMF results for a campaign
router.get('/:id/results', (req, res) => {
  const results = db.prepare(`
    SELECT * FROM call_results WHERE campaign_id = ? ORDER BY called_at DESC
  `).all(req.params.id);
  res.json(results);
});

// GET DTMF summary (how many pressed each key)
router.get('/:id/dtmf-summary', (req, res) => {
  const summary = db.prepare(`
    SELECT dtmf, COUNT(*) as count
    FROM call_results
    WHERE campaign_id = ? AND dtmf != ''
    GROUP BY dtmf ORDER BY dtmf
  `).all(req.params.id);
  res.json(summary);
});

// GET contacts list
router.get('/:id/contacts', (req, res) => {
  const { page = 1, limit = 100 } = req.query;
  const offset = (page - 1) * limit;
  const contacts = db.prepare(`
    SELECT c.phone_number, c.status, r.dtmf, r.called_at
    FROM contacts c
    LEFT JOIN call_results r ON r.campaign_id = c.campaign_id AND r.phone_number = c.phone_number
    WHERE c.campaign_id = ?
    ORDER BY c.rowid
    LIMIT ? OFFSET ?
  `).all(req.params.id, limit, offset);
  res.json(contacts);
});

module.exports = router;
