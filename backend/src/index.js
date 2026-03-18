require('dotenv').config({ path: __dirname + '/../.env' });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { initAMI, sendCommand, originateCall } = require('./ami');
const { setupAMIEvents, resetStaleCalls } = require('./dialer');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Make io globally accessible (used by dialer.js)
global.io = io;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/sip',          require('./routes/sip'));
app.use('/api/campaigns',    require('./routes/campaigns'));
app.use('/api/audio',        require('./routes/audio'));
app.use('/api/call-logs',    require('./routes/callLogs'));

// Contact lists and contacts (same router handles both /contact-lists and /contacts)
const contactsRouter = require('./routes/contacts');
app.use('/api', contactsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Test a single call — returns originate result + SIP registry status
app.post('/api/test-call', async (req, res) => {
  const { phone_number, sip_account_id, audio_file } = req.body;
  if (!phone_number || !sip_account_id) {
    return res.status(400).json({ error: 'phone_number and sip_account_id required' });
  }

  const db = require('./db');
  const sip = db.prepare('SELECT * FROM sip_accounts WHERE id = ?').get(sip_account_id);
  if (!sip) return res.status(404).json({ error: 'SIP account not found' });

  // Check registry status first
  const { res: regRes } = await sendCommand('sip show registry');
  const toStr = (v) => Array.isArray(v) ? v.join('\n') : (v || '');
  const registry = toStr(regRes?.output);
  const isRegistered = registry.includes('Registered');

  // Fire a test originate
  const { v4: uuidv4 } = require('uuid');
  const actionId = 'test-' + uuidv4();
  const callerId = sip.caller_id
    ? `${sip.caller_id} <${sip.caller_id}>`
    : `${sip.username} <${sip.username}>`;

  const audioPath = audio_file
    ? `${process.env.ASTERISK_AUDIO_PREFIX}/${audio_file}`
    : `${process.env.ASTERISK_AUDIO_PREFIX}/demo-echotest`;

  try {
    const result = await originateCall({
      channel: `SIP/${sip.username}/${phone_number}`,
      callerId,
      timeout: 30000,
      actionId,
      variables: {
        CAMPAIGN_ID: 'test',
        SIP_USER: sip.username,
        ORIGINAL_NUMBER: phone_number,
        AUDIO_FILE: audioPath,
        DTMF_MAX_DIGITS: '1',
      },
    });
    res.json({ success: true, actionId, isRegistered, registry, result });
  } catch (err) {
    res.json({ success: false, error: err.message, isRegistered, registry });
  }
});

// SIP registration status (quick endpoint)
app.get('/api/sip-status', async (req, res) => {
  const { res: regRes } = await sendCommand('sip show registry');
  const { res: peerRes } = await sendCommand('sip show peers');

  const toStr = (v) => Array.isArray(v) ? v.join('\n') : (v || '');
  const registry = toStr(regRes?.output);
  const peers    = toStr(peerRes?.output);

  res.json({
    registry,
    peers,
    registered: registry.includes('Registered'),
  });
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[Socket] Client connected:', socket.id);
  socket.on('disconnect', () => console.log('[Socket] Client disconnected:', socket.id));
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`\n🚀 AutoDialer Backend running on http://localhost:${PORT}`);
  console.log(`   AMI → ${process.env.AMI_HOST}:${process.env.AMI_PORT} as ${process.env.AMI_USER}`);
  console.log(`   Sounds dir: ${process.env.ASTERISK_SOUNDS_DIR}\n`);

  // Reset any calls/campaigns left in bad state from previous run
  resetStaleCalls();

  // Connect to Asterisk AMI
  try {
    initAMI();
    setupAMIEvents();
    console.log('[AMI] Connecting...');
  } catch (e) {
    console.error('[AMI] Failed to connect:', e.message);
  }
});
