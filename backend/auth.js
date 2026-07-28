import crypto from 'node:crypto';
import { config } from './config.js';
import { hasAnyUser, createUser, verifyUser } from './lib/userStore.js';

const COOKIE_NAME = 'st-net-session';

/**
 * Dashboard sign-in is now a local admin account (username + password, stored hashed in
 * data/users.json) — separate from any MikroTik device's own credentials. Devices with
 * their own IP/user/password are managed under /api/devices instead (see routes.js).
 */

const sessions = new Map(); // token -> { username, expiresAt }

function prune() {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

function issue(username) {
  prune();
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, expiresAt: Date.now() + config.server.sessionTtlMs });
  return token;
}

export function currentSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

export function requireAuth(req, res, next) {
  const session = currentSession(req);
  if (!session) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }
  req.session = session;
  next();
}

export function registerAuthRoutes(app) {
  // Unauthenticated: lets the sign-in screen know whether to offer "sign up" or not.
  app.get('/api/auth/status', (req, res) => {
    res.json({ hasUsers: hasAnyUser() });
  });

  app.post('/api/auth/signup', (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');

    if (!username || !password) {
      res.status(400).json({ error: 'Enter both an admin ID and a password.' });
      return;
    }
    if (password.length < 4) {
      res.status(400).json({ error: 'Password must be at least 4 characters.' });
      return;
    }

    try {
      createUser({ username, password });
    } catch (err) {
      res.status(409).json({ error: err.message });
      return;
    }

    setCookie(res, issue(username));
    res.json({ username });
  });

  app.post('/api/auth/login', (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');

    if (!username || !password) {
      res.status(400).json({ error: 'Enter both an admin ID and a password.' });
      return;
    }

    if (!verifyUser({ username, password })) {
      res.status(401).json({ error: 'Incorrect admin ID or password.' });
      return;
    }

    setCookie(res, issue(username));
    res.json({ username });
  });

  app.post('/api/auth/logout', (req, res) => {
    const session = currentSession(req);
    if (session) sessions.delete(session.token);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.status(204).end();
  });

  app.get('/api/auth/me', (req, res) => {
    const session = currentSession(req);
    if (!session) {
      res.status(401).json({ error: 'Not signed in.' });
      return;
    }
    res.json({ username: session.username });
  });
}

function setCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: config.server.sessionTtlMs,
  });
}
