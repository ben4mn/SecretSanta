const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  throw new Error('ENCRYPTION_KEY must be a 32-byte hex string (64 characters)');
}

const KEY_BUFFER = Buffer.from(ENCRYPTION_KEY, 'hex');

/**
 * Derives a user-specific encryption key from their password
 * @param {string} password - User's password
 * @param {string} salt - User's email (used as salt for consistency)
 * @returns {Buffer} - Derived key
 */
function deriveUserKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

/**
 * Encrypts data using AES-256-GCM with a user-derived key
 * @param {string} data - Data to encrypt (JSON string)
 * @param {string} password - User's password
 * @param {string} email - User's email (used as salt)
 * @returns {Object} - { encrypted, iv, authTag }
 */
function encryptMatch(data, password, email) {
  const key = deriveUserKey(password, email);
  const iv = crypto.randomBytes(12); // 12 bytes for GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * Decrypts data using AES-256-GCM with a user-derived key
 * @param {string} encrypted - Encrypted data (hex)
 * @param {string} iv - Initialization vector (hex)
 * @param {string} authTag - Authentication tag (hex)
 * @param {string} password - User's password
 * @param {string} email - User's email (used as salt)
 * @returns {string} - Decrypted data
 */
function decryptMatch(encrypted, iv, authTag, password, email) {
  const key = deriveUserKey(password, email);

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'hex')
  );

  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generates a secure random token
 * @param {number} bytes - Number of random bytes (default 32)
 * @returns {string} - Hex string token
 */
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = {
  encryptMatch,
  decryptMatch,
  generateToken,
  deriveUserKey
};
