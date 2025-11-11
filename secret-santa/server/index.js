require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase, dbGet } = require('./db/init');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const matchRoutes = require('./routes/match');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/match', matchRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
initDatabase()
  .then(db => {
    app.set('db', db);

    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════╗
║   🎅 Secret Santa Server Running 🎄      ║
╚═══════════════════════════════════════════╝

Server: http://localhost:${PORT}
Environment: ${process.env.NODE_ENV || 'development'}

Ready to spread holiday cheer! 🎁
      `);

      // Send initial signup emails if in production and not already sent
      if (process.env.SEND_INITIAL_EMAILS === 'true') {
        const { sendAllSignupEmails } = require('./utils/email');

        dbGet(db, 'SELECT id FROM events LIMIT 1')
          .then(event => {
            if (event) {
              return dbGet(db, 'SELECT COUNT(*) as count FROM users WHERE event_id = ? AND is_registered = 0', [event.id])
                .then(result => {
                  if (result.count > 0) {
                    return sendAllSignupEmails(db, event.id);
                  }
                });
            }
          })
          .then(() => console.log('✅ Initial signup emails sent'))
          .catch(err => console.error('❌ Failed to send initial emails:', err));
      }
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, closing database...');
      db.close(() => {
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('\nSIGINT received, closing database...');
      db.close(() => {
        process.exit(0);
      });
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

module.exports = app;
