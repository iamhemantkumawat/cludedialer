const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { parse } = require('csv-parse/sync');
const db = require('../db');
const { requireAccount } = require('../account');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(requireAccount);

// GET contacts for a campaign (paginated)
router.get('/', async (req, res) => {
  try {
    const { campaign_id, page = 1, limit = 100, status } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const campaign = await db.get('SELECT id FROM campaigns WHERE id = ? AND account_id = ?', [campaign_id, req.accountId]);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    let where = 'account_id = ? AND campaign_id = ?';
    const params = [req.accountId, campaign_id];

    if (status) { where += ' AND status = ?'; params.push(status); }

    const contacts = await db.all(
      `SELECT * FROM contacts WHERE ${where} ORDER BY created_at LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    const row = await db.get(`SELECT COUNT(*) as n FROM contacts WHERE ${where}`, params);

    res.json({ contacts, total: parseInt(row.n), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST upload CSV or TXT with phone numbers
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { campaign_id } = req.body;
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });
    if (!req.file)    return res.status(400).json({ error: 'No file uploaded' });

    const campaign = await db.get('SELECT * FROM campaigns WHERE id = ? AND account_id = ?', [campaign_id, req.accountId]);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status === 'running') return res.status(400).json({ error: 'Cannot upload while campaign is running' });

    const content = req.file.buffer.toString('utf8');
    const numbers = [];

    const isCsv = req.file.originalname.toLowerCase().endsWith('.csv');
    if (isCsv) {
      const rows = parse(content, { skip_empty_lines: true, trim: true, relax_column_count: true });
      for (const row of rows) {
        const num = String(row[0] || '').trim().replace(/[\s\-().]/g, '');
        if (/^\+?[\d]{6,15}$/.test(num)) numbers.push(num);
      }
    } else {
      for (const line of content.split(/\r?\n/)) {
        const num = line.trim().replace(/[\s\-().]/g, '');
        if (/^\+?[\d]{6,15}$/.test(num)) numbers.push(num);
      }
    }

    if (numbers.length === 0) return res.status(400).json({ error: 'No valid phone numbers found' });

    await db.withTransaction(async (client) => {
      for (const num of numbers) {
        await client.query(
          'INSERT INTO contacts (id, account_id, campaign_id, phone_number) VALUES ($1, $2, $3, $4)',
          [uuidv4(), req.accountId, campaign_id, num]
        );
      }
    });

    const row = await db.get('SELECT COUNT(*) as n FROM contacts WHERE campaign_id = ? AND account_id = ?', [campaign_id, req.accountId]);
    const total = parseInt(row.n);
    await db.run('UPDATE campaigns SET total_numbers = ? WHERE id = ? AND account_id = ?', [total, campaign_id, req.accountId]);

    res.json({ imported: numbers.length, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST add single number
router.post('/', async (req, res) => {
  try {
    const { campaign_id, phone_number } = req.body;
    if (!campaign_id || !phone_number) return res.status(400).json({ error: 'campaign_id and phone_number required' });

    const campaign = await db.get('SELECT id FROM campaigns WHERE id = ? AND account_id = ?', [campaign_id, req.accountId]);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const num = String(phone_number).trim().replace(/[\s\-().]/g, '');
    if (!/^\+?[\d]{6,15}$/.test(num)) return res.status(400).json({ error: 'Invalid phone number' });

    const id = uuidv4();
    await db.run('INSERT INTO contacts (id, account_id, campaign_id, phone_number) VALUES (?, ?, ?, ?)', [id, req.accountId, campaign_id, num]);

    const row = await db.get('SELECT COUNT(*) as n FROM contacts WHERE campaign_id = ? AND account_id = ?', [campaign_id, req.accountId]);
    await db.run('UPDATE campaigns SET total_numbers = ? WHERE id = ? AND account_id = ?', [parseInt(row.n), campaign_id, req.accountId]);

    res.json(await db.get('SELECT * FROM contacts WHERE id = ? AND account_id = ?', [id, req.accountId]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE single contact
router.delete('/:id', async (req, res) => {
  try {
    const contact = await db.get('SELECT * FROM contacts WHERE id = ? AND account_id = ?', [req.params.id, req.accountId]);
    if (!contact) return res.status(404).json({ error: 'Not found' });
    await db.run('DELETE FROM contacts WHERE id = ? AND account_id = ?', [req.params.id, req.accountId]);
    const row = await db.get('SELECT COUNT(*) as n FROM contacts WHERE campaign_id = ? AND account_id = ?', [contact.campaign_id, req.accountId]);
    await db.run('UPDATE campaigns SET total_numbers = ? WHERE id = ? AND account_id = ?', [parseInt(row.n), contact.campaign_id, req.accountId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE all contacts for a campaign
router.delete('/', async (req, res) => {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });
    const campaign = await db.get('SELECT id FROM campaigns WHERE id = ? AND account_id = ?', [campaign_id, req.accountId]);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    await db.run('DELETE FROM contacts WHERE campaign_id = ? AND account_id = ?', [campaign_id, req.accountId]);
    await db.run('UPDATE campaigns SET total_numbers = 0, dialed = 0, answered = 0 WHERE id = ? AND account_id = ?', [campaign_id, req.accountId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
