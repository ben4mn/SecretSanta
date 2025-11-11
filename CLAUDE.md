# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Secret Santa** web application (`sss.zyroi.com`) with end-to-end encryption ensuring even the admin cannot see participant matches. The project is located in the `secret-santa/` subdirectory.

## Tech Stack

- **Backend**: Node.js + Express with SQLite
- **Security**: bcrypt (passwords), JWT (sessions), AES-256-GCM (match encryption)
- **Email**: Nodemailer with Gmail SMTP
- **Frontend**: Vanilla HTML/CSS/JS
- **Deployment**: Docker + Nginx

## Key Commands

```bash
# Development
cd secret-santa
npm install
npm run dev              # Start with nodemon auto-reload
npm start                # Production mode

# Docker deployment
docker-compose up -d     # Build and start
docker-compose logs -f   # View logs
docker-compose down      # Stop

# Generate secrets (required before first run)
openssl rand -base64 32  # JWT_SECRET
openssl rand -hex 32     # ENCRYPTION_KEY
```

## Architecture

### Critical Security Model

The entire system is built around **password-derived encryption** of matches:

1. **Match Generation**: When all users register, matches are generated using derangement algorithm (no self-matches)
2. **Encryption**: Each match is encrypted with the GIVER's password using AES-256-GCM
3. **Key Derivation**: User's password + email → PBKDF2 (100k iterations) → unique encryption key
4. **Decryption**: Only the giver can decrypt their match by providing their password at view time

**Important**: The admin cannot see matches because they don't have user passwords. The encryption key in `.env` is NOT used for matches - it's reserved for future features.

### Database Schema

```sql
admins (id, email, password_hash, name)
  └── events (id, admin_id, name, max_spend, bonus_item, theme, match_deadline, gift_deadline, all_registered, matches_generated)
       ├── users (id, event_id, email, name, password_hash, signup_token, token_expires, is_registered)
       └── matches (id, event_id, giver_id, recipient_id, encrypted_data, iv, auth_tag)
```

### Code Organization

```
server/
├── index.js                 # Express app setup, middleware, graceful shutdown
├── db/init.js              # SQLite schema, promisified db helpers (dbAll, dbGet, dbRun)
├── routes/
│   ├── auth.js             # /api/auth/* - signup, login, refresh (rate limited)
│   ├── admin.js            # /api/admin/* - event CRUD, send invites (requires JWT + admin check)
│   └── match.js            # /api/match/* - view match (decrypts using password from query param)
├── middleware/
│   └── auth.js             # JWT generation/verification, token refresh
└── utils/
    ├── crypto.js           # encryptMatch/decryptMatch with PBKDF2 key derivation
    ├── matching.js         # generateMatches (derangement), storeMatches
    └── email.js            # Nodemailer setup, signup/match-ready email templates

public/
├── index.html              # Login page
├── signup.html             # Password creation (accessed via token link)
├── admin.html              # Admin dashboard (event management, registration tracking)
└── style.css               # Shared styles
```

### Match Generation Flow

**Trigger**: Last user registers → `auth.js:109-123` checks if all registered

1. `server/utils/matching.js:generateMatches()` creates derangement
2. For each giver-recipient pair, encrypts recipient info with giver's password
3. Stores encrypted matches in database via `storeMatches()`
4. Sends "matches ready" emails to all participants

**Key insight**: Passwords are never stored in plaintext - they're only available during signup/login. The `generateMatches()` function receives temporary plaintext passwords during the signup flow to perform encryption, then they're discarded.

### Authentication Flow

- **Admin**: Login → JWT with `isAdmin: true` → access to `/api/admin/*` routes
- **Users**: Signup token (7-day expiry) → create password → JWT → access to `/api/match/*`
- **Rate limiting**: 5 attempts per 15 minutes on all auth endpoints

### Email Configuration

Uses Gmail SMTP with app password (NOT regular password):
- Generate at: https://myaccount.google.com/apppasswords
- `.env` requires: `SMTP_USER` and `SMTP_PASS`
- Templates in `server/utils/email.js`:
  - Signup invitation with token link: `{BASE_URL}/signup.html?token={token}`
  - Match ready notification

## Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
# Security (REQUIRED - generate these)
JWT_SECRET=<openssl rand -base64 32>
ENCRYPTION_KEY=<openssl rand -hex 32>

# Email (REQUIRED for production)
SMTP_USER=ben@zyroi.com
SMTP_PASS=gxzo zbzs eipb reub  # Gmail app password

# Application
BASE_URL=https://sss.zyroi.com  # Or http://localhost:3000 for dev
ADMIN_EMAIL=ben@zyroi.com
NODE_ENV=production

# Database
DB_PATH=./data/secretsanta.db

# Optional
SEND_INITIAL_EMAILS=false  # Set true to send invites on server start
```

## Hardcoded Configuration

**Admin credentials** (in `server/db/init.js:96-118`):
- Email: `ben@zyroi.com`
- Password: `Sniffles321!`
- Created on first database initialization

## Production Deployment Notes

1. Server runs on port 3001 (Docker maps 3000→3001)
2. Nginx proxies `sss.zyroi.com` → `localhost:3001`
3. SSL via `certbot --nginx -d sss.zyroi.com`
4. Database persists in `./data/secretsanta.db` (mounted volume)
5. Graceful shutdown handlers close database on SIGTERM/SIGINT

## Testing Local Changes

```bash
# Update .env for local testing
BASE_URL=http://localhost:3000
NODE_ENV=development

# Run server
npm run dev

# Test flow:
# 1. Admin login at /admin.html
# 2. Create event with participants
# 3. Send signup emails (check console logs in dev mode)
# 4. Visit signup links, create passwords for all users
# 5. Login as user, view encrypted match
```

## Important Development Notes

- **Never bypass encryption**: All match data MUST flow through `crypto.js:encryptMatch/decryptMatch`
- **Password handling**: Plaintext passwords only exist during signup/login request lifecycle
- **Database helpers**: Always use `dbAll/dbGet/dbRun` from `db/init.js` - they return Promises
- **Token expiry**: Signup tokens expire after 7 days, JWTs after 15 minutes (refresh tokens for extended sessions)
- **Cascading deletes**: Deleting an event automatically deletes all users and matches (foreign key constraints)
- **Rate limiting**: Auth endpoints are protected - avoid rapid requests during testing

## API Endpoints Reference

### Authentication
- `POST /api/auth/admin-login` - Admin login (email + password)
- `POST /api/auth/signup` - User registration (token + password, min 8 chars)
- `POST /api/auth/login` - User login (email + password)
- `POST /api/auth/refresh` - Refresh access token (refreshToken in body)

### Admin (requires JWT + admin privileges)
- `GET /api/admin/events` - List all events with participant counts
- `GET /api/admin/events/:id` - Get event details + participant list
- `POST /api/admin/events` - Create event (name, maxSpend, matchDeadline, giftDeadline, participants[])
- `PUT /api/admin/events/:id` - Update event (blocked after matches generated)
- `DELETE /api/admin/events/:id` - Delete event + cascade delete users/matches
- `POST /api/admin/events/:id/send-invites` - Send signup emails

### Matches (requires user JWT)
- `GET /api/match/my-match?password=xxx` - Decrypt and view match
- `GET /api/match/status` - Check if matches are ready

## Docker Notes

- Image: `node:18-alpine`
- Port mapping: 3001:3000
- Volume: `./data:/app/data` (SQLite persistence)
- Network: Bridge network `secret-santa-network`
- Restart policy: `unless-stopped`
