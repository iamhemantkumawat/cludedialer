require('dotenv').config();
const AsteriskManager = require('asterisk-manager');

let ami = null;
let io = null;
let connected = false;

// Event callbacks: { eventName(lowercase) -> [callbacks] }
const handlers = {};

function setIO(socketIO) {
  io = socketIO;
}

function connect() {
  ami = new AsteriskManager(
    parseInt(process.env.AMI_PORT) || 5038,
    process.env.AMI_HOST || 'localhost',
    process.env.AMI_USER || 'autodialer_bot',
    process.env.AMI_SECRET || '583920174615809',
    true // enable events
  );

  ami.keepConnected();

  ami.on('connect', () => {
    connected = true;
    console.log('[AMI] Connected to Asterisk at', process.env.AMI_HOST + ':' + process.env.AMI_PORT);
    if (io) io.emit('ami:status', { connected: true });
  });

  ami.on('close', () => {
    connected = false;
    console.warn('[AMI] Connection closed — will reconnect');
    if (io) io.emit('ami:status', { connected: false });
  });

  ami.on('error', (err) => {
    console.error('[AMI] Error:', err.message);
  });

  ami.on('managerevent', (evt) => {
    const name = (evt.event || '').toLowerCase();

    // Dispatch to registered handlers
    if (handlers[name]) {
      handlers[name].forEach(cb => {
        try { cb(evt); } catch (e) { console.error('[AMI handler error]', e.message); }
      });
    }

    // Push live events to connected browsers
    const liveEvents = ['newchannel', 'newstate', 'hangup', 'originateresponse', 'dtmfend', 'userevent'];
    if (io && liveEvents.includes(name)) {
      io.emit('ami:event', evt);
    }
  });
}

function on(event, callback) {
  const key = event.toLowerCase();
  if (!handlers[key]) handlers[key] = [];
  handlers[key].push(callback);
}

function off(event, callback) {
  const key = event.toLowerCase();
  if (handlers[key]) {
    handlers[key] = handlers[key].filter(cb => cb !== callback);
  }
}

function action(params) {
  return new Promise((resolve, reject) => {
    if (!ami) return reject(new Error('AMI not initialised'));
    ami.action(params, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
}

/**
 * Originate an outbound call.
 * @param {object} opts
 * @param {string} opts.actionid   - Unique ID to track this call
 * @param {string} opts.channel    - e.g. PJSIP/+14155551234@itsp:mydoe
 * @param {string} opts.context    - Dialplan context
 * @param {string} opts.exten      - Extension
 * @param {number} opts.priority   - Priority
 * @param {number} opts.timeout    - Ring timeout in ms
 * @param {string} opts.callerid   - Caller ID string
 * @param {string[]} opts.variables - Array of VAR=value strings
 */
function originate({ actionid, channel, context, exten, priority, timeout, callerid, variables = [] }) {
  const params = {
    action: 'Originate',
    actionid,
    channel,
    context,
    exten,
    priority: priority || 1,
    timeout: timeout || 30000,
    callerid: callerid || '',
    async: 'yes',
  };
  if (variables.length > 0) {
    // asterisk-manager sends arrays as multiple headers
    params.variable = variables;
  }
  return action(params);
}

function hangupChannel(channel) {
  return action({ action: 'Hangup', channel });
}

function getStatus() {
  return connected;
}

module.exports = { connect, on, off, action, originate, hangupChannel, setIO, getStatus };
