// One household login, then "Who's watching?" profiles with optional 4-digit PINs.
import crypto from 'node:crypto';
import { db, now, parseRow } from './db.js';

const SESSION_DAYS = 90;
const COOKIE = 'homeflix_session';

export function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(secret, salt, 32);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function checkSecret(secret, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(secret), Buffer.from(salt, 'hex'), 32);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

export const accountExists = () => !!db.prepare('SELECT 1 FROM account WHERE id = 1').get();

export function createSession(res) {
  const token = crypto.randomBytes(32).toString('hex');
  const t = now();
  db.prepare('INSERT INTO sessions (token, profile_id, created_at, expires_at) VALUES (?, NULL, ?, ?)')
    .run(token, t, t + SESSION_DAYS * 86400_000);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: SESSION_DAYS * 86400_000 });
  return token;
}

function readCookie(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function publicProfile(p) {
  if (!p) return null;
  const row = parseRow(p);
  return {
    id: row.id, name: row.name, avatar: row.avatar, hasPin: !!row.pin_hash,
    isAdmin: !!row.is_admin, isKid: !!row.is_kid, maxAge: row.max_age, prefs: row.prefs,
  };
}

/** Attaches req.session and req.profile (the raw profile row) when logged in. */
export function sessionMiddleware(req, _res, next) {
  const token = readCookie(req);
  if (token) {
    const s = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').get(token, now());
    if (s) {
      req.session = s;
      if (s.profile_id) req.profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(s.profile_id) || null;
    }
  }
  next();
}

export function requireLogin(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'Please sign in.' });
  next();
}

export function requireProfile(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'Please sign in.' });
  if (!req.profile) return res.status(409).json({ error: 'Choose a profile first.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.profile?.is_admin) return res.status(403).json({ error: 'Only the admin profile can do this.' });
  next();
}

// A tiny in-memory limiter for passwords and PINs: 8 tries per minute per address.
const attempts = new Map();
export function tooManyAttempts(key) {
  const t = Date.now();
  const list = (attempts.get(key) || []).filter((x) => t - x < 60_000);
  list.push(t);
  attempts.set(key, list);
  return list.length > 8;
}

export const AVATARS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'teal', 'pink'];
