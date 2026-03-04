const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../config/db');
const router   = express.Router();

// ── REGISTRACIJA ──────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, password, full_name, agency_name } = req.body;

  if (!email || !password || password.length < 8) {
    return res.status(400).json({ error: 'Email i lozinka (min. 8 znakova) su obavezni.' });
  }

  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email je već registriran.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      `INSERT INTO users (email, password_hash, full_name, agency_name)
       VALUES ($1, $2, $3, $4) RETURNING id, email, full_name, plan`,
      [email.toLowerCase(), hash, full_name || null, agency_name || null]
    );

    const user = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });

  } catch (err) {
    console.error('[AUTH] Register error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// ── PRIJAVA ───────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email i lozinka su obavezni.' });
  }

  try {
    const result = await db.query(
      'SELECT id, email, full_name, password_hash, plan FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Pogrešan email ili lozinka.' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Pogrešan email ili lozinka.' });
    }

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });

  } catch (err) {
    console.error('[AUTH] Login error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// ── TRENUTNI KORISNIK ─────────────────────────────────────
const authMiddleware = require('../middleware/auth');
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, full_name, agency_name, plan, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Korisnik nije pronađen.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// ── HELPERS ───────────────────────────────────────────────
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, plan: user.plan },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}
function publicUser(u) {
  return { id: u.id, email: u.email, full_name: u.full_name, plan: u.plan };
}

module.exports = router;
