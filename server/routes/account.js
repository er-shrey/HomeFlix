// One Admin login (password only). After signing in, a device shows "Who's watching?";
// profiles are for watching, and the Admin is a role, not a profile.
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db, now, getSetting, setSetting } from '../db.js';
import { ROOT_DIR } from '../config.js';
import {
  accountExists, hashSecret, checkSecret, createSession, publicProfile, isHostRequest,
  requireLogin, requireProfile, tooManyAttempts, AVATARS, adminUnlocked, unlockAdmin, lockAdmin,
} from '../auth.js';
import { scanLibrary, startWatching } from '../scanner.js';

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({
    setupDone: accountExists(),
    loggedIn: !!req.session,
    profile: publicProfile(req.profile),
    adminUnlocked: adminUnlocked(req),
    householdName: getSetting('household_name', 'HomeFlix'),
    // Setup and password reset only work on the computer running HomeFlix.
    onHost: isHostRequest(req),
  });
});

// Folder suggestions for the setup wizard, so nobody has to type a path from memory.
router.get('/setup/suggest', (req, res) => {
  if (accountExists() || !isHostRequest(req)) return res.json([]);
  const home = os.homedir();
  const candidates = [
    path.join(ROOT_DIR, 'mock-library'),
    path.join(home, 'Movies'), path.join(home, 'Videos'), path.join(home, 'Desktop', 'Movies'), path.join(home, 'Media'),
  ];
  res.json(candidates.filter((c) => fs.existsSync(c)));
});

const validPin = (pin) => pin === undefined || pin === null || pin === '' || /^\d{4}$/.test(String(pin));
const validPassword = (p) => typeof p === 'string' && p.length >= 4;

router.post('/setup', (req, res) => {
  if (accountExists()) return res.status(409).json({ error: 'HomeFlix is already set up.' });
  // Otherwise whoever opened the page first on any device could make themselves Admin.
  if (!isHostRequest(req)) return res.status(403).json({ error: 'Finish setting up HomeFlix on the computer it is installed on.' });
  const { password, libraryPath, householdName } = req.body || {};
  if (!validPassword(password)) return res.status(400).json({ error: 'Choose an Admin password of at least 4 characters.' });
  const lib = libraryPath?.trim();
  if (!lib || !fs.existsSync(lib) || !fs.statSync(lib).isDirectory()) return res.status(400).json({ error: 'That library folder does not exist on this computer.' });

  db.prepare("INSERT INTO account (id, username, password_hash) VALUES (1, 'Admin', ?)").run(hashSecret(password));
  setSetting('library_path', path.resolve(lib));
  if (householdName?.trim()) setSetting('household_name', householdName.trim());
  createSession(res);
  startWatching();
  scanLibrary('first setup');
  res.json({ ok: true });
});

router.post('/login', (req, res) => {
  if (tooManyAttempts(`login:${req.ip}`)) return res.status(429).json({ error: 'Too many tries. Wait a minute and try again.' });
  const acct = db.prepare('SELECT * FROM account WHERE id = 1').get();
  if (!acct || !checkSecret(String(req.body?.password || ''), acct.password_hash)) {
    return res.status(401).json({ error: 'That password is not right.' });
  }
  createSession(res);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  if (req.session) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.session.token);
  res.clearCookie('homeflix_session');
  res.json({ ok: true });
});

// Opening Admin settings asks for the password again, even on a signed-in device.
router.post('/admin/unlock', requireLogin, (req, res) => {
  if (tooManyAttempts(`unlock:${req.ip}`)) return res.status(429).json({ error: 'Too many tries. Wait a minute and try again.' });
  const acct = db.prepare('SELECT * FROM account WHERE id = 1').get();
  if (!checkSecret(String(req.body?.password || ''), acct.password_hash)) return res.status(401).json({ error: 'That password is not right.' });
  db.prepare('UPDATE sessions SET profile_id = NULL WHERE token = ?').run(req.session.token);
  unlockAdmin(req.session.token);
  res.json({ ok: true });
});

router.post('/admin/lock', requireLogin, (req, res) => {
  lockAdmin(req.session.token);
  res.json({ ok: true });
});

// Forgotten password: allowed only on the host computer, and signs every other device out.
router.post('/reset-password', (req, res) => {
  if (!accountExists()) return res.status(409).json({ error: 'HomeFlix is not set up yet.' });
  if (!isHostRequest(req)) return res.status(403).json({ error: 'The Admin password can only be reset on the computer HomeFlix runs on.' });
  if (!validPassword(req.body?.password)) return res.status(400).json({ error: 'The new password needs at least 4 characters.' });
  db.prepare('UPDATE account SET password_hash = ? WHERE id = 1').run(hashSecret(req.body.password));
  db.prepare('DELETE FROM sessions').run();
  createSession(res);
  res.json({ ok: true });
});

router.put('/account/password', requireLogin, (req, res) => {
  const { current, next } = req.body || {};
  const acct = db.prepare('SELECT * FROM account WHERE id = 1').get();
  if (!checkSecret(current || '', acct.password_hash)) return res.status(401).json({ error: 'The current password is not right.' });
  if (!validPassword(next)) return res.status(400).json({ error: 'The new password needs at least 4 characters.' });
  db.prepare('UPDATE account SET password_hash = ? WHERE id = 1').run(hashSecret(next));
  // Other devices have to sign in again with the new password.
  db.prepare('DELETE FROM sessions WHERE token != ?').run(req.session.token);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Profiles

router.get('/profiles', requireLogin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM profiles ORDER BY created_at').all().map(publicProfile));
});

router.post('/profiles/:id/select', requireLogin, (req, res) => {
  const p = db.prepare('SELECT * FROM profiles WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Profile not found.' });
  if (p.pin_hash) {
    if (tooManyAttempts(`pin:${req.ip}:${p.id}`)) return res.status(429).json({ error: 'Too many tries. Wait a minute.' });
    if (!checkSecret(String(req.body?.pin || ''), p.pin_hash)) return res.status(401).json({ error: 'Wrong PIN.' });
  }
  // Starting to watch always locks Admin settings again.
  db.prepare('UPDATE sessions SET profile_id = ?, admin_until = NULL WHERE token = ?').run(p.id, req.session.token);
  res.json(publicProfile(p));
});

// Back to "Who's watching?" (also where Admin settings are opened from).
router.post('/profiles/leave', requireLogin, (req, res) => {
  db.prepare('UPDATE sessions SET profile_id = NULL WHERE token = ?').run(req.session.token);
  res.json({ ok: true });
});

function profileFields(body) {
  const out = {};
  if (body.name !== undefined) {
    if (!String(body.name).trim()) throw new Error('A profile needs a name.');
    if (String(body.name).trim().toLowerCase() === 'admin') throw new Error('"Admin" is reserved. Pick another name.');
    out.name = String(body.name).trim().slice(0, 30);
  }
  if (body.avatar !== undefined) out.avatar = AVATARS.includes(body.avatar) ? body.avatar : 'red';
  if (body.isKid !== undefined) out.is_kid = body.isKid ? 1 : 0;
  if (body.maxAge !== undefined) out.max_age = Math.max(0, Math.min(18, Number(body.maxAge) || 0));
  if (body.pin !== undefined) {
    if (!validPin(body.pin)) throw new Error('A PIN must be exactly 4 digits.');
    out.pin_hash = body.pin ? hashSecret(String(body.pin)) : null;
  }
  return out;
}

router.post('/profiles', requireLogin, (req, res) => {
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

router.put('/profiles/:id', requireLogin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Profile not found.' });
  // While watching as a profile, only that profile can be changed, and a kids profile
  // can't lift its own limits. Everything else is done from Admin settings.
  if (req.profile && req.profile.id !== id) return res.status(403).json({ error: 'Change other profiles from Admin settings.' });
  try {
    const body = { ...req.body };
    if (req.profile) { delete body.isKid; delete body.maxAge; }
    const f = profileFields(body);
    if (Object.keys(f).length) {
      db.prepare(`UPDATE profiles SET ${Object.keys(f).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(f), id);
    }
    res.json(publicProfile(db.prepare('SELECT * FROM profiles WHERE id = ?').get(id)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/profiles/:id', requireLogin, (req, res) => {
  if (req.profile) return res.status(403).json({ error: 'Remove profiles from Admin settings.' });
  const p = db.prepare('SELECT * FROM profiles WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Profile not found.' });
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

export default router;
