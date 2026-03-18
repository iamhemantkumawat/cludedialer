const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { v4: uuidv4 } = require('uuid');

/* ── Helpers ── */

/**
 * Ensure the "Default" list exists for a sip_account_id.
 * Returns the Default list row.
 */
function ensureDefaultList(sipAccountId) {
  let def = db.prepare(
    `SELECT * FROM contact_lists WHERE sip_account_id = ? AND list_name = 'Default' LIMIT 1`
  ).get(sipAccountId);

  if (!def) {
    const info = db.prepare(
      `INSERT INTO contact_lists (sip_account_id, list_name, description) VALUES (?, 'Default', 'Default list')`
    ).run(sipAccountId);
    def = db.prepare(`SELECT * FROM contact_lists WHERE id = ?`).get(info.lastInsertRowid);
  }
  return def;
}

/**
 * Parse text (CSV or newline-separated) into an array of { phone_number, contact_name }.
 * Strips non-digits from phone numbers. If a CSV row has 2 cells and first is numeric → phone,name.
 * If second cell looks like a name (non-numeric), first=phone second=name.
 */
function parsePhoneText(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];

  for (const line of lines) {
    const cells = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));

    if (cells.length >= 2) {
      // CSV row: figure out which cell is the phone
      const maybePhone0 = cells[0].replace(/[^+0-9]/g, '');
      const maybePhone1 = cells[1].replace(/[^+0-9]/g, '');

      if (maybePhone0.length >= 5) {
        // First column is the number
        results.push({ phone_number: maybePhone0, contact_name: cells[1] || '' });
      } else if (maybePhone1.length >= 5) {
        // Second column is the number, first is the name
        results.push({ phone_number: maybePhone1, contact_name: cells[0] || '' });
      }
    } else {
      // Single value — strip non-digit chars
      const phone = line.replace(/[^+0-9]/g, '');
      if (phone.length >= 5) {
        results.push({ phone_number: phone, contact_name: '' });
      }
    }
  }
  return results;
}

/* ══════════════════════════════════════════════════════════════════════════════
   CONTACT LISTS
══════════════════════════════════════════════════════════════════════════════ */

// GET /api/contact-lists?sip_account_id=
router.get('/contact-lists', (req, res) => {
  const { sip_account_id = 'default' } = req.query;

  // Auto-create Default list on first request
  ensureDefaultList(sip_account_id);

  const lists = db.prepare(
    `SELECT cl.*, COUNT(pc.id) as contact_count
     FROM contact_lists cl
     LEFT JOIN portal_contacts pc ON pc.contact_list_id = cl.id
     WHERE cl.sip_account_id = ?
     GROUP BY cl.id
     ORDER BY cl.id ASC`
  ).all(sip_account_id);

  res.json(lists);
});

// POST /api/contact-lists
router.post('/contact-lists', (req, res) => {
  const { sip_account_id = 'default', list_name, description = '' } = req.body;
  if (!list_name || !list_name.trim()) {
    return res.status(400).json({ error: 'list_name is required' });
  }

  const info = db.prepare(
    `INSERT INTO contact_lists (sip_account_id, list_name, description) VALUES (?, ?, ?)`
  ).run(sip_account_id, list_name.trim(), description);

  const list = db.prepare(`SELECT * FROM contact_lists WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json(list);
});

// PATCH /api/contact-lists/:id
router.patch('/contact-lists/:id', (req, res) => {
  const { id } = req.params;
  const { list_name } = req.body;

  if (!list_name || !list_name.trim()) {
    return res.status(400).json({ error: 'list_name is required' });
  }

  const list = db.prepare(`SELECT * FROM contact_lists WHERE id = ?`).get(id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  if (list.list_name === 'Default') return res.status(400).json({ error: 'Cannot rename the Default list' });

  db.prepare(`UPDATE contact_lists SET list_name = ? WHERE id = ?`).run(list_name.trim(), id);
  res.json(db.prepare(`SELECT * FROM contact_lists WHERE id = ?`).get(id));
});

// DELETE /api/contact-lists/:id
router.delete('/contact-lists/:id', (req, res) => {
  const { id } = req.params;

  const list = db.prepare(`SELECT * FROM contact_lists WHERE id = ?`).get(id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  if (list.list_name === 'Default') return res.status(400).json({ error: 'Cannot delete the Default list' });

  // Move contacts to Default list
  const def = ensureDefaultList(list.sip_account_id);
  db.prepare(
    `UPDATE portal_contacts SET contact_list_id = ?, updated_at = datetime('now') WHERE contact_list_id = ?`
  ).run(def.id, id);

  db.prepare(`DELETE FROM contact_lists WHERE id = ?`).run(id);
  res.json({ ok: true });
});

/* ══════════════════════════════════════════════════════════════════════════════
   CONTACTS
══════════════════════════════════════════════════════════════════════════════ */

// GET /api/contacts?list_id=&q=&status=
router.get('/contacts', (req, res) => {
  const { list_id, q = '', status = '' } = req.query;

  let sql = `SELECT * FROM portal_contacts WHERE 1=1`;
  const params = [];

  if (list_id) {
    sql += ` AND contact_list_id = ?`;
    params.push(list_id);
  }
  if (q) {
    sql += ` AND (phone_number LIKE ? OR contact_name LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`);
  }
  if (status) {
    sql += ` AND status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY created_at DESC`;

  const contacts = db.prepare(sql).all(...params);
  res.json(contacts);
});

// POST /api/contacts  — add single contact
router.post('/contacts', (req, res) => {
  const { sip_account_id = 'default', contact_list_id, phone_number, contact_name = '' } = req.body;

  if (!phone_number) return res.status(400).json({ error: 'phone_number is required' });

  const cleanPhone = phone_number.replace(/[^+0-9]/g, '');
  if (cleanPhone.length < 5) return res.status(400).json({ error: 'Invalid phone number' });

  // Get or create list
  let listId = contact_list_id;
  if (!listId) {
    const def = ensureDefaultList(sip_account_id);
    listId = def.id;
  }

  // Check for duplicate
  const existing = db.prepare(
    `SELECT id FROM portal_contacts WHERE phone_number = ? AND contact_list_id = ?`
  ).get(cleanPhone, listId);

  if (existing) {
    // Update existing
    db.prepare(
      `UPDATE portal_contacts SET contact_name = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(contact_name, existing.id);
    return res.json(db.prepare(`SELECT * FROM portal_contacts WHERE id = ?`).get(existing.id));
  }

  const id = uuidv4();
  db.prepare(
    `INSERT INTO portal_contacts (id, sip_account_id, contact_list_id, phone_number, contact_name, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  ).run(id, sip_account_id, listId, cleanPhone, contact_name);

  res.status(201).json(db.prepare(`SELECT * FROM portal_contacts WHERE id = ?`).get(id));
});

// DELETE /api/contacts/:id
router.delete('/contacts/:id', (req, res) => {
  const { id } = req.params;
  const contact = db.prepare(`SELECT id FROM portal_contacts WHERE id = ?`).get(id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  db.prepare(`DELETE FROM portal_contacts WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// POST /api/contacts/import  — bulk import from text
router.post('/contacts/import', (req, res) => {
  const { sip_account_id = 'default', contact_list_id, text } = req.body;

  if (!text) return res.status(400).json({ error: 'text is required' });

  let listId = contact_list_id;
  if (!listId) {
    const def = ensureDefaultList(sip_account_id);
    listId = def.id;
  }

  const parsed = parsePhoneText(text);
  if (parsed.length === 0) return res.status(400).json({ error: 'No valid phone numbers found' });

  const insertStmt = db.prepare(
    `INSERT INTO portal_contacts (id, sip_account_id, contact_list_id, phone_number, contact_name, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  );
  const updateStmt = db.prepare(
    `UPDATE portal_contacts SET contact_name = ?, updated_at = datetime('now') WHERE phone_number = ? AND contact_list_id = ?`
  );
  const existsStmt = db.prepare(
    `SELECT id FROM portal_contacts WHERE phone_number = ? AND contact_list_id = ?`
  );

  let inserted = 0;
  let updated  = 0;

  const importAll = db.transaction(() => {
    for (const { phone_number, contact_name } of parsed) {
      const existing = existsStmt.get(phone_number, listId);
      if (existing) {
        updateStmt.run(contact_name, phone_number, listId);
        updated++;
      } else {
        insertStmt.run(uuidv4(), sip_account_id, listId, phone_number, contact_name);
        inserted++;
      }
    }
  });

  importAll();
  res.json({ ok: true, inserted, updated, total: parsed.length });
});

// POST /api/contacts/cleanup
router.post('/contacts/cleanup', (req, res) => {
  const { mode, contact_list_id, text } = req.body;

  if (!contact_list_id) return res.status(400).json({ error: 'contact_list_id is required' });

  if (mode === 'clear_all') {
    db.prepare(`DELETE FROM portal_contacts WHERE contact_list_id = ?`).run(contact_list_id);
    return res.json({ ok: true, mode });
  }

  if (mode === 'clear_answered') {
    db.prepare(
      `DELETE FROM portal_contacts WHERE contact_list_id = ? AND status = 'called'`
    ).run(contact_list_id);
    return res.json({ ok: true, mode });
  }

  if (mode === 'clear_dtmf') {
    db.prepare(
      `DELETE FROM portal_contacts WHERE contact_list_id = ? AND last_result NOT LIKE '%dtmf%' AND status = 'called'`
    ).run(contact_list_id);
    return res.json({ ok: true, mode });
  }

  if (mode === 'replace_from_text') {
    if (!text) return res.status(400).json({ error: 'text required for replace_from_text mode' });

    const parsed = parsePhoneText(text);
    if (parsed.length === 0) return res.status(400).json({ error: 'No valid phone numbers found' });

    // Get sip_account_id from the list
    const list = db.prepare(`SELECT * FROM contact_lists WHERE id = ?`).get(contact_list_id);
    const sip_account_id = list?.sip_account_id || 'default';

    const replaceAll = db.transaction(() => {
      db.prepare(`DELETE FROM portal_contacts WHERE contact_list_id = ?`).run(contact_list_id);
      const insertStmt = db.prepare(
        `INSERT INTO portal_contacts (id, sip_account_id, contact_list_id, phone_number, contact_name, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`
      );
      for (const { phone_number, contact_name } of parsed) {
        insertStmt.run(uuidv4(), sip_account_id, contact_list_id, phone_number, contact_name);
      }
    });
    replaceAll();
    return res.json({ ok: true, mode, inserted: parsed.length });
  }

  res.status(400).json({ error: `Unknown cleanup mode: ${mode}` });
});

module.exports = router;
