# CyberX AutoDialer

A full-stack auto-dialer web application with IVR support, agent queue management, campaign reporting, and Google Cloud TTS integration — built on Asterisk + MagnusBilling.

---

## Features

- **Campaigns** — Upload contact lists, configure audio (upload or TTS), set concurrency & retry rules
- **IVR Builder** — Visual multi-node IVR with DTMF routing to agents, queues, or other menus
- **Run Campaign** — Live call feed, active call monitor, queue agent status
- **Campaign Reports** — Per-campaign answer rates, DTMF breakdown, call duration stats
- **CDR / History** — Full call detail records with filters
- **Contact Lists** — Reusable contact lists with per-contact status tracking
- **Agents** — SIP agent accounts for queue transfers
- **SIP Accounts** — MagnusBilling auto-sync + external SIP account support
- **Google Cloud TTS** — Neural2 voices in 11 languages with male/female selection

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router |
| Backend | Node.js, Express, Socket.io |
| Database | PostgreSQL |
| Telephony | Asterisk 20 (Docker), Asterisk AMI |
| Billing | MagnusBilling (API integration) |
| TTS | Google Cloud Text-to-Speech Neural2 |
| Audio | ffmpeg (MP3 → GSM conversion for Asterisk) |

---

## VPS Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| **OS** | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| **CPU** | 2 vCPU | 4 vCPU |
| **RAM** | 2 GB | 4 GB |
| **Disk** | 20 GB SSD | 40 GB SSD |
| **Network** | 100 Mbps | 1 Gbps |
| **Ports** | 3001, 5060 UDP, 5038, 10000-20000 UDP | same |

> **OS Recommendation: Ubuntu 22.04 LTS** — All scripts and instructions are tested on Ubuntu 22.04.

---

## Quick Install (Ubuntu 22.04)

### 1. Update system & install dependencies

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget build-essential python3 python3-pip ffmpeg nginx
```

### 2. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # should print v20.x.x
```

### 3. Install PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

# Create database and user
sudo -u postgres psql <<'SQL'
CREATE USER autodialer WITH PASSWORD 'autodialer123';
CREATE DATABASE autodialer OWNER autodialer;
GRANT ALL PRIVILEGES ON DATABASE autodialer TO autodialer;
SQL
```

### 4. Install Asterisk via Docker

```bash
# Clone the repo first
git clone https://github.com/iamhemantkumawat/cludedialer.git
cd cludedialer

# Run the Asterisk setup script (interactive — asks for SIP trunk details)
sudo bash scripts/asterisk-setup.sh
```

The script will:
- Install Docker if not present
- Pull Asterisk 20 Docker image
- Generate `sip.conf`, `manager.conf`, `extensions_local.conf`
- Start the container with `--net host` (required for SIP/RTP)
- Print the `.env` values to copy

### 5. Install and configure the backend

```bash
cd backend
npm install

# Copy example env and fill in your values
cp .env.example .env
nano .env
```

Required `.env` values:

```env
PORT=3001
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=autodialer
PG_USER=autodialer
PG_PASSWORD=autodialer123

AMI_HOST=localhost
AMI_PORT=5038
AMI_USER=autodialer_bot
AMI_SECRET=<from asterisk-setup.sh output>

ASTERISK_CONTAINER=local-asterisk
ASTERISK_CONTEXT=autodialer

MAGNUS_API_KEY=<from your MagnusBilling admin>
MAGNUS_API_SECRET=<from your MagnusBilling admin>
MAGNUS_PUBLIC_URL=https://your-magnus-domain.com/portal

GOOGLE_TTS_API_KEY=<your Google Cloud TTS API key>
```

### 6. Build the frontend

```bash
cd ../frontend
npm install
npm run build
```

### 7. Start the backend

```bash
cd ../backend
PORT=3001 node server.js
```

Open `http://YOUR_SERVER_IP:3001` in your browser and log in with your MagnusBilling credentials.

---

## Production Setup with PM2 + Nginx

### Run backend with PM2

```bash
sudo npm install -g pm2

cd /path/to/cludedialer/backend
pm2 start server.js --name autodialer -- --port 3001
pm2 startup
pm2 save
```

### Nginx reverse proxy

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

For HTTPS, use Certbot:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Asterisk Configuration Details

### Dialplan contexts

| Context | Purpose |
|---|---|
| `autodialer` | Campaign outbound calls land here |
| `autodialer-ivr-entry` | IVR flows entry point (auto-generated) |
| `ad_ivr_<flow>_<node>` | Per-IVR-node contexts (auto-generated) |

### AMI access

The backend connects to Asterisk AMI at port `5038` using the `autodialer_bot` user. This user needs `read=all write=all` permissions.

### SIP NAT fix

If callers can't hear agents (one-way audio), ensure your `sip.conf` has:
```ini
[general]
externip=YOUR_PUBLIC_IP
localnet=172.17.0.0/16
canreinvite=no
nat=force_rport,comedia
```

Then reload:
```bash
docker exec local-asterisk asterisk -rx "sip reload"
```

### Audio formats

The dialer generates MP3 via Google Cloud TTS, then ffmpeg converts to GSM (preferred) or WAV for Asterisk playback.

---

## MagnusBilling Integration

The dialer uses MagnusBilling as its authentication and billing backend.

1. Log in with your MagnusBilling username/password
2. Your SIP accounts are auto-synced on the SIP Accounts page
3. API keys are found in MagnusBilling Admin → Settings → API

---

## Google Cloud TTS Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Cloud Text-to-Speech API**
3. Go to **APIs & Services → Credentials → Create API Key**
4. Add the key to `backend/.env` as `GOOGLE_TTS_API_KEY`

**Supported languages with Neural2 voices:**

| Language | Code | Male | Female |
|---|---|---|---|
| English (US) | `en-US` | Neural2-D | Neural2-C |
| English (UK) | `en-GB` | Neural2-B | Neural2-A |
| English (India) | `en-IN` | Neural2-C | Neural2-A |
| English (Australia) | `en-AU` | Neural2-B | Neural2-A |
| Hindi | `hi-IN` | Neural2-B | Neural2-A |
| Italian | `it-IT` | Neural2-F | Neural2-A |
| Spanish | `es-ES` | Neural2-F | Neural2-A |
| German | `de-DE` | Neural2-H | Neural2-G |
| Portuguese (Brazil) | `pt-BR` | Neural2-B | Neural2-A |
| Portuguese (Portugal) | `pt-PT` | Wavenet-F | Wavenet-E |
| Turkish | `tr-TR` | Wavenet-B | Wavenet-A |

---

## Firewall Rules

```bash
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw allow 3001/tcp   # AutoDialer app (if not behind Nginx)
sudo ufw allow 5060/udp   # SIP
sudo ufw allow 5038/tcp   # Asterisk AMI (localhost only in prod)
sudo ufw allow 10000:20000/udp  # RTP audio
sudo ufw enable
```

---

## Directory Structure

```
cludedialer/
├── backend/
│   ├── server.js          # Express entry point
│   ├── db.js              # PostgreSQL wrapper
│   ├── ami.js             # Asterisk AMI client
│   ├── dialer.js          # Campaign dialing engine
│   ├── ivr.js             # IVR dialplan builder
│   ├── tts.js             # Google Cloud TTS / gTTS
│   ├── account.js         # Auth middleware
│   ├── routes/
│   │   ├── campaigns.js
│   │   ├── ivrs.js
│   │   ├── calls.js
│   │   ├── contacts.js
│   │   ├── contact-lists.js
│   │   ├── agents.js
│   │   ├── sip.js
│   │   ├── audio.js
│   │   ├── queue.js
│   │   ├── magnus.js
│   │   └── reports.js
│   ├── scripts/
│   │   └── gtts_render.py
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/           # Context, types, utils, API client
│   │   ├── components/    # Shared UI components
│   │   └── pages/         # Route pages
│   └── dist/              # Built frontend (served by backend)
├── scripts/
│   └── asterisk-setup.sh  # One-command Asterisk install
├── data/
│   └── audio/             # Uploaded audio files
└── README.md
```

---

## Troubleshooting

**Backend won't start**
- Check `PG_HOST`, `PG_USER`, `PG_PASSWORD` in `.env`
- Run `psql -U autodialer -d autodialer` to test DB connection

**AMI Offline badge in UI**
- Check `docker ps` — is `local-asterisk` running?
- Check `docker logs local-asterisk`
- Verify `AMI_USER` / `AMI_SECRET` match `manager.conf`

**Calls not connecting**
- Verify SIP trunk registration: `docker exec local-asterisk asterisk -rx "sip show registry"`
- Check firewall allows UDP 5060 and 10000-20000

**One-way audio (caller can't hear agent)**
- Set `externip=YOUR_PUBLIC_IP` in `sip.conf` and run `sip reload`

**TTS not working**
- Verify `GOOGLE_TTS_API_KEY` is set and the Cloud TTS API is enabled in your Google project

---

## License

MIT — free to use, modify, and deploy.
