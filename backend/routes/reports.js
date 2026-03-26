const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAccount } = require('../account');

router.use(requireAccount);

// GET /api/reports/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const aid = req.accountId;

    const [
      contactsRow,
      activeCampaigns,
      callsToday,
      dtmfToday,
      dailyStats,
      recentCalls,
    ] = await Promise.all([
      db.get('SELECT COUNT(*) as total FROM portal_contacts WHERE account_id = ?', [aid]),
      db.get("SELECT COUNT(*) as total FROM campaigns WHERE account_id = ? AND status = 'running'", [aid]),
      db.get(`SELECT COUNT(*) as total FROM call_results
              WHERE account_id = ? AND called_at >= CURRENT_DATE`, [aid]),
      db.get(`SELECT COUNT(*) as total FROM call_results
              WHERE account_id = ? AND called_at >= CURRENT_DATE AND dtmf != '' AND dtmf IS NOT NULL`, [aid]),
      // Last 7 days grouped by day
      db.all(`
        SELECT
          DATE(called_at) as day,
          COUNT(*) as total,
          SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered,
          SUM(CASE WHEN dtmf != '' AND dtmf IS NOT NULL THEN 1 ELSE 0 END) as dtmf
        FROM call_results
        WHERE account_id = ?
          AND called_at >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY DATE(called_at)
        ORDER BY day ASC
      `, [aid]),
      // Recent 10 calls with campaign name
      db.all(`
        SELECT cr.phone_number, cr.status, cr.dtmf, cr.duration, cr.called_at,
               c.name as campaign_name
        FROM call_results cr
        LEFT JOIN campaigns c ON cr.campaign_id = c.id
        WHERE cr.account_id = ?
        ORDER BY cr.called_at DESC
        LIMIT 10
      `, [aid]),
    ]);

    // Fill in missing days with zeros
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = dailyStats.find((r) => r.day && String(r.day).slice(0, 10) === key);
      days.push({
        day: key,
        total:    Number(found?.total    || 0),
        answered: Number(found?.answered || 0),
        dtmf:     Number(found?.dtmf     || 0),
      });
    }

    res.json({
      stats: {
        total_contacts:   Number(contactsRow?.total    || 0),
        active_campaigns: Number(activeCampaigns?.total || 0),
        calls_today:      Number(callsToday?.total      || 0),
        dtmf_today:       Number(dtmfToday?.total       || 0),
      },
      daily: days,
      recent: recentCalls.map((r) => ({
        phone:         r.phone_number,
        campaign:      r.campaign_name || '—',
        status:        r.status,
        dtmf:          r.dtmf && r.dtmf !== '' ? r.dtmf : null,
        duration:      Number(r.duration) || 0,
        called_at:     r.called_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/summary
// Returns all campaigns + IVRs with their stats in one query
router.get('/summary', async (req, res) => {
  try {
    const flows = await db.all(
      `SELECT * FROM campaigns WHERE account_id = ? ORDER BY created_at DESC`,
      [req.accountId]
    );

    if (!flows.length) return res.json([]);

    const ids = flows.map((f) => f.id);
    const placeholders = ids.map(() => '?').join(',');

    // Contact status counts per campaign
    const contactRows = await db.all(
      `SELECT campaign_id,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'calling'   THEN 1 ELSE 0 END) as calling,
        SUM(CASE WHEN status = 'answered'  THEN 1 ELSE 0 END) as answered,
        SUM(CASE WHEN status = 'busy'      THEN 1 ELSE 0 END) as busy,
        SUM(CASE WHEN status = 'no-answer' THEN 1 ELSE 0 END) as no_answer,
        SUM(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END) as failed
       FROM contacts WHERE account_id = ? AND campaign_id IN (${placeholders})
       GROUP BY campaign_id`,
      [req.accountId, ...ids]
    );

    // DTMF counts per campaign
    const dtmfRows = await db.all(
      `SELECT campaign_id, COUNT(*) as dtmf_count
       FROM call_results
       WHERE account_id = ? AND campaign_id IN (${placeholders}) AND dtmf != '' AND dtmf IS NOT NULL
       GROUP BY campaign_id`,
      [req.accountId, ...ids]
    );

    // Avg duration per campaign (answered calls only)
    const durationRows = await db.all(
      `SELECT campaign_id,
        AVG(CASE WHEN status = 'answered' THEN duration ELSE NULL END) as avg_duration,
        SUM(CASE WHEN status = 'answered' THEN duration ELSE 0 END) as total_duration
       FROM call_results
       WHERE account_id = ? AND campaign_id IN (${placeholders})
       GROUP BY campaign_id`,
      [req.accountId, ...ids]
    );

    const contactMap = new Map(contactRows.map((r) => [r.campaign_id, r]));
    const dtmfMap = new Map(dtmfRows.map((r) => [r.campaign_id, r.dtmf_count]));
    const durationMap = new Map(durationRows.map((r) => [r.campaign_id, r]));

    const result = flows.map((flow) => {
      const contacts = contactMap.get(flow.id) || { total: 0, pending: 0, calling: 0, answered: 0, busy: 0, no_answer: 0, failed: 0 };
      const dur = durationMap.get(flow.id) || { avg_duration: 0, total_duration: 0 };
      return {
        ...flow,
        contact_total:    Number(contacts.total)    || 0,
        contact_pending:  Number(contacts.pending)  || 0,
        contact_calling:  Number(contacts.calling)  || 0,
        contact_answered: Number(contacts.answered) || 0,
        contact_busy:     Number(contacts.busy)     || 0,
        contact_no_answer:Number(contacts.no_answer)|| 0,
        contact_failed:   Number(contacts.failed)   || 0,
        dtmf_count:       Number(dtmfMap.get(flow.id) || 0),
        avg_duration:     Math.round(Number(dur.avg_duration) || 0),
        total_duration:   Number(dur.total_duration) || 0,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/:id
// Full detail for a single campaign: stats + DTMF breakdown + recent calls
router.get('/:id', async (req, res) => {
  try {
    const flow = await db.get(
      'SELECT * FROM campaigns WHERE id = ? AND account_id = ?',
      [req.params.id, req.accountId]
    );
    if (!flow) return res.status(404).json({ error: 'Not found' });

    const contacts = await db.get(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'calling'   THEN 1 ELSE 0 END) as calling,
        SUM(CASE WHEN status = 'answered'  THEN 1 ELSE 0 END) as answered,
        SUM(CASE WHEN status = 'busy'      THEN 1 ELSE 0 END) as busy,
        SUM(CASE WHEN status = 'no-answer' THEN 1 ELSE 0 END) as no_answer,
        SUM(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END) as failed
       FROM contacts WHERE campaign_id = ? AND account_id = ?`,
      [req.params.id, req.accountId]
    );

    const dtmfBreakdown = await db.all(
      `SELECT dtmf, COUNT(*) as count
       FROM call_results WHERE campaign_id = ? AND account_id = ? AND dtmf != '' AND dtmf IS NOT NULL
       GROUP BY dtmf ORDER BY count DESC`,
      [req.params.id, req.accountId]
    );

    const durationStats = await db.get(
      `SELECT
        AVG(CASE WHEN status = 'answered' THEN duration ELSE NULL END) as avg_duration,
        SUM(CASE WHEN status = 'answered' THEN duration ELSE 0 END) as total_duration,
        MAX(duration) as max_duration
       FROM call_results WHERE campaign_id = ? AND account_id = ?`,
      [req.params.id, req.accountId]
    );

    // Recent 100 calls
    const recentCalls = await db.all(
      `SELECT id, phone_number, status, dtmf, duration, caller_id, cause_txt, called_at
       FROM call_results WHERE campaign_id = ? AND account_id = ?
       ORDER BY called_at DESC LIMIT 100`,
      [req.params.id, req.accountId]
    );

    res.json({
      flow,
      contacts: {
        total:     Number(contacts?.total)     || 0,
        pending:   Number(contacts?.pending)   || 0,
        calling:   Number(contacts?.calling)   || 0,
        answered:  Number(contacts?.answered)  || 0,
        busy:      Number(contacts?.busy)      || 0,
        no_answer: Number(contacts?.no_answer) || 0,
        failed:    Number(contacts?.failed)    || 0,
      },
      dtmf: dtmfBreakdown,
      duration: {
        avg:   Math.round(Number(durationStats?.avg_duration)   || 0),
        total: Number(durationStats?.total_duration) || 0,
        max:   Number(durationStats?.max_duration)   || 0,
      },
      recentCalls,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
