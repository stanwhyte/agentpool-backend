# AgentPool Backend

Secure Express API backend for AgentPool. Proxies all AI provider requests
server-side so API keys never reach the browser.

---

## Architecture

```
Browser (React frontend)
    │
    │  POST /api/agent        ← JWT in Authorization header
    │  POST /api/auth/login   ← username + password
    │  GET  /api/github/...   ← repo context fetching
    │  POST /api/notify       ← Slack + email alerts
    │
    ▼
Express Backend (this server)
    │  reads keys from /etc/agentpool/.env
    │
    ├──▶  api.anthropic.com
    ├──▶  api.openai.com
    ├──▶  api.perplexity.ai
    ├──▶  generativelanguage.googleapis.com
    ├──▶  api.groq.com
    └──▶  api.github.com
```

---

## Files

```
agentpool-backend/
├── src/
│   ├── index.js              ← Express app, middleware, server start
│   ├── routes/
│   │   ├── agent.js          ← POST /api/agent (streaming AI proxy)
│   │   ├── auth.js           ← Login, JWT, team management
│   │   ├── github.js         ← GitHub API proxy
│   │   └── notify.js         ← Slack + email notifications
│   ├── middleware/
│   │   ├── auth.js           ← JWT verify + role-based access
│   │   └── rateLimit.js      ← Global + per-user rate limiting
│   ├── providers/
│   │   └── index.js          ← All 5 AI provider stream adapters
│   └── utils/
│       ├── logger.js         ← Winston structured logging (SOC 2)
│       └── budget.js         ← Server-side spend tracking + caps
├── logs/                     ← Auto-created: combined, error, audit
├── .env.example              ← Template — copy to /etc/agentpool/.env
└── package.json
```

---

## Step 1 — Collect Your API Keys

| Key | Where to get it |
|-----|----------------|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| `PERPLEXITY_API_KEY` | https://www.perplexity.ai/settings/api |
| `GOOGLE_API_KEY` | https://aistudio.google.com/app/apikey |
| `GROQ_API_KEY` | https://console.groq.com/keys |
| `GITHUB_TOKEN` | https://github.com/settings/tokens → Fine-grained |

**GitHub Token scopes needed:**
- `repo` (read/write your repos)
- `read:org` (if using org repos)
- Set expiry to 90 days and rotate on calendar

---

## Step 2 — Local Development

```bash
# Clone and install
git clone https://github.com/yourname/agentpool.git
cd agentpool/backend
npm install

# Create local .env (NEVER commit this)
cp .env.example .env
# Edit .env and add your real keys

# Add to .gitignore (check it's there)
echo ".env" >> ../.gitignore
echo ".env.*" >> ../.gitignore

# Install gitleaks to prevent accidental key commits
brew install gitleaks   # macOS
# or: apt install gitleaks

# Add pre-commit hook
cat > ../.git/hooks/pre-commit << 'EOF'
#!/bin/sh
gitleaks detect --staged --no-git -v
if [ $? -ne 0 ]; then
  echo "gitleaks: potential secret detected — commit blocked"
  exit 1
fi
EOF
chmod +x ../.git/hooks/pre-commit

# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Paste output into .env as JWT_SECRET

# Start development server
npm run dev
# → http://localhost:3001/health
```

---

## Step 3 — DigitalOcean Droplet Setup

```bash
# SSH into your new droplet
ssh root@YOUR_DROPLET_IP

# Create non-root user
adduser stan
usermod -aG sudo stan
rsync --archive --chown=stan:stan ~/.ssh /home/stan

# Harden SSH
nano /etc/ssh/sshd_config
# Set: PermitRootLogin no
# Set: PasswordAuthentication no
systemctl restart sshd

# Firewall
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable

# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# PM2
sudo npm install -g pm2

# Nginx
sudo apt install -y nginx certbot python3-certbot-nginx
```

---

## Step 4 — Deploy the Backend

```bash
# On the server as stan
cd /var/www
git clone https://github.com/yourname/agentpool.git
cd agentpool/backend
npm install --production

# Create secure env file OUTSIDE the repo
sudo mkdir -p /etc/agentpool
sudo nano /etc/agentpool/.env
# Paste all your keys (see .env.example for template)

# Lock it down
sudo chown stan:stan /etc/agentpool/.env
sudo chmod 600 /etc/agentpool/.env

# Verify only you can read it
ls -la /etc/agentpool/.env
# Should show: -rw------- 1 stan stan

# Start with PM2
pm2 start src/index.js \
  --name agentpool-api \
  --env-file /etc/agentpool/.env \
  --node-args="--experimental-specifier-resolution=node"

pm2 save
pm2 startup
# Run the command PM2 prints

# Verify it's running
pm2 status
curl http://localhost:3001/health
```

---

## Step 5 — Nginx Reverse Proxy + HTTPS

```bash
# Create Nginx config
sudo nano /etc/nginx/sites-available/agentpool

# Paste this config:
```

```nginx
server {
    server_name api.yourdomain.com;

    # Proxy to Express
    location / {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # SSE — disable buffering for streaming responses
        proxy_buffering    off;
        proxy_read_timeout 300s;
        chunked_transfer_encoding on;
    }
}
```

```bash
# Enable and get SSL cert
sudo ln -s /etc/nginx/sites-available/agentpool /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d api.yourdomain.com
# → HTTPS now live at https://api.yourdomain.com
```

---

## Step 6 — Update React Frontend

Replace all direct `fetch("https://api.anthropic.com/...")` calls with:

```javascript
// src/api.js
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
let authToken = localStorage.getItem('agentpool_token');

export async function login(username, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (data.token) {
    authToken = data.token;
    localStorage.setItem('agentpool_token', data.token);
  }
  return data;
}

export async function streamAgent({ model, system, messages, agentId, sessionId, onChunk }) {
  const res = await fetch(`${API_BASE}/api/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ model, system, messages, agentId, sessionId }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const d = line.slice(6).trim();
      if (d === '[DONE]') return;
      try {
        const parsed = JSON.parse(d);
        if (parsed.text) onChunk(parsed.text);
        if (parsed.error) throw new Error(parsed.error);
      } catch {}
    }
  }
}
```

Add to your `.env` in the frontend:
```
VITE_API_URL=https://api.yourdomain.com
```

---

## Step 7 — GitHub Actions (CI/CD)

Add these secrets to your GitHub repo → Settings → Secrets:

```
DO_SERVER_IP         your droplet IP
DO_SSH_PRIVATE_KEY   your private SSH key (cat ~/.ssh/id_rsa)
SLACK_WEBHOOK_URL    for deploy notifications
```

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Backend

on:
  push:
    branches: [main]
    paths: ['backend/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to DigitalOcean
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DO_SERVER_IP }}
          username: stan
          key: ${{ secrets.DO_SSH_PRIVATE_KEY }}
          script: |
            cd /var/www/agentpool/backend
            git pull origin main
            npm install --production
            pm2 restart agentpool-api
            echo "Deploy complete: $(date)"

      - name: Notify Slack
        if: always()
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK_URL }} \
            -H 'Content-type: application/json' \
            --data '{"text":"Backend deployed to production ✓"}'
```

---

## Key Rotation Checklist (every 90 days)

```bash
# 1. Generate new key at provider console
# 2. Update on server:
sudo nano /etc/agentpool/.env
# Replace the key

# 3. Restart backend:
pm2 restart agentpool-api

# 4. Verify health:
curl https://api.yourdomain.com/health
# Check that provider shows: true

# 5. Update GitHub Secrets with new key (for CI/CD)
# 6. Log the rotation date for SOC 2 evidence
```

---

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | None | Get JWT token |
| GET | `/api/auth/me` | JWT | Current user |
| POST | `/api/auth/users` | Owner | Create team member |
| GET | `/api/auth/users` | Owner | List team |
| DELETE | `/api/auth/users/:u` | Owner | Remove user |
| POST | `/api/agent` | JWT+Developer | Stream AI response |
| GET | `/api/agent/budget` | JWT | Budget status |
| GET | `/api/github/repos` | JWT | List repos |
| GET | `/api/github/repo/:o/:r/readme` | JWT | Fetch README |
| GET | `/api/github/repo/:o/:r/tree` | JWT | Fetch file tree |
| POST | `/api/github/notify` | JWT+Developer | Trigger repo dispatch |
| POST | `/api/github/pr-comment` | JWT+Reviewer | Post PR comment |
| POST | `/api/notify` | JWT | Send Slack+email alert |
| GET | `/health` | None | Server status |
