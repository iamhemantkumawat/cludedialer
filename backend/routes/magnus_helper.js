require('dotenv').config();
const crypto = require('crypto');
const qs = require('querystring');

const API_KEY    = process.env.MAGNUS_API_KEY    || '';
const API_SECRET = process.env.MAGNUS_API_SECRET || '';
const BASE_URL   = (process.env.MAGNUS_PUBLIC_URL || '').replace(/\/$/, '');

async function magnusRequest(module, action, data = {}) {
  if (!API_KEY || !API_SECRET || !BASE_URL) {
    throw new Error('Magnus API not configured');
  }

  const mt    = Date.now();
  const nonce = `${Math.floor(mt / 1000)}${String(mt % 1000).padStart(3, '0')}${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`;

  const payload = { module, action, nonce, ...data };
  const encoded = qs.stringify(payload);
  const sign    = crypto.createHmac('sha512', API_SECRET).update(encoded).digest('hex');

  const res = await fetch(`${BASE_URL}/index.php/${module}/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Key':  API_KEY,
      'Sign': sign,
    },
    body: encoded,
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Magnus returned non-JSON: ${text.slice(0, 200)}`);
  }
}

module.exports = { magnusRequest };
