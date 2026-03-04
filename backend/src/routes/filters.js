const express = require('express');
const db      = require('../config/db');
const auth    = require('../middleware/auth');
const router  = express.Router();

router.use(auth);

// ── GET sve filtere korisnika ─────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM filters WHERE user_id = $1 ORDER BY created_at ASC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// ── POST novi filter ──────────────────────────────────────
router.post('/', async (req, res) => {
  const {
    name, property_types, locations,
    price_min, price_max, size_min, size_max,
    sources, show_agency, notify_email,
  } = req.body;

  try {
    const result = await db.query(
      `INSERT INTO filters
         (user_id, name, property_types, locations, price_min, price_max,
          size_min, size_max, sources, show_agency, notify_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        req.user.id,
        name || 'Moj filter',
        property_types || ['stan'],
        locations || [],
        price_min || null,
        price_max || null,
        size_min  || null,
        size_max  || null,
        sources   || ['njuskalo','index','plavi','cackaloo'],
        show_agency   ?? false,
        notify_email  ?? true,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[FILTERS] Create error:', err);
    res.status(500).json({ error: 'Greška pri kreiranju filtera.' });
  }
});

// ── PUT ažuriraj filter ───────────────────────────────────
router.put('/:id', async (req, res) => {
  const {
    name, property_types, locations,
    price_min, price_max, size_min, size_max,
    sources, show_agency, notify_email, is_active,
  } = req.body;

  try {
    // Provjeri da filter pripada ovom korisniku
    const check = await db.query(
      'SELECT id FROM filters WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'Filter nije pronađen.' });

    const result = await db.query(
      `UPDATE filters SET
         name = $1, property_types = $2, locations = $3,
         price_min = $4, price_max = $5, size_min = $6, size_max = $7,
         sources = $8, show_agency = $9, notify_email = $10, is_active = $11
       WHERE id = $12 AND user_id = $13
       RETURNING *`,
      [
        name, property_types, locations,
        price_min, price_max, size_min, size_max,
        sources, show_agency, notify_email, is_active ?? true,
        req.params.id, req.user.id,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Greška pri ažuriranju filtera.' });
  }
});

// ── DELETE filter ─────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM filters WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Filter nije pronađen.' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

module.exports = router;
