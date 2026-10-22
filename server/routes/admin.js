import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import QRCode from 'qrcode';
import { db, getSetting, setSetting, parseRow } from '../db.js';
import { requireProfile, requireAdmin } from '../auth.js';
import { BROWSER_SAFE_EXTS, PORT } from '../config.js';
import { scanLibrary, scanState, startWatching } from '../scanner.js';
import { formatInfoText, writeFileAtomic, INFO_TEMPLATE } from '../infofile.js';
import { FFMPEG, FFPROBE } from '../media.js';
import { lookupLanguage } from '../subtitles.js';

const router = express.Router();
router.use(requireProfile, requireAdmin);

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
    }
  }
  return out;
}

const langOf = (label) => label.replace(/\s*\((CC|Forced)\)/g, '').trim();

function libraryHealth() {
  const titles = db.prepare('SELECT * FROM titles').all().map(parseRow);
  const subs = db.prepare(`SELECT s.label, s.format, s.forced, v.title_id FROM subtitles s JOIN videos v ON v.id = s.video_id WHERE v.available = 1`).all();
  const videos = db.prepare('SELECT id, title_id, path, season_number, episode_number FROM videos WHERE available = 1').all();

  const needsInfo = [];
  const mismatches = [];
  for (const t of titles.filter((x) => x.available)) {
    const missing = [];
    if (!t.info_path) missing.push('no info file');
    if (!t.description) missing.push('description');
    if (!t.genres.length) missing.push('genres');
    if (!t.poster_path) missing.push('poster');
    if (!t.age_rating) missing.push('age rating');
    if (missing.length) needsInfo.push({ id: t.id, title: t.title, kind: t.kind, missing });

    if (t.declared_subtitles.length) {
      const actual = new Set(subs.filter((s) => s.title_id === t.id && s.format !== 'image' && !s.forced).map((s) => langOf(s.label).toLowerCase()));
      const missingLangs = t.declared_subtitles.filter((d) => {
        const name = (lookupLanguage(d)?.name || d).toLowerCase();
        return !actual.has(name);
      });
      if (missingLangs.length) {
        mismatches.push({ id: t.id, title: t.title, message: `info file says ${missingLangs.join(', ')} CC, but no ${missingLangs.join('/')} subtitle file was found` });
      }
    }
  }

  const titleName = new Map(titles.map((t) => [t.id, t.title]));
  const needsConversion = videos.filter((v) => !BROWSER_SAFE_EXTS.has(path.extname(v.path).toLowerCase())).map((v) => ({
    titleId: v.title_id,
    title: titleName.get(v.title_id) + (v.season_number !== null ? ` S${v.season_number}:E${v.episode_number}` : ''),
    file: path.basename(v.path),
  }));
  const imageSubs = subs.filter((s) => s.format === 'image').map((s) => ({ titleId: s.title_id, title: titleName.get(s.title_id), label: s.label }));
  const missingTitles = titles.filter((t) => !t.available).map((t) => ({ id: t.id, title: t.title, kind: t.kind, missingSince: t.missing_since, folder: t.folder_path }));
  return { needsInfo, mismatches, needsConversion, imageSubs, missingTitles };
}

router.get('/overview', async (_req, res) => {
  const counts = db.prepare(`SELECT
      (SELECT COUNT(*) FROM titles WHERE available = 1 AND kind = 'movie') movies,
      (SELECT COUNT(*) FROM titles WHERE available = 1 AND kind = 'series') series,
      (SELECT COUNT(*) FROM videos v JOIN titles t ON t.id = v.title_id WHERE v.available = 1 AND t.kind = 'series') episodes,
      (SELECT COUNT(*) FROM profiles) profiles`).get();
  const addresses = lanAddresses();
  const qr = addresses[0] ? await QRCode.toString(addresses[0], { type: 'svg', margin: 1, color: { dark: '#000', light: '#fff' } }) : null;
  res.json({
    libraryPath: getSetting('library_path'),
    counts,
    scan: scanState,
    addresses,
    qr,
    tools: { ffmpeg: !!FFMPEG, ffprobe: !!FFPROBE },
    health: libraryHealth(),
  });
});

router.post('/scan', (_req, res) => {
  scanLibrary('Scan now button');
  res.json({ ok: true });
});

router.put('/library', (req, res) => {
  const p = String(req.body?.path || '').trim();
  if (!p || !fs.existsSync(p) || !fs.statSync(p).isDirectory()) return res.status(400).json({ error: 'That folder does not exist on this computer.' });
  setSetting('library_path', path.resolve(p));
  startWatching();
  scanLibrary('library folder changed');
  res.json({ ok: true });
});

// Where edits are saved: the existing .txt, "<file name>.txt" next to a loose movie file, or info.txt in the folder.
function infoTarget(t) {
  if (t.info_path && t.info_path.endsWith('.txt')) return t.info_path;
  const isLooseFile = fs.existsSync(t.folder_path) && fs.statSync(t.folder_path).isFile();
  return isLooseFile
    ? path.join(path.dirname(t.folder_path), `${path.basename(t.folder_path, path.extname(t.folder_path))}.txt`)
    : path.join(t.folder_path, 'info.txt');
}

router.get('/titles/:id', (req, res) => {
  const t = parseRow(db.prepare('SELECT * FROM titles WHERE id = ?').get(Number(req.params.id)));
  if (!t) return res.status(404).json({ error: 'Not found.' });
  const video = t.kind === 'movie' ? db.prepare('SELECT intro, credits FROM videos WHERE title_id = ? LIMIT 1').get(t.id) : null;
  res.json({
    id: t.id,
    kind: t.kind,
    folder: t.folder_path,
    infoPath: t.info_path,
    writeTarget: infoTarget(t),
    fields: {
      title: t.title, year: t.year, genres: t.genres, cast: t.cast_members, directors: t.directors,
      ageRating: t.age_rating, tags: t.tags, language: t.language, audio: t.audio, aka: t.aka,
      collection: t.collection, order: t.collection_order, description: t.description,
      intro: video?.intro || '', credits: video?.credits || '',
    },
  });
});

/** Save edits by writing the info file, so the folder stays the source of truth. */
router.put('/titles/:id', (req, res) => {
  const t = parseRow(db.prepare('SELECT * FROM titles WHERE id = ?').get(Number(req.params.id)));
  if (!t) return res.status(404).json({ error: 'Not found.' });
  const f = req.body?.fields || {};
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((s) => String(s).trim()).filter(Boolean);
  const detected = db.prepare(`SELECT DISTINCT s.label FROM subtitles s JOIN videos v ON v.id = s.video_id
    WHERE v.title_id = ? AND v.available = 1 AND s.forced = 0 AND s.format != 'image'`).all(t.id).map((r) => langOf(r.label));
  const fields = {
    title: String(f.title || '').trim() || t.title,
    year: Number(f.year) || null,
    genres: list(f.genres),
    cast: list(f.cast),
    directors: list(f.directors),
    ageRating: String(f.ageRating || '').trim(),
    tags: list(f.tags),
    language: String(f.language || '').trim(),
    audio: list(f.audio),
    // Always written from what's really on disk, so the file never promises CC that isn't there.
    subtitles: [...new Set(detected)].filter((l) => l !== 'Subtitles'),
    aka: list(f.aka),
    collection: String(f.collection || '').trim(),
    order: f.order === '' || f.order === null || f.order === undefined ? null : Number(f.order),
    intro: t.kind === 'movie' ? String(f.intro || '').trim() : '',
    credits: t.kind === 'movie' ? String(f.credits || '').trim() : '',
    description: String(f.description || '').trim(),
  };
  const target = infoTarget(t);
  try {
    writeFileAtomic(target, formatInfoText(fields, t.extra_lines));
  } catch (err) {
    return res.status(500).json({ error: `Could not write ${target}: ${err.message}` });
  }
  scanLibrary('title edited');
  res.json({ ok: true, infoPath: target });
});

router.delete('/titles/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM titles WHERE id = ?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Not found.' });
  if (t.available) return res.status(400).json({ error: 'Only titles whose files are missing can be removed here. Delete the folder instead.' });
  db.prepare('DELETE FROM titles WHERE id = ?').run(t.id);
  res.json({ ok: true });
});

router.get('/info-template', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="info.txt"');
  res.send(INFO_TEMPLATE);
});

export default router;
