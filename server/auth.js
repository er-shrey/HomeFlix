// One Admin login per device, then "Who's watching?" profiles with optional 4-digit PINs.
import crypto from 'node:crypto';
import { db, now, parseRow } from './db.js';

const SESSION_DAYS = 90;

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

const newToken = () => crypto.randomBytes(32).toString('hex');

/**
 * A signed-in device gets two tokens. The session token goes in the Authorization header.
 * The media token can only fetch images, video and subtitles, because <img> and <video>
 * can't send headers and their URLs end up in more places.
 */
export function createSession() {
  const token = newToken();
  const t = now();
  db.prepare('INSERT INTO sessions (token, media_token, profile_id, created_at, expires_at) VALUES (?, ?, NULL, ?, ?)')
    .run(token, newToken(), t, t + SESSION_DAYS * 86400_000);
  return token;
}

function bearerToken(req) {
  const m = (req.headers.authorization || '').match(/^Bearer\s+([a-f0-9]{64})$/i);
  return m ? m[1] : null;
}

export function publicProfile(p) {
  if (!p) return null;
  const row = parseRow(p);
  return {
    id: row.id, name: row.name, avatar: row.avatar, hasPin: !!row.pin_hash,
    isKid: !!row.is_kid, maxAge: row.max_age, prefs: row.prefs,
  };
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** True when the request comes from the computer HomeFlix runs on (not another device on the network). */
export function isHostRequest(req) {
  return LOOPBACK.has(req.socket.remoteAddress);
}

/** Attaches req.session and req.profile (the raw profile row) when signed in. */
export function sessionMiddleware(req, _res, next) {
  let s = null;
  const token = bearerToken(req);
  if (token) {
    s = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').get(token, now());
  } else if (req.path.startsWith('/media/') && typeof req.query.mt === 'string') {
    // Media token: only accepted for /media URLs.
    s = db.prepare('SELECT * FROM sessions WHERE media_token = ? AND expires_at > ?').get(req.query.mt, now());
  }
  if (s) {
    if (!s.media_token) {
      s.media_token = newToken();
      db.prepare('UPDATE sessions SET media_token = ? WHERE token = ?').run(s.media_token, s.token);
    }
    req.session = s;
    if (s.profile_id) req.profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(s.profile_id) || null;
  }
  next();
}

export function requireLogin(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'Please sign in.', code: 'SIGNED_OUT' });
  next();
}

export function requireProfile(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'Please sign in.', code: 'SIGNED_OUT' });
  if (!req.profile) return res.status(409).json({ error: 'Choose a profile first.' });
  next();
}

// Admin settings stay unlocked while in use; after this long idle the password is asked again.
export const ADMIN_IDLE_MS = 10 * 60 * 1000;

export const adminUnlocked = (req) => !!req.session && !req.profile && (req.session.admin_until || 0) > now();

export function unlockAdmin(token) {
  db.prepare('UPDATE sessions SET admin_until = ? WHERE token = ?').run(now() + ADMIN_IDLE_MS, token);
}

export function lockAdmin(token) {
  db.prepare('UPDATE sessions SET admin_until = NULL WHERE token = ?').run(token);
}

/**
 * Admin settings: signed in, not watching as a profile, and the Admin password entered again
 * recently. A device stays signed in for everyone, so the password keeps children out.
 */
export function requireAdmin(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'Please sign in.', code: 'SIGNED_OUT' });
  if (req.profile) return res.status(403).json({ error: 'Open Admin settings from the "Who\'s watching?" screen.' });
  if (!adminUnlocked(req)) return res.status(403).json({ error: 'Enter the Admin password to open Admin settings.', code: 'ADMIN_LOCKED' });
  // Each use pushes the idle timeout back.
  unlockAdmin(req.session.token);
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
