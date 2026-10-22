import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db, now, getSetting, setSetting } from '../db.js';
import { ROOT_DIR } from '../config.js';
import {
  accountExists, hashSecret, checkSecret, createSession, publicProfile,
  requireLogin, requireProfile, requireAdmin, tooManyAttempts, AVATARS,
} from '../auth.js';
import { scanLibrary, startWatching } from '../scanner.js';

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({
    setupDone: accountExists(),
    loggedIn: !!req.session,
    profile: publicProfile(req.profile),
    householdName: getSetting('household_name', 'HomeFlix'),
  });
});

// Folder suggestions for the setup wizard, so nobody has to type a path from memory.
router.get('/setup/suggest', (_req, res) => {
  if (accountExists()) return res.json([]);
  const home = os.homedir();
  const candidates = [
    path.join(ROOT_DIR, 'mock-library'),
    path.join(home, 'Movies'), path.join(home, 'Videos'), path.join(home, 'Desktop', 'Movies'), path.join(home, 'Media'),
  ];
  res.json(candidates.filter((c) => fs.existsSync(c)));
});

const validPin =(pin) => pin === undefined || pin === null || pin === '' || /^\d{4}$/.test(String(pin));

router.post('/setup', (req, res) => {
  if (accountExists()) return res.status(409).json({ error: 'HomeFlix is already set up.' });
  const { username, password, profileName, pin, libraryPath, householdName } = req.body || {};
  if (!username?.trim() || !password || password.length < 4) return res.status(400).json({ error: 'Choose a username and a password of at least 4 characters.' });
  if (!profileName?.trim()) return res.status(400).json({ error: 'Give your profile a name.' });
  if (!validPin(pin)) return res.status(400).json({ error: 'A PIN must be exactly 4 digits.' });
  const lib = libraryPath?.trim();
  if (!lib || !fs.existsSync(lib) || !fs.statSync(lib).isDirectory()) return res.status(400).json({ error: 'That library folder does not exist on this computer.' });

  db.prepare('INSERT INTO account (id, username, password_hash) VALUES (1, ?, ?)').run(username.trim(), hashSecret(password));
  const p = db.prepare('INSERT INTO profiles (name, avatar, pin_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)')
    .run(profileName.trim(), 'red', pin ? hashSecret(String(pin)) : null, now());
  setSetting('library_path', path.resolve(lib));
  if (householdName?.trim()) setSetting('household_name', householdName.trim());
  const token = createSession(res);
  db.prepare('UPDATE sessions SET profile_id = ? WHERE token = ?').run(Number(p.lastInsertRowid), token);
  startWatching();
  scanLibrary('first setup');
  res.json({ ok: true });
});

router.post('/login', (req, res) => {
  if (tooManyAttempts(`login:${req.ip}`)) return res.status(429).json({ error: 'Too many tries. Wait a minute and try again.' });
  const { username, password } = req.body || {};
  const acct = db.prepare('SELECT * FROM account WHERE id = 1').get();
  if (!acct || acct.username.toLowerCase() !== String(username || '').trim().toLowerCase() || !checkSecret(password || '', acct.password_hash)) {
    return res.status(401).json({ error: 'That username or password is not right.' });
  }
  createSession(res);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  if (req.session) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.session.token);
  res.clearCookie('homeflix_session');
  res.json({ ok: true });
});

router.get('/profiles', requireLogin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM profiles ORDER BY is_admin DESC, created_at').all().map(publicProfile));
});

router.post('/profiles/:id/select', requireLogin, (req, res) => {
  const p = db.prepare('SELECT * FROM profiles WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Profile not found.' });
  if (p.pin_hash) {
    if (tooManyAttempts(`pin:${req.ip}:${p.id}`)) return res.status(429).json({ error: 'Too many tries. Wait a minute.' });
    if (!checkSecret(String(req.body?.pin || ''), p.pin_hash)) return res.status(401).json({ error: 'Wrong PIN.' });
  }
  db.prepare('UPDATE sessions SET profile_id = ? WHERE token = ?').run(p.id, req.session.token);
  res.json(publicProfile(p));
});

router.post('/profiles/leave', requireLogin, (req, res) => {
  db.prepare('UPDATE sessions SET profile_id = NULL WHERE token = ?').run(req.session.token);
  res.json({ ok: true });
});

function profileFields(body, existing) {
  const out = {};
  if (body.name !== undefined) {
    if (!String(body.name).trim()) throw new Error('A profile needs a name.');
    out.name = String(body.name).trim().slice(0, 30);
  }
  if (body.avatar !== undefined) out.avatar = AVATARS.includes(body.avatar) ? body.avatar : 'red';
  if (body.isKid !== undefined) out.is_kid = body.isKid ? 1 : 0;
  if (body.maxAge !== undefined) out.max_age = Math.max(0, Math.min(18, Number(body.maxAge) || 0));
  if (body.pin !== undefined) {
    if (!validPin(body.pin)) throw new Error('A PIN must be exactly 4 digits.');
    out.pin_hash = body.pin ? hashSecret(String(body.pin)) : null;
  }
  if (existing?.is_admin && out.is_kid) throw new Error('The admin profile cannot be a kids profile.');
  return out;
}

router.post('/profiles', requireProfile, requireAdmin, (req, res) => {
  try {
    const f = profileFields(req.body || {});
    if (!f.name) throw new Error('A profile needs a name.');
    const r = db.prepare('INSERT INTO profiles (name, avatar, pin_hash, is_kid, max_age, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(f.name, f.avatar || 'blue', f.pin_hash || null, f.is_kid || 0, f.max_age ?? 12, now());
    res.json(publicProfile(db.prepare('SELECT * FROM profiles WHERE id = ?').get(Number(r.lastInsertRowid))));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/profiles/:id', requireProfile, (req, res) => {
  const id = Number(req.params.id);
  // Anyone may edit their own profile; only the admin may edit others.
  if (id !== req.profile.id && !req.profile.is_admin) return res.status(403).json({ error: 'You can only change your own profile.' });
  const existing = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Profile not found.' });
  try {
    const body = { ...req.body };
    // Kids can't lift their own restrictions.
    if (!req.profile.is_admin) { delete body.isKid; delete body.maxAge; }
    const f = profileFields(body, existing);
    if (Object.keys(f).length) {
      db.prepare(`UPDATE profiles SET ${Object.keys(f).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(f), id);
    }
    res.json(publicProfile(db.prepare('SELECT * FROM profiles WHERE id = ?').get(id)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/profiles/:id', requireProfile, requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM profiles WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Profile not found.' });
  if (p.is_admin) return res.status(400).json({ error: 'The admin profile cannot be deleted.' });
  db.prepare('DELETE FROM profiles WHERE id = ?').run(p.id);
  res.json({ ok: true });
});

const PREF_KEYS = ['subtitleLang', 'subtitleSize', 'subtitleBackground', 'subtitleColor', 'audioLang'];

router.put('/me/prefs', requireProfile, (req, res) => {
  const prefs = JSON.parse(req.profile.prefs || '{}');
  for (const k of PREF_KEYS) if (k in (req.body || {})) prefs[k] = req.body[k];
  db.prepare('UPDATE profiles SET prefs = ? WHERE id = ?').run(JSON.stringify(prefs), req.profile.id);
  res.json(prefs);
});

router.put('/account/password', requireProfile, requireAdmin, (req, res) => {
  const { current, next } = req.body || {};
  const acct = db.prepare('SELECT * FROM account WHERE id = 1').get();
  if (!checkSecret(current || '', acct.password_hash)) return res.status(401).json({ error: 'Current password is not right.' });
  if (!next || next.length < 4) return res.status(400).json({ error: 'New password needs at least 4 characters.' });
  db.prepare('UPDATE account SET password_hash = ? WHERE id = 1').run(hashSecret(next));
  res.json({ ok: true });
});

export default router;
