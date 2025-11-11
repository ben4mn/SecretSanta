const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/secretsanta.db');

async function initDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Database connection error:', err);
        reject(err);
        return;
      }

      // Enable foreign keys and serialize operations
      db.serialize(() => {
        db.run('PRAGMA foreign_keys = ON');

        // Create admins table
        db.run(`
          CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create events table
        db.run(`
          CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            max_spend REAL NOT NULL,
            bonus_item TEXT,
            theme TEXT,
            match_deadline DATE NOT NULL,
            gift_deadline DATE NOT NULL,
            all_registered BOOLEAN DEFAULT 0,
            matches_generated BOOLEAN DEFAULT 0,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'completed')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
          )
        `);

        // Create users table
        db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            email TEXT NOT NULL,
            name TEXT NOT NULL,
            password_hash TEXT,
            signup_token TEXT UNIQUE,
            token_expires DATETIME,
            is_registered BOOLEAN DEFAULT 0,
            signup_email_sent_at DATETIME,
            signup_email_opened_at DATETIME,
            last_login DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
            UNIQUE(event_id, email)
          )
        `);

        // Create matches table
        db.run(`
          CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            giver_id INTEGER NOT NULL,
            recipient_id INTEGER NOT NULL,
            encrypted_data TEXT NOT NULL,
            iv TEXT NOT NULL,
            auth_tag TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
            FOREIGN KEY (giver_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(event_id, giver_id)
          )
        `);

        // Create indexes
        db.run('CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email)');
        db.run('CREATE INDEX IF NOT EXISTS idx_events_admin ON events(admin_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
        db.run('CREATE INDEX IF NOT EXISTS idx_users_event ON users(event_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_users_token ON users(signup_token)');
        db.run('CREATE INDEX IF NOT EXISTS idx_matches_giver ON matches(giver_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_matches_event ON matches(event_id)');

        // Migrations: Add new columns to existing tables
        db.run(`ALTER TABLE events ADD COLUMN status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'completed'))`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Migration error (events.status):', err.message);
          }
        });

        db.run(`ALTER TABLE users ADD COLUMN signup_email_sent_at DATETIME`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Migration error (users.signup_email_sent_at):', err.message);
          }
        });

        db.run(`ALTER TABLE users ADD COLUMN signup_email_opened_at DATETIME`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Migration error (users.signup_email_opened_at):', err.message);
          }
        });

        // Create hardcoded admin account
        db.get('SELECT id FROM admins WHERE email = ?', ['ben@zyroi.com'], async (err, admin) => {
          if (err) {
            console.error('Error checking for admin:', err);
            return;
          }

          if (!admin) {
            // Hash password: Sniffles321!
            const passwordHash = await bcrypt.hash('Sniffles321!', 12);

            db.run(
              'INSERT INTO admins (email, password_hash, name) VALUES (?, ?, ?)',
              ['ben@zyroi.com', passwordHash, 'Ben'],
              (err) => {
                if (err) {
                  console.error('Error creating admin:', err);
                } else {
                  console.log('✅ Admin account created: ben@zyroi.com');
                }
              }
            );
          }
        });

        resolve(db);
      });
    });
  });
}

// Helper function to promisify database operations
function dbAll(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbGet(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbRun(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

module.exports = { initDatabase, DB_PATH, dbAll, dbGet, dbRun };
