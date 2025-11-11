const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = '15m';
const REFRESH_EXPIRY = '7d';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in environment variables');
}

/**
 * Generates access and refresh tokens for a user
 * @param {Object} user - User object with id and email
 * @returns {Object} - { accessToken, refreshToken }
 */
function generateTokens(user) {
  const payload = {
    userId: user.id,
    email: user.email
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  const refreshToken = jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_EXPIRY });

  return { accessToken, refreshToken };
}

/**
 * Middleware to verify JWT token
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
}

/**
 * Middleware to verify admin access
 */
function verifyAdmin(db) {
  return (req, res, next) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const event = db.prepare('SELECT admin_email FROM events WHERE id = ?').get(user.event_id);

    if (user.email !== event.admin_email) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  };
}

/**
 * Refreshes an access token using a refresh token
 * @param {string} refreshToken - The refresh token
 * @returns {Object} - { accessToken }
 */
function refreshAccessToken(refreshToken) {
  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const newAccessToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );
    return { accessToken: newAccessToken };
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
}

module.exports = {
  generateTokens,
  verifyToken,
  verifyAdmin,
  refreshAccessToken
};
