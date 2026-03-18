const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/call-logs?q=&status=&page=&limit=
router.get('/', (req, res) => {
  const {
    q      = '',
    status = '',
    page   = 1,
    limit  = 50,
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page,  10) || 1);
  const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
  const offset   = (pageNum - 1) * limitNum;

  let where  = '1=1';
  const params = [];

  if (q) {
    where += ` AND (r.phone_number LIKE ? OR c.name LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`);
  }
  if (status) {
    where += ` AND r.status = ?`;
    params.push(status);
  }

  const countRow = db.prepare(
    `SELECT COUNT(*) as total
     FROM call_results r
     LEFT JOIN campaigns c ON r.campaign_id = c.id
     WHERE ${where}`
  ).get(...params);

  const results = db.prepare(
    `SELECT r.*, c.name as campaign_name
     FROM call_results r
     LEFT JOIN campaigns c ON r.campaign_id = c.id
     WHERE ${where}
     ORDER BY r.called_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params, limitNum, offset);

  res.json({
    total:   countRow.total,
    page:    pageNum,
    limit:   limitNum,
    results,
  });
});

module.exports = router;
