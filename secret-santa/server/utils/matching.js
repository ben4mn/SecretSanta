const { encryptMatch } = require('./crypto');

/**
 * Fisher-Yates shuffle algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} - Shuffled array
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
 * Generates Secret Santa matches ensuring no self-matches
 * Uses derangement algorithm for circular matching
 * @param {Array} users - Array of user objects with id, email, name, password
 * @returns {Array} - Array of match objects
 */
function generateMatches(users) {
  if (users.length < 2) {
    throw new Error('Need at least 2 participants');
  }

  // Create a derangement (no person gets themselves)
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

  // Create encrypted matches
  const matches = [];

  for (let i = 0; i < users.length; i++) {
    const giver = users[i];
    const recipient = recipients[i];

    // Data to encrypt (only recipient info)
    const matchData = JSON.stringify({
      recipientId: recipient.id,
      recipientName: recipient.name,
      recipientEmail: recipient.email
    });

    // Encrypt with giver's password
    // Note: password needs to be provided when generating matches
    if (!giver.password) {
      throw new Error(`Password required for user ${giver.email} to encrypt match`);
    }

    const encrypted = encryptMatch(matchData, giver.password, giver.email);

    matches.push({
      giverId: giver.id,
      recipientId: recipient.id,
      encryptedData: encrypted.encrypted,
      iv: encrypted.iv,
      authTag: encrypted.authTag
    });
  }

  return matches;
}

/**
 * Stores matches in the database
 * @param {Object} db - Database instance
 * @param {number} eventId - Event ID
 * @param {Array} matches - Array of match objects
 */
function storeMatches(db, eventId, matches) {
  const insertMatch = db.prepare(`
    INSERT INTO matches (event_id, giver_id, recipient_id, encrypted_data, iv, auth_tag)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const updateEvent = db.prepare(`
    UPDATE events SET matches_generated = 1, all_registered = 1 WHERE id = ?
  `);

  // Use transaction for atomicity
  const transaction = db.transaction(() => {
    for (const match of matches) {
      insertMatch.run(
        eventId,
        match.giverId,
        match.recipientId,
        match.encryptedData,
        match.iv,
        match.authTag
      );
    }
    updateEvent.run(eventId);
  });

  transaction();
}

/**
 * Checks if all users are registered and generates matches if so
 * @param {Object} db - Database instance
 * @param {number} eventId - Event ID
 * @param {Array} usersWithPasswords - Array of users with temporary passwords for encryption
 * @returns {boolean} - True if matches were generated
 */
function checkAndGenerateMatches(db, eventId, usersWithPasswords) {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);

  if (event.matches_generated) {
    return false; // Matches already generated
  }

  const allUsers = db.prepare('SELECT * FROM users WHERE event_id = ?').all(eventId);
  const allRegistered = allUsers.every(user => user.is_registered);

  if (!allRegistered) {
    return false; // Not everyone has registered yet
  }

  // Generate matches
  const matches = generateMatches(usersWithPasswords);

  // Store in database
  storeMatches(db, eventId, matches);

  return true;
}

module.exports = {
  generateMatches,
  storeMatches,
  checkAndGenerateMatches,
  shuffle
};
