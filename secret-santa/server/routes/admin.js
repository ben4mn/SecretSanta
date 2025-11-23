const express = require('express');
const crypto = require('crypto');
const { verifyToken } = require('../middleware/auth');
const { dbGet, dbAll, dbRun } = require('../db/init');
const { sendAllSignupEmails, sendSignupEmail } = require('../utils/email');

const router = express.Router();

/**
 * Middleware to verify admin access
 */
async function verifyAdmin(req, res, next) {
  const db = req.app.get('db');

  try {
    const admin = await dbGet(db, 'SELECT * FROM admins WHERE id = ?', [req.user.userId || req.user.id]);

    if (!admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/admin/events
 * Get all events for admin
 */
router.get('/events', verifyToken, verifyAdmin, async (req, res) => {
  const db = req.app.get('db');

  try {
    const events = await dbAll(db, `
      SELECT
        e.*,
        COUNT(DISTINCT u.id) as total_participants,
        COUNT(DISTINCT CASE WHEN u.is_registered = 1 THEN u.id END) as registered_count,
        COUNT(DISTINCT CASE WHEN u.signup_email_sent_at IS NOT NULL THEN u.id END) as emails_sent
      FROM events e
      LEFT JOIN users u ON e.id = u.event_id
      WHERE e.admin_id = ?
      GROUP BY e.id
      ORDER BY e.created_at DESC
    `, [req.admin.id]);

    // Group events by status
    const activeEvents = events.filter(e => e.status === 'active');
    const inactiveEvents = events.filter(e => e.status === 'inactive');
    const completedEvents = events.filter(e => e.status === 'completed');

    res.json({
      events,
      stats: {
        active: activeEvents.length,
        inactive: inactiveEvents.length,
        completed: completedEvents.length,
        total: events.length
      }
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/events/:id
 * Get single event with participants
 */
router.get('/events/:id', verifyToken, verifyAdmin, async (req, res) => {
  const db = req.app.get('db');
  const eventId = req.params.id;

  try {
    const event = await dbGet(db, 'SELECT * FROM events WHERE id = ? AND admin_id = ?', [eventId, req.admin.id]);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const participants = await dbAll(db, `
      SELECT id, name, email, is_registered, last_login, created_at,
             signup_email_sent_at, signup_email_opened_at, signup_token
      FROM users
      WHERE event_id = ?
      ORDER BY created_at
    `, [eventId]);

    res.json({
      event: {
        id: event.id,
        name: event.name,
        maxSpend: event.max_spend,
        bonusItem: event.bonus_item,
        theme: event.theme,
        matchDeadline: event.match_deadline,
        giftDeadline: event.gift_deadline,
        allRegistered: Boolean(event.all_registered),
        matchesGenerated: Boolean(event.matches_generated),
        status: event.status,
        createdAt: event.created_at
      },
      participants: participants.map(p => ({
        id: p.id,
        name: p.name,
        email: p.email,
        isRegistered: Boolean(p.is_registered),
        emailSent: Boolean(p.signup_email_sent_at),
        emailSentAt: p.signup_email_sent_at,
        emailOpened: Boolean(p.signup_email_opened_at),
        lastLogin: p.last_login,
        hasToken: Boolean(p.signup_token)
      })),
      stats: {
        total: participants.length,
        registered: participants.filter(p => p.is_registered).length,
        pending: participants.filter(p => !p.is_registered).length,
        emailsSent: participants.filter(p => p.signup_email_sent_at).length,
        emailsOpened: participants.filter(p => p.signup_email_opened_at).length
      }
    });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/events
 * Create new event
 */
router.post('/events', verifyToken, verifyAdmin, async (req, res) => {
  const db = req.app.get('db');
  const { name, maxSpend, bonusItem, theme, matchDeadline, giftDeadline, participants } = req.body;

  if (!name || !maxSpend || !matchDeadline || !giftDeadline || !participants || participants.length < 2) {
    return res.status(400).json({ error: 'Missing required fields or insufficient participants' });
  }

  try {
    // Create event
    const result = await dbRun(db, `
      INSERT INTO events (admin_id, name, max_spend, bonus_item, theme, match_deadline, gift_deadline)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [req.admin.id, name, maxSpend, bonusItem || null, theme || null, matchDeadline, giftDeadline]);

    const eventId = result.lastID;

    // Create participants with signup tokens
    for (const participant of participants) {
      const signupToken = crypto.randomBytes(32).toString('hex');
      await dbRun(db, `
        INSERT INTO users (event_id, email, name, signup_token, token_expires)
        VALUES (?, ?, ?, ?, datetime('now', '+7 days'))
      `, [eventId, participant.email, participant.name, signupToken]);
    }

    console.log(`✅ Event created: ${name} with ${participants.length} participants`);

    // Optionally send signup emails
    if (req.body.sendEmails) {
      await sendAllSignupEmails(db, eventId);
    }

    res.json({ message: 'Event created successfully', eventId });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/events/:id
 * Update event
 */
router.put('/events/:id', verifyToken, verifyAdmin, async (req, res) => {
  const db = req.app.get('db');
  const eventId = req.params.id;
  const { name, maxSpend, bonusItem, theme, matchDeadline, giftDeadline } = req.body;

  try {
    const event = await dbGet(db, 'SELECT * FROM events WHERE id = ? AND admin_id = ?', [eventId, req.admin.id]);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.matches_generated) {
      return res.status(400).json({ error: 'Cannot edit event after matches are generated' });
    }

    await dbRun(db, `
      UPDATE events
      SET name = ?, max_spend = ?, bonus_item = ?, theme = ?, match_deadline = ?, gift_deadline = ?
      WHERE id = ?
    `, [name, maxSpend, bonusItem || null, theme || null, matchDeadline, giftDeadline, eventId]);

    res.json({ message: 'Event updated successfully' });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/events/:id
 * Delete event and all associated data
 */
router.delete('/events/:id', verifyToken, verifyAdmin, async (req, res) => {
  const db = req.app.get('db');
  const eventId = req.params.id;

  try {
    const event = await dbGet(db, 'SELECT * FROM events WHERE id = ? AND admin_id = ?', [eventId, req.admin.id]);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Delete event (cascade will delete users and matches)
    await dbRun(db, 'DELETE FROM events WHERE id = ?', [eventId]);

    console.log(`✅ Event deleted: ${event.name}`);

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/events/:id/send-invites
 * Send signup emails for an event
 */
router.post('/events/:id/send-invites', verifyToken, verifyAdmin, async (req, res) => {
  const db = req.app.get('db');
  const eventId = req.params.id;

  try {
    const event = await dbGet(db, 'SELECT * FROM events WHERE id = ? AND admin_id = ?', [eventId, req.admin.id]);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    await sendAllSignupEmails(db, eventId);
    res.json({ message: 'Signup emails sent successfully' });
  } catch (error) {
    console.error('Error sending signup emails:', error);
    res.status(500).json({ error: 'Failed to send emails' });
  }
});

/**
 * POST /api/admin/users/:id/resend-invite
 * Re-send signup email to a specific user
 */
router.post('/users/:id/resend-invite', verifyToken, verifyAdmin, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.params.id;

  try {
    const user = await dbGet(db, `
      SELECT u.*, e.admin_id
      FROM users u
      JOIN events e ON u.event_id = e.id
      WHERE u.id = ?
    `, [userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.admin_id !== req.admin.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (user.is_registered) {
      return res.status(400).json({ error: 'User already registered' });
    }

    if (!user.signup_token) {
      return res.status(400).json({ error: 'No signup token available' });
    }

    await sendSignupEmail(db, user.id, user.email, user.name, user.signup_token);
    res.json({ message: 'Invite email resent successfully' });
  } catch (error) {
    console.error('Error resending invite:', error);
    res.status(500).json({ error: 'Failed to resend invite' });
  }
});

/**
 * PATCH /api/admin/events/:id/status
 * Update event status (active, inactive, completed)
 */
router.patch('/events/:id/status', verifyToken, verifyAdmin, async (req, res) => {
  const db = req.app.get('db');
  const eventId = req.params.id;
  const { status } = req.body;

  if (!['active', 'inactive', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be: active, inactive, or completed' });
  }

  try {
    const event = await dbGet(db, 'SELECT * FROM events WHERE id = ? AND admin_id = ?', [eventId, req.admin.id]);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    await dbRun(db, 'UPDATE events SET status = ? WHERE id = ?', [status, eventId]);

    res.json({ message: 'Event status updated successfully', status });
  } catch (error) {
    console.error('Error updating event status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
