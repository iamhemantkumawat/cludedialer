const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const { v4: uuidv4 } = require('uuid');
const { parse } = require('csv-parse/sync');
const db = require('../db');
const { requireAccount } = require('../account');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(requireAccount);

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseNumbers(content, filename) {
  const numbers = [];
  const isCsv = (filename || '').toLowerCase().endsWith('.csv');
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
  return numbers;
}

// ── Contact Lists CRUD ────────────────────────────────────────────────────────

// GET all lists (with contact count)
router.get('/', async (req, res) => {
  try {
    const lists = await db.all(`
      SELECT cl.*, COUNT(pc.id) AS contact_count
      FROM contact_lists cl
      LEFT JOIN portal_contacts pc ON pc.contact_list_id = cl.id AND pc.account_id = cl.account_id
      WHERE cl.account_id = ?
      GROUP BY cl.id
      ORDER BY cl.created_at DESC
    `, [req.accountId]);
    res.json(lists);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create list
router.post('/', async (req, res) => {
  try {
    const { list_name, description } = req.body || {};
    if (!list_name) return res.status(400).json({ error: 'list_name required' });
    const result = await db.run(
      'INSERT INTO contact_lists (account_id, list_name, description) VALUES (?, ?, ?) RETURNING *',
      [req.accountId, list_name.trim(), (description || '').trim()]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT rename / update list
router.put('/:id', async (req, res) => {
  try {
    const { list_name, description } = req.body || {};
    const existing = await db.get('SELECT * FROM contact_lists WHERE id = ? AND account_id = ?', [req.params.id, req.accountId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await db.run(
      'UPDATE contact_lists SET list_name = COALESCE(?,list_name), description = COALESCE(?,description) WHERE id = ? AND account_id = ?',
      [list_name || null, description !== undefined ? description : null, req.params.id, req.accountId]
    );
    res.json(await db.get('SELECT * FROM contact_lists WHERE id = ? AND account_id = ?', [req.params.id, req.accountId]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE list + all its contacts
router.delete('/:id', async (req, res) => {
  try {
    const existing = await db.get('SELECT id FROM contact_lists WHERE id = ? AND account_id = ?', [req.params.id, req.accountId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await db.run('DELETE FROM portal_contacts WHERE contact_list_id = ? AND account_id = ?', [req.params.id, req.accountId]);
    await db.run('DELETE FROM contact_lists WHERE id = ? AND account_id = ?', [req.params.id, req.accountId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Contacts within a list ────────────────────────────────────────────────────

// GET paginated contacts
router.get('/:id/contacts', async (req, res) => {
  try {
    const { page = 1, limit = 200, q, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const list = await db.get('SELECT id FROM contact_lists WHERE id = ? AND account_id = ?', [req.params.id, req.accountId]);
    if (!list) return res.status(404).json({ error: 'List not found' });

    let where = 'account_id = ? AND contact_list_id = ?';
    const params = [req.accountId, req.params.id];
    if (q) {
      where += ' AND (phone_number LIKE ? OR COALESCE(contact_name, \'\') LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    if (status && status !== 'all') {
      const normalized = String(status).trim().toLowerCase();
      if (normalized === 'called') {
        where += " AND (LOWER(COALESCE(status, '')) IN ('called', 'answered', 'completed'))";
      } else {
        where += ' AND LOWER(COALESCE(status, \'\')) = ?';
        params.push(normalized);
      }
    }

    const contacts = await db.all(
      `SELECT * FROM portal_contacts WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    const row = await db.get(`SELECT COUNT(*) AS n FROM portal_contacts WHERE ${where}`, params);

    res.json({ contacts, total: parseInt(row.n), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST add single number
router.post('/:id/contacts', async (req, res) => {
  try {
    const list = await db.get('SELECT id FROM contact_lists WHERE id = ? AND account_id = ?', [req.params.id, req.accountId]);
    if (!list) return res.status(404).json({ error: 'List not found' });

    const { phone_number, contact_name } = req.body || {};
    if (!phone_number) return res.status(400).json({ error: 'phone_number required' });

    const num = String(phone_number).trim().replace(/[\s\-().]/g, '');
    if (!/^\+?[\d]{6,15}$/.test(num)) return res.status(400).json({ error: 'Invalid phone number' });

    const id = uuidv4();
    await db.run(
      'INSERT INTO portal_contacts (id, account_id, contact_list_id, phone_number, contact_name) VALUES (?,?,?,?,?)',
      [id, req.accountId, req.params.id, num, (contact_name || '').trim()]
    );

    res.json(await db.get('SELECT * FROM portal_contacts WHERE id = ? AND account_id = ?', [id, req.accountId]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST upload CSV / TXT
router.post('/:id/contacts/upload', upload.single('file'), async (req, res) => {
  try {
    const list = await db.get('SELECT id FROM contact_lists WHERE id = ? AND account_id = ?', [req.params.id, req.accountId]);
    if (!list) return res.status(404).json({ error: 'List not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let numbers;
    try {
      numbers = parseNumbers(req.file.buffer.toString('utf8'), req.file.originalname);
    } catch (err) {
      return res.status(400).json({ error: 'Parse error: ' + err.message });
    }
    if (!numbers.length) return res.status(400).json({ error: 'No valid phone numbers found' });

    await db.withTransaction(async (client) => {
      for (const n of numbers) {
        await client.query(
          'INSERT INTO portal_contacts (id, account_id, contact_list_id, phone_number) VALUES ($1, $2, $3, $4)',
          [uuidv4(), req.accountId, req.params.id, n]
        );
      }
    });

    const row = await db.get('SELECT COUNT(*) AS n FROM portal_contacts WHERE account_id = ? AND contact_list_id = ?', [req.accountId, req.params.id]);
    res.json({ imported: numbers.length, total: parseInt(row.n) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE single contact
router.delete('/:id/contacts/:contactId', async (req, res) => {
  try {
    await db.run(
      'DELETE FROM portal_contacts WHERE id = ? AND contact_list_id = ? AND account_id = ?',
      [req.params.contactId, req.params.id, req.accountId]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE all contacts in list
router.delete('/:id/contacts', async (req, res) => {
  try {
    let where = 'contact_list_id = ? AND account_id = ?';
    const params = [req.params.id, req.accountId];
    const filter = String(req.query.filter || 'all').trim().toLowerCase();

    if (filter === 'answered' || filter === 'called') {
      where += " AND (LOWER(COALESCE(status, '')) IN ('called', 'answered', 'completed') OR LOWER(COALESCE(last_result, '')) LIKE '%answered%')";
    } else if (filter === 'dtmf') {
      where += " AND LOWER(COALESCE(last_result, '')) LIKE '%dtmf%'";
    }

    const result = await db.run(`DELETE FROM portal_contacts WHERE ${where}`, params);
    res.json({ success: true, deleted: result.rowCount || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
