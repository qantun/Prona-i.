const express = require('express');
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db      = require('../config/db');
const auth    = require('../middleware/auth');
const router  = express.Router();

const BASE_PRICE_EUR = 50;
const DISCOUNT_THRESHOLD = 4;
const DISCOUNT_RATE = 0.17;

// ── Izračun cijene ─────────────────────────────────────────
function calcAmount(agentCount) {
  const disc = agentCount >= DISCOUNT_THRESHOLD ? DISCOUNT_RATE : 0;
  const perAgent = Math.round(BASE_PRICE_EUR * (1 - disc));
  return { perAgent, total: perAgent * agentCount, discount: disc > 0 };
}

// ── POST /api/billing/checkout ────────────────────────────
// Kreira Stripe Checkout sesiju
router.post('/checkout', auth, async (req, res) => {
  const { agent_count = 1 } = req.body;
  const count = Math.max(1, parseInt(agent_count));
  const { total } = calcAmount(count);

  try {
    // Dohvati ili kreiraj Stripe customer
    let customer_id = null;
    const userRes = await db.query('SELECT stripe_customer_id, email FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];

    if (user.stripe_customer_id) {
      customer_id = user.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: req.user.id },
      });
      customer_id = customer.id;
      await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customer_id, req.user.id]);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customer_id,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: `Pronađi — ${count} agent${count > 1 ? 'a' : ''}` },
          unit_amount: total * 100, // Stripe koristi cente
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      metadata: { user_id: req.user.id, agent_count: count },
      success_url: `${process.env.FRONTEND_URL}/dashboard?payment=success`,
      cancel_url:  `${process.env.FRONTEND_URL}/cijena`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[BILLING] Checkout error:', err);
    res.status(500).json({ error: 'Greška pri kreiranju pretplate.' });
  }
});

// ── POST /api/billing/portal ──────────────────────────────
// Stripe Customer Portal — upravljanje pretplatom / otkazivanje
router.post('/portal', auth, async (req, res) => {
  try {
    const userRes = await db.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.id]);
    const cid = userRes.rows[0]?.stripe_customer_id;
    if (!cid) return res.status(400).json({ error: 'Nema aktivne pretplate.' });

    const session = await stripe.billingPortal.sessions.create({
      customer: cid,
      return_url: `${process.env.FRONTEND_URL}/dashboard`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: 'Greška.' });
  }
});

// ── GET /api/billing/price-preview ───────────────────────
router.get('/price-preview', (req, res) => {
  const count = Math.max(1, parseInt(req.query.agents || 1));
  res.json({ ...calcAmount(count), agent_count: count });
});

// ── POST /api/billing/webhook ─────────────────────────────
// Stripe šalje events ovdje — RAW body (konfiguriran u index.js)
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[WEBHOOK] Potpis nije valjan:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId  = session.metadata.user_id;
        const count   = parseInt(session.metadata.agent_count || 1);
        const { total } = calcAmount(count);

        await db.query(
          `INSERT INTO subscriptions (user_id, stripe_subscription_id, status, agent_count, monthly_amount_eur)
           VALUES ($1, $2, 'active', $3, $4)
           ON CONFLICT (stripe_subscription_id) DO UPDATE SET status = 'active'`,
          [userId, session.subscription, count, total]
        );
        await db.query(`UPDATE users SET plan = 'active' WHERE id = $1`, [userId]);
        console.log(`[WEBHOOK] Pretplata aktivirana — user ${userId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const sub = await stripe.subscriptions.retrieve(event.data.object.subscription);
        const userId = sub.metadata?.user_id;
        if (userId) {
          await db.query(`UPDATE users SET plan = 'past_due' WHERE id = $1`, [userId]);
          await db.query(
            `UPDATE subscriptions SET status = 'past_due' WHERE stripe_subscription_id = $1`,
            [sub.id]
          );
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await db.query(
          `UPDATE subscriptions SET status = 'canceled' WHERE stripe_subscription_id = $1`,
          [sub.id]
        );
        // Dohvati user_id iz baze
        const res2 = await db.query(
          'SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1',
          [sub.id]
        );
        if (res2.rows[0]) {
          await db.query(`UPDATE users SET plan = 'inactive' WHERE id = $1`, [res2.rows[0].user_id]);
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[WEBHOOK] Greška pri obradi:', err);
    res.status(500).json({ error: 'Interna greška.' });
  }
});

module.exports = router;
