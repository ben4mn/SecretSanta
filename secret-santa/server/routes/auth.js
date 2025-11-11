const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { generateTokens, refreshAccessToken } = require('../middleware/auth');
const { dbGet, dbRun, dbAll } = require('../db/init');
const { sendAllMatchReadyEmails } = require('../utils/email');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: { error: 'Too many attempts, please try again later' }
});

/**
 * POST /api/auth/admin-login
 * Admin login with hardcoded credentials
 */
router.post('/admin-login', authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const db = req.app.get('db');

  try {
    const admin = await dbGet(db, 'SELECT * FROM admins WHERE email = ?', [email]);

    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const valid = await bcrypt.compare(password, admin.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate tokens
    const tokens = generateTokens({ id: admin.id, email: admin.email, isAdmin: true });

    res.json({
      message: 'Login successful',
      ...tokens,
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        isAdmin: true
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/signup
 * User creates password with signup token
 */
router.post('/signup', authLimiter, async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = req.app.get('db');

  try {
    // Find user by token
    const user = await dbGet(db, `
      SELECT * FROM users
      WHERE signup_token = ?
      AND token_expires > datetime('now')
      AND is_registered = 0
    `, [token]);

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update user
    await dbRun(db, `
      UPDATE users
      SET password_hash = ?,
          is_registered = 1,
          signup_token = NULL,
          token_expires = NULL
      WHERE id = ?
    `, [passwordHash, user.id]);

    console.log(`✅ User registered: ${user.name} (${user.email})`);

    // Check if all users registered
    const allUsers = await dbAll(db, 'SELECT * FROM users WHERE event_id = ?', [user.event_id]);
    const allRegistered = allUsers.every(u => u.is_registered);

    if (allRegistered) {
      const event = await dbGet(db, 'SELECT * FROM events WHERE id = ?', [user.event_id]);

      if (!event.matches_generated) {
        console.log('✅ All users registered! Matches will be generated on first login.');

        await dbRun(db, 'UPDATE events SET all_registered = 1 WHERE id = ?', [user.event_id]);

        // Send match ready emails
        await sendAllMatchReadyEmails(db, user.event_id);
      }
    }

    // Generate tokens
    const tokens = generateTokens({ id: user.id, email: user.email, userId: user.id });

    res.json({
      message: 'Registration successful',
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 * User login
 */
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const db = req.app.get('db');

  try {
    const user = await dbGet(db, 'SELECT * FROM users WHERE email = ? AND is_registered = 1', [email]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await dbRun(db, 'UPDATE users SET last_login = datetime(\'now\') WHERE id = ?', [user.id]);

    // Generate tokens
    const tokens = generateTokens({ id: user.id, email: user.email, userId: user.id });

    res.json({
      message: 'Login successful',
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        eventId: user.event_id
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  try {
    const result = refreshAccessToken(refreshToken);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

module.exports = router;
