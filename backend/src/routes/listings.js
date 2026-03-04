const express = require('express');
const db      = require('../config/db');
const auth    = require('../middleware/auth');
const router  = express.Router();

// Sve rute zahtijevaju login i aktivnu pretplatu
router.use(auth);
router.use(auth.requireActive);

// ── GET /api/listings ─────────────────────────────────────
// Query params:
//   source, city, property_type, is_private, is_new,
//   price_min, price_max, size_min, size_max,
//   show_agency (boolean), price_dropped,
//   page (default 1), limit (default 30)
router.get('/', async (req, res) => {
  try {
    const {
      source, city, property_type,
      is_new, price_dropped,
      price_min, price_max,
      size_min, size_max,
      show_agency,
      page = 1, limit = 30,
    } = req.query;

    const conditions = ['l.is_active = TRUE'];
    const params     = [];
    let   p          = 1;

    if (source)        { conditions.push(`l.source = $${p++}`);         params.push(source); }
    if (city)          { conditions.push(`l.city ILIKE $${p++}`);        params.push(`%${city}%`); }
    if (property_type) { conditions.push(`l.property_type = $${p++}`);   params.push(property_type); }
    if (is_new === 'true') { conditions.push(`l.is_new = TRUE`); }
    if (price_dropped === 'true') { conditions.push(`l.price_dropped = TRUE`); }
    if (price_min)     { conditions.push(`l.price >= $${p++}`);          params.push(Number(price_min)); }
    if (price_max)     { conditions.push(`l.price <= $${p++}`);          params.push(Number(price_max)); }
    if (size_min)      { conditions.push(`l.size_sqm >= $${p++}`);       params.push(Number(size_min)); }
    if (size_max)      { conditions.push(`l.size_sqm <= $${p++}`);       params.push(Number(size_max)); }

    // Ako show_agency nije true → prikaži samo privatne
    if (show_agency !== 'true') {
      conditions.push(`l.is_private = TRUE`);
    }

    const offset  = (Number(page) - 1) * Number(limit);
    const where   = conditions.join(' AND ');

    const [listingsRes, countRes] = await Promise.all([
      db.query(
        `SELECT l.*,
                a.avg_price_per_sqm AS area_avg_price_per_sqm
         FROM listings l
         LEFT JOIN area_price_stats a
           ON a.city = l.city
         WHERE ${where}
         ORDER BY l.scraped_at DESC
         LIMIT $${p++} OFFSET $${p++}`,
        [...params, Number(limit), offset]
      ),
      db.query(`SELECT COUNT(*) FROM listings l WHERE ${where}`, params),
    ]);

    res.json({
      listings:    listingsRes.rows,
      total:       parseInt(countRes.rows[0].count),
      page:        Number(page),
      total_pages: Math.ceil(parseInt(countRes.rows[0].count) / Number(limit)),
    });

  } catch (err) {
    console.error('[LISTINGS] Greška:', err);
    res.status(500).json({ error: 'Greška pri dohvatu oglasa.' });
  }
});

// ── GET /api/listings/:id ─────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM listings WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Oglas nije pronađen.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// ── GET /api/listings/stats/summary ──────────────────────
router.get('/stats/summary', async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const [todayCount, privateCount, droppedCount] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM listings WHERE scraped_at >= $1 AND is_active = TRUE`, [today]),
      db.query(`SELECT COUNT(*) FROM listings WHERE scraped_at >= $1 AND is_private = TRUE AND is_active = TRUE`, [today]),
      db.query(`SELECT COUNT(*) FROM listings WHERE price_dropped = TRUE AND price_dropped_at >= $1 AND is_active = TRUE`, [today]),
    ]);
    res.json({
      today:    parseInt(todayCount.rows[0].count),
      private:  parseInt(privateCount.rows[0].count),
      dropped:  parseInt(droppedCount.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

module.exports = router;
