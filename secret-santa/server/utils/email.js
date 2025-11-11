const nodemailer = require('nodemailer');
const { dbAll, dbRun } = require('../db/init');

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

if (!SMTP_USER || !SMTP_PASS) {
  console.warn('⚠️  Email not configured. Set SMTP_USER and SMTP_PASS environment variables.');
}

/**
 * Creates a Nodemailer transporter
 */
function createTransporter() {
  if (!SMTP_USER || !SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
}

/**
 * Sends signup invitation email with unique token
 * @param {Object} db - Database instance
 * @param {number} userId - User ID
 * @param {string} recipientEmail - Recipient's email
 * @param {string} recipientName - Recipient's name
 * @param {string} signupToken - Unique signup token
 */
async function sendSignupEmail(db, userId, recipientEmail, recipientName, signupToken) {
  const transporter = createTransporter();

  if (!transporter) {
    console.log(`📧 [DEV MODE] Signup email for ${recipientName} (${recipientEmail})`);
    console.log(`   Signup link: ${BASE_URL}/signup.html?token=${signupToken}`);

    // Track email as sent even in dev mode
    if (db && userId) {
      await dbRun(db, 'UPDATE users SET signup_email_sent_at = datetime(\'now\') WHERE id = ?', [userId]);
    }
    return;
  }

  const signupUrl = `${BASE_URL}/signup.html?token=${signupToken}`;

  const mailOptions = {
    from: `Secret Santa <${SMTP_USER}>`,
    to: recipientEmail,
    subject: '🎅 You\'re invited to Secret Santa 2024!',
    html: `
      <h2>🎅 Secret Santa 2024</h2>
      <p>Hi ${recipientName}!</p>
      <p>You've been invited to participate in Secret Santa 2024.</p>

      <h3>Event Details:</h3>
      <ul>
        <li>💵 Spending Limit: $50 maximum</li>
        <li>💿 Bonus: You can also gift a disc (doesn't count toward the $50)</li>
        <li>🎯 Theme: "Know Your Buddy" - Show how well you know your match!</li>
        <li>📅 Match Reveal: November 1st</li>
        <li>🎁 Gift Exchange: December 20th</li>
      </ul>

      <p><strong>Click the link below to create your password and join:</strong></p>
      <p><a href="${signupUrl}" style="background-color: #d42426; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Join Secret Santa</a></p>

      <p>Or copy this link: <a href="${signupUrl}">${signupUrl}</a></p>

      <p style="color: #666; font-size: 12px; margin-top: 24px;">This link will expire in 7 days.</p>

      <p>🎁 Remember: This is about thoughtfulness, not just spending!</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Signup email sent to ${recipientEmail}`);

    // Track email as sent
    if (db && userId) {
      await dbRun(db, 'UPDATE users SET signup_email_sent_at = datetime(\'now\') WHERE id = ?', [userId]);
    }
  } catch (error) {
    console.error(`❌ Failed to send email to ${recipientEmail}:`, error.message);
    throw error;
  }
}

/**
 * Sends match ready notification
 * @param {string} recipientEmail - Recipient's email
 * @param {string} recipientName - Recipient's name
 */
async function sendMatchReadyEmail(recipientEmail, recipientName) {
  const transporter = createTransporter();

  if (!transporter) {
    console.log(`📧 [DEV MODE] Match ready email for ${recipientName} (${recipientEmail})`);
    console.log(`   Login at: ${BASE_URL}`);
    return;
  }

  const loginUrl = BASE_URL;

  const mailOptions = {
    from: `Secret Santa <${SMTP_USER}>`,
    to: recipientEmail,
    subject: '🎁 Your Secret Santa match is ready!',
    html: `
      <h2>🎁 Your Secret Santa Match is Ready!</h2>
      <p>Hi ${recipientName}!</p>
      <p>Everyone has registered, and the Secret Santa matches have been generated!</p>

      <p><strong>Log in to see who you're buying for:</strong></p>
      <p><a href="${loginUrl}" style="background-color: #2e7d32; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">View Your Match</a></p>

      <p>Or visit: <a href="${loginUrl}">${loginUrl}</a></p>

      <h3>Reminder - Event Rules:</h3>
      <ul>
        <li>💵 Spending Limit: $50 maximum</li>
        <li>💿 Bonus: You can also gift a disc (doesn't count toward the $50)</li>
        <li>🎯 Theme: "Know Your Buddy" - Show how well you know your match!</li>
        <li>🎁 Gift Exchange: December 20th</li>
      </ul>

      <p>🤫 Remember to keep your match secret!</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Match ready email sent to ${recipientEmail}`);
  } catch (error) {
    console.error(`❌ Failed to send match email to ${recipientEmail}:`, error.message);
    throw error;
  }
}

/**
 * Sends signup emails to all participants
 * @param {Object} db - Database instance
 * @param {number} eventId - Event ID
 */
async function sendAllSignupEmails(db, eventId) {
  const users = await dbAll(db, 'SELECT * FROM users WHERE event_id = ? AND is_registered = 0', [eventId]);

  for (const user of users) {
    if (user.signup_token) {
      await sendSignupEmail(db, user.id, user.email, user.name, user.signup_token);
    }
  }

  console.log(`✅ Sent ${users.length} signup emails`);
}

/**
 * Sends match ready emails to all participants
 * @param {Object} db - Database instance
 * @param {number} eventId - Event ID
 */
async function sendAllMatchReadyEmails(db, eventId) {
  const users = await dbAll(db, 'SELECT * FROM users WHERE event_id = ? AND is_registered = 1', [eventId]);

  for (const user of users) {
    await sendMatchReadyEmail(user.email, user.name);
  }

  console.log(`✅ Sent ${users.length} match ready emails`);
}

module.exports = {
  sendSignupEmail,
  sendMatchReadyEmail,
  sendAllSignupEmails,
  sendAllMatchReadyEmails
};
