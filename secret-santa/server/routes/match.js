const express = require('express');
const bcrypt = require('bcrypt');
const { verifyToken } = require('../middleware/auth');
const { decryptMatch, encryptMatch } = require('../utils/crypto');
const { dbGet, dbRun, dbAll } = require('../db/init');

const router = express.Router();

/**
 * Fisher-Yates shuffle algorithm
 */
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generates a random derangement (no one gets themselves)
 * @param {Array} users - Array of user objects
 * @returns {Array} - Shuffled array where users[i] !== recipients[i]
 */
function generateRandomDerangement(users) {
  if (users.length < 2) {
    throw new Error('Need at least 2 participants');
  }

  let recipients = [...users];
  let isValid = false;
  let attempts = 0;
  const maxAttempts = 100;

  // Keep shuffling until we get a valid derangement
  while (!isValid && attempts < maxAttempts) {
    recipients = shuffle(users);

    // Check if anyone got themselves
    isValid = users.every((user, index) => user.id !== recipients[index].id);

    attempts++;
  }

  if (!isValid) {
    throw new Error('Could not generate valid matches after ' + maxAttempts + ' attempts');
  }

  return recipients;
}

/**
 * GET /api/match/my-match
 * Get the current user's Secret Santa match
 * Generates match on-demand if not already created
 */
router.get('/my-match', verifyToken, async (req, res) => {
  const { password } = req.query;

  if (!password) {
    return res.status(400).json({ error: 'Password required to decrypt match' });
  }

  const db = req.app.get('db');

  try {
    const user = await dbGet(db, 'SELECT * FROM users WHERE id = ?', [req.user.userId || req.user.id]);

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const event = await dbGet(db, 'SELECT * FROM events WHERE id = ?', [user.event_id]);

    // Check if all users are registered
    const allUsers = await dbAll(db, 'SELECT * FROM users WHERE event_id = ?', [user.event_id]);
    const allRegistered = allUsers.every(u => u.is_registered);

    if (!allRegistered) {
      return res.status(400).json({ error: 'Not all participants have registered yet' });
    }

    // Check if match already exists for this user
    let match = await dbGet(db, 'SELECT * FROM matches WHERE giver_id = ?', [user.id]);

    if (!match) {
      // Generate all matches if they don't exist yet
      if (!event.matches_generated) {
        console.log('🎲 Generating matches for the first time...');

        try {
          // Get all users in order
          const allUsersList = await dbAll(db, `
            SELECT id, email, name FROM users WHERE event_id = ? ORDER BY id
          `, [user.event_id]);

          // Generate true random derangement (no one gets themselves)
          const recipients = generateRandomDerangement(allUsersList);

          // Store matches with encryption on demand
          for (let i = 0; i < allUsersList.length; i++) {
            const giver = allUsersList[i];
            const recipient = recipients[i];

            // For the current user, encrypt immediately
            if (giver.id === user.id) {
              const matchData = JSON.stringify({
                recipientId: recipient.id,
                recipientName: recipient.name,
                recipientEmail: recipient.email
              });

              const encrypted = encryptMatch(matchData, password, user.email);

              await dbRun(db, `
                INSERT INTO matches (event_id, giver_id, recipient_id, encrypted_data, iv, auth_tag)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [
                user.event_id,
                giver.id,
                recipient.id,
                encrypted.encrypted,
                encrypted.iv,
                encrypted.authTag
              ]);
            } else {
              // For other users, store a placeholder that will be encrypted when they log in
              await dbRun(db, `
                INSERT INTO matches (event_id, giver_id, recipient_id, encrypted_data, iv, auth_tag)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [
                user.event_id,
                giver.id,
                recipient.id,
                'PENDING',
                'PENDING',
                'PENDING'
              ]);
            }
          }

          await dbRun(db, 'UPDATE events SET matches_generated = 1 WHERE id = ?', [user.event_id]);

          console.log('✅ Matches generated successfully with random derangement');

          // Get the newly created match
          match = await dbGet(db, 'SELECT * FROM matches WHERE giver_id = ?', [user.id]);
        } catch (error) {
          console.error('❌ Error generating matches:', error);
          return res.status(500).json({ error: 'Failed to generate matches' });
        }
      }
    }

    // If match is still pending encryption, encrypt it now
    if (match.encrypted_data === 'PENDING') {
      const recipient = await dbGet(db, 'SELECT * FROM users WHERE id = ?', [match.recipient_id]);

      const matchData = JSON.stringify({
        recipientId: recipient.id,
        recipientName: recipient.name,
        recipientEmail: recipient.email
      });

      const encrypted = encryptMatch(matchData, password, user.email);

      await dbRun(db, `
        UPDATE matches
        SET encrypted_data = ?, iv = ?, auth_tag = ?
        WHERE id = ?
      `, [encrypted.encrypted, encrypted.iv, encrypted.authTag, match.id]);

      match = await dbGet(db, 'SELECT * FROM matches WHERE id = ?', [match.id]);
    }

    // Decrypt the match
    try {
      const decrypted = decryptMatch(
        match.encrypted_data,
        match.iv,
        match.auth_tag,
        password,
        user.email
      );

      const matchData = JSON.parse(decrypted);

      res.json({
        match: {
          name: matchData.recipientName,
          email: matchData.recipientEmail
        },
        rules: {
          maxSpend: event.max_spend,
          bonusItem: event.bonus_item,
          theme: event.theme
        }
      });
    } catch (error) {
      console.error('Decryption error:', error);
      res.status(500).json({ error: 'Failed to decrypt match. Please check your password.' });
    }
  } catch (error) {
    console.error('Match fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/match/status
 * Check if matches are ready
 */
router.get('/status', verifyToken, async (req, res) => {
  const db = req.app.get('db');

  try {
    const user = await dbGet(db, 'SELECT * FROM users WHERE id = ?', [req.user.userId || req.user.id]);
    const event = await dbGet(db, 'SELECT * FROM events WHERE id = ?', [user.event_id]);

    const allUsers = await dbAll(db, 'SELECT * FROM users WHERE event_id = ?', [user.event_id]);
    const allRegistered = allUsers.every(u => u.is_registered);

    res.json({
      allRegistered,
      matchesGenerated: Boolean(event.matches_generated),
      matchDeadline: event.match_deadline,
      giftDeadline: event.gift_deadline
    });
  } catch (error) {
    console.error('Match status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
