const AsteriskManager = require('asterisk-manager');

let ami = null;

function initAMI() {
  const port = parseInt(process.env.AMI_PORT || '5038');
  const host = process.env.AMI_HOST || 'localhost';
  const user = process.env.AMI_USER || 'autodialer_bot';
  const secret = process.env.AMI_SECRET || '583920174615809';

  ami = new AsteriskManager(port, host, user, secret, true);
  ami.keepConnected();

  ami.on('connect', () => console.log('[AMI] Connected to Asterisk'));
  ami.on('close', () => console.log('[AMI] Disconnected'));
  ami.on('error', (err) => console.error('[AMI] Error:', err.message));
  ami.on('invalidpass', () => console.error('[AMI] Invalid password'));

  return ami;
}

function getAMI() {
  if (!ami) initAMI();
  return ami;
}

function originateCall({ channel, variables, actionId, callerId, timeout }) {
  return new Promise((resolve, reject) => {
    const varArray = Object.entries(variables || {}).map(([k, v]) => `${k}=${v}`);
    const action = {
      Action: 'Originate',
      Channel: channel,
      Context: 'from-autodialer',
      Exten: 's',
      Priority: '1',
      Timeout: String(timeout || 30000),
      CallerID: callerId || 'AutoDialer <0000000000>',
      Async: 'true',
      ActionID: actionId,
      Variable: varArray,
    };
    getAMI().action(action, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
}

function sendCommand(cmd) {
  return new Promise((resolve) => {
    getAMI().action({ Action: 'Command', Command: cmd }, (err, res) => resolve({ err, res }));
  });
}

function hangupChannel(channel) {
  return new Promise((resolve) => {
    getAMI().action({ Action: 'Hangup', Channel: channel }, resolve);
  });
}

module.exports = { initAMI, getAMI, originateCall, sendCommand, hangupChannel };
