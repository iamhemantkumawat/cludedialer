require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const db = require('./db');          // initialises DB on require
const ami = require('./ami');
const dialer = require('./dialer');
const { rebuildIvrDialplan } = require('./ivr');
const { accountRoom, resolveSessionById } = require('./account');

const app = express();
const server = http.createServer(app);
const frontendDir = path.join(__dirname, '../frontend/dist');
const brandLogoPath = path.join(__dirname, '../logo_custom.png');

const io = new Server(server, {
  cors: { origin: '*' },
});

io.use((socket, next) => {
  const sessionId = socket.handshake.auth?.sessionId || socket.handshake.query?.sessionId;
  const session = resolveSessionById(sessionId);
  if (!session?.username) {
    return next(new Error('Unauthorized'));
  }

  socket.accountId = session.username;
  next();
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve uploaded audio files
app.use('/audio', express.static(path.join(__dirname, '../data/audio')));

app.get('/brand/logo.png', (req, res) => {
  res.sendFile(brandLogoPath);
});

// Serve built frontend (no-cache so browsers always get latest index.html)
app.use(express.static(frontendDir, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/magnus',        require('./routes/magnus').router);
app.use('/api/sip',           require('./routes/sip'));
app.use('/api/campaigns',     require('./routes/campaigns'));
app.use('/api/ivrs',          require('./routes/ivrs'));
app.use('/api/contacts',      require('./routes/contacts'));
app.use('/api/calls',         require('./routes/calls'));
app.use('/api/audio',         require('./routes/audio'));
app.use('/api/contact-lists', require('./routes/contact-lists'));
app.use('/api/agents',        require('./routes/agents'));
app.use('/api/queue',         require('./routes/queue').router);
app.use('/api/reports',       require('./routes/reports'));

// ─── TTS preview endpoint ─────────────────────────────────────────────────────
// GET /api/tts/preview?text=...&language=en-US&voice=female
// Returns MP3 audio so the browser can play back the exact same voice used in calls
app.get('/api/tts/preview', async (req, res) => {
  const { text, language = 'en-US', voice = 'female' } = req.query;
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  try {
    const { renderTtsBuffer } = require('./tts');
    const mp3Buffer = await renderTtsBuffer(String(text).trim(), String(language), String(voice));
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.send(mp3Buffer);
  } catch (err) {
    console.error('[TTS preview]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ami: ami.getStatus() });
});

// React Router fallback
app.get(/^(?!\/api\/|\/audio\/|\/socket\.io\/).*/, (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.join(accountRoom(socket.accountId));
  // Send current AMI status on connect
  socket.emit('ami:status', { connected: ami.getStatus() });
  socket.on('disconnect', () => {});
});

// ─── Wire up IO to modules ────────────────────────────────────────────────────
ami.setIO(io);
dialer.setIO(io);

// ─── Start AMI ────────────────────────────────────────────────────────────────
ami.connect();

// ─── Start server (after DB is ready) ────────────────────────────────────────
const PORT = process.env.PORT || 3000;
db.ready.then(async () => {
  await rebuildIvrDialplan().catch((error) => {
    console.warn('[IVR] Dialplan rebuild skipped on boot:', error.message);
  });
  server.listen(PORT, () => {
    console.log(`\n  AutoDialer running at http://localhost:${PORT}`);
    console.log(`  AMI target: ${process.env.AMI_HOST}:${process.env.AMI_PORT}\n`);
  });
});
