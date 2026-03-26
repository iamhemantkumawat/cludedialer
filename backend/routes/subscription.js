const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAccount } = require('../account');

// EUR to INR conversion rate (matches portal setting)
const EUR_TO_INR = 88.50;

const PLANS = [
  { id: '1day',   name: '1 Day',   days: 1,   price_eur: 14  },
  { id: '1week',  name: '1 Week',  days: 7,   price_eur: 65  },
  { id: '1month', name: '1 Month', days: 30,  price_eur: 149 },
];

router.use(requireAccount);

// GET /api/subscription  — get current subscription + plans
router.get('/', async (req, res) => {
  try {
    const sub = await db.get(
      `SELECT * FROM subscriptions
       WHERE account_id = ? AND status = 'active' AND expires_at > NOW()
       ORDER BY expires_at DESC LIMIT 1`,
      [req.accountId]
    );

    // Auto-expire stale subscriptions
    await db.run(
      `UPDATE subscriptions SET status = 'expired'
       WHERE account_id = ? AND status = 'active' AND expires_at <= NOW()`,
      [req.accountId]
    );

    res.json({ subscription: sub || null, plans: PLANS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscription/activate
// Body: { plan_id }
router.post('/activate', async (req, res) => {
  const { plan_id } = req.body || {};
  const plan = PLANS.find(p => p.id === plan_id);
  if (!plan) return res.status(400).json({ error: 'Invalid plan' });

  // Use session already validated by requireAccount middleware
  const session = req.magnusSession;

  const price_inr = plan.price_eur * EUR_TO_INR;
  const currentCredit = parseFloat(session.credit || '0');

  if (currentCredit < price_inr) {
    return res.status(402).json({
      error: `Insufficient balance. Plan costs ₹${price_inr.toFixed(2)} but your balance is ₹${currentCredit.toFixed(2)}.`,
    });
  }

  try {
    // Deduct from Magnus by updating user credit
    const { magnusRequest } = require('./magnus_helper');
    const newCredit = (currentCredit - price_inr).toFixed(4);

    await magnusRequest('user', 'save', {
      id: session.magnusId,
      credit: newCredit,
    });

    // Update session cache
    session.credit = newCredit;

    // Expire any existing active subscription
    await db.run(
      `UPDATE subscriptions SET status = 'replaced'
       WHERE account_id = ? AND status = 'active'`,
      [req.accountId]
    );

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + plan.days);

    const id = uuidv4();
    await db.run(
      `INSERT INTO subscriptions (id, account_id, plan_name, plan_days, price_eur, price_inr, status, activated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', NOW(), ?)`,
      [id, req.accountId, plan.name, plan.days, plan.price_eur, price_inr, expiresAt.toISOString()]
    );

    const sub = await db.get('SELECT * FROM subscriptions WHERE id = ?', [id]);
    res.json({ success: true, subscription: sub, new_credit: newCredit });
  } catch (err) {
    console.error('[Subscription] Activation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
