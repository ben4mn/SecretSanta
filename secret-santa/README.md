# 🎅 Secret Santa 2024

A secure, cheat-proof Secret Santa web application with end-to-end encryption.

## Features

- 🔐 **Encrypted Matches** - Matches are encrypted with each user's password, ensuring even the admin cannot see them
- 🎯 **Secure Authentication** - JWT-based auth with bcrypt password hashing
- 📧 **Email Notifications** - Automated signup invitations and match notifications
- 📊 **Admin Dashboard** - Track registration progress without seeing matches
- 🐳 **Docker Ready** - Easy deployment with Docker Compose

## Quick Start

### 1. Install Dependencies

```bash
cd secret-santa
npm install
```

### 2. Generate Secrets

```bash
# Generate JWT secret
openssl rand -base64 32

# Generate encryption key
openssl rand -hex 32
```

### 3. Configure Environment

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
nano .env
```

### 4. Run Locally

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

Server will be available at `http://localhost:3000`

## 🚀 Deployment

For detailed instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).

### Quick Docker Deployment

1.  **Configure Environment**:
    ```bash
    cp .env.example .env
    # Edit .env with your secrets and email config
    nano .env
    ```

2.  **Build and Run**:
    ```bash
    docker-compose up -d --build
    ```

3.  **Verify**:
    ```bash
    docker-compose logs -f
    ```

The application will be available at `http://localhost:3000` (or your configured port).

### Requirements
- Docker & Docker Compose
- Gmail account with App Password (for emails)

## Production Deployment

### 1. Server Setup

```bash
# SSH to server
ssh user@zyroi.com

# Clone repository
cd /var/www
git clone <repo-url> secret-santa
cd secret-santa

# Create .env file with production values
cp .env.example .env
nano .env

# Start with Docker
docker-compose up -d
```

### 2. Nginx Configuration

Create `/etc/nginx/sites-available/sss.zyroi.com`:

```nginx
server {
    listen 80;
    server_name sss.zyroi.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name sss.zyroi.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. SSL Certificate

```bash
sudo certbot --nginx -d sss.zyroi.com
```

## Event Configuration

Edit the event details in `server/db/init.js`:

```javascript
const EVENT_RULES = {
  maxSpend: 50,
  bonusItem: "disc (does not count toward $50 limit)",
  theme: "Know Your Buddy - How well we know each other",
  matchDeadline: "2024-11-01",
  giftDeadline: "2024-12-20"
};

const PARTICIPANTS = [
  { name: "Ben", email: "ben@zyroi.com" },
  { name: "Gabe", email: "gabe@placeholder.com" },
  { name: "Nick", email: "nick@placeholder.com" },
  { name: "Storm", email: "storm@placeholder.com" }
];
```

## How It Works

### Security Model

1. **Signup** - Admin creates event with participant emails
2. **Tokens** - Each participant gets a unique signup token via email
3. **Password Creation** - Users create passwords (min 8 characters)
4. **Match Generation** - When all users register, matches are generated
5. **Encryption** - Each match is encrypted with the recipient's password-derived key
6. **Decryption** - Only the user can decrypt their match with their password

### Why This Is Secure

- Matches are encrypted using AES-256-GCM
- Encryption keys are derived from user passwords using PBKDF2
- Admin cannot decrypt matches (doesn't have user passwords)
- Database admin cannot see plaintext matches
- No password reset without email access

## API Endpoints

### Authentication

- `POST /api/auth/signup` - Create account with signup token
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/refresh` - Refresh access token

### Admin

- `GET /api/admin/status` - Get registration progress
- `POST /api/admin/send-invites` - Send signup emails
- `GET /api/admin/rules` - Get event rules

### Matches

- `GET /api/match/my-match?password=xxx` - View your match
- `GET /api/match/status` - Check if matches are ready

## Database Schema

```sql
events (id, admin_email, rules, match_deadline, gift_deadline, all_registered, matches_generated)
users (id, event_id, email, name, password_hash, signup_token, is_registered)
matches (id, event_id, giver_id, recipient_id, encrypted_data, iv, auth_tag)
```

## Tech Stack

- **Backend**: Node.js, Express
- **Database**: SQLite with better-sqlite3
- **Security**: bcrypt, jsonwebtoken, AES-256-GCM
- **Email**: Nodemailer with Gmail
- **Frontend**: Vanilla HTML/CSS/JS
- **Deployment**: Docker, Nginx

## License

MIT
