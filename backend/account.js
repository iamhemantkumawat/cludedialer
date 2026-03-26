const { sessions } = require('./routes/magnus');

function normalizeAccountId(value) {
  return String(value || '').trim();
}

function resolveSessionById(sessionId) {
  const safeId = normalizeAccountId(sessionId);
  if (!safeId) return null;
  return sessions.get(safeId) || null;
}

function resolveAccount(req) {
  const session = resolveSessionById(req.headers['x-magnus-session'] || req.query.session);
  const headerAccountId = normalizeAccountId(req.headers['x-account-id'] || req.query.account_id);

  if (session && headerAccountId && headerAccountId !== session.username) {
    return { error: 'Account mismatch' };
  }

  const accountId = normalizeAccountId(session?.username || headerAccountId);
  return { session, accountId };
}

function requireAccount(req, res, next) {
  const { session, accountId, error } = resolveAccount(req);

  if (error) {
    return res.status(403).json({ error });
  }

  if (!session || !accountId) {
    return res.status(401).json({ error: 'Not authenticated with MagnusBilling' });
  }

  req.magnusSession = session;
  req.accountId = accountId;
  next();
}

function accountRoom(accountId) {
  return `account:${normalizeAccountId(accountId)}`;
}

module.exports = {
  accountRoom,
  normalizeAccountId,
  requireAccount,
  resolveAccount,
  resolveSessionById,
};
