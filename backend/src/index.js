require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const cron       = require('node-cron');

const authRoutes     = require('./routes/auth');
const listingRoutes  = require('./routes/listings');
const filterRoutes   = require('./routes/filters');
const billingRoutes  = require('./routes/billing');
const { runAllScrapers } = require('./jobs/scrapeJob');

const app  = express();
const PORT = process.env.PORT || 3000;
const INTERVAL = parseInt(process.env.SCRAPE_INTERVAL_MINUTES || '3');

// ── MIDDLEWARE ──────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));

// Stripe webhook treba raw body — mora biti PRIJE express.json()
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', limiter);

// ── RUTE ───────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/filters',  filterRoutes);
app.use('/api/billing',  billingRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── SCRAPER CRON JOB ───────────────────────────────────────
// Pokreće scraper svakih N minuta
const cronExpr = `*/${INTERVAL} * * * *`;
cron.schedule(cronExpr, async () => {
  console.log(`[CRON] Pokretanje scrapeova — ${new Date().toISOString()}`);
  try {
    await runAllScrapers();
  } catch (err) {
    console.error('[CRON] Greška:', err.message);
  }
});

// ── START ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Pronađi backend pokrenut na portu ${PORT}`);
  console.log(`Scraper se pokreće svakih ${INTERVAL} min`);
  // Odmah pokreni prvi scrape pri startu
  setTimeout(runAllScrapers, 5000);
});

module.exports = app;
