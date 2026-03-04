const jwt = require('jsonwebtoken');

module.exports = function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Nema tokena. Prijavi se.' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, plan }
    next();
  } catch {
    return res.status(401).json({ error: 'Token nije valjan ili je istekao.' });
  }
};

// Middleware koji provjerava aktivnu pretplatu
module.exports.requireActive = function (req, res, next) {
  if (req.user.plan !== 'active') {
    return res.status(403).json({ error: 'Potrebna aktivna pretplata.' });
  }
  next();
};
