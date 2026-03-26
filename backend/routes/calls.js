const express = require('express');
const router = express.Router();
const db = require('../db');
const dialer = require('../dialer');
const { requireAccount } = require('../account');

router.use(requireAccount);

// GET call results (optionally filtered by campaign / status)
router.get('/', async (req, res) => {
  try {
    const { campaign_id, page = 1, limit = 100, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = ['account_id = ?'];
    const params = [req.accountId];

    if (campaign_id) { conditions.push('campaign_id = ?'); params.push(campaign_id); }
    if (status)      { conditions.push('status = ?');      params.push(status); }

    const where = 'WHERE ' + conditions.join(' AND ');
    const results = await db.all(
      `SELECT * FROM call_results ${where} ORDER BY called_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    const row = await db.get(`SELECT COUNT(*) as n FROM call_results ${where}`, params);

    res.json({ results, total: parseInt(row.n) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET currently active (in-flight) calls
router.get('/active', (req, res) => {
  res.json(dialer.getActiveCalls(req.accountId));
});

module.exports = router;
