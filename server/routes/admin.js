import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import QRCode from 'qrcode';
import { db, getSetting, setSetting, parseRow } from '../db.js';
import { requireAdmin } from '../auth.js';
import { BROWSER_SAFE_EXTS, PORT } from '../config.js';
import { scanLibrary, scanAndWait, scanState, startWatching } from '../scanner.js';
import { formatInfoText, writeFileAtomic, INFO_TEMPLATE } from '../infofile.js';
import { FFMPEG, FFPROBE, frameThumbnail } from '../media.js';
import { lookupLanguage } from '../subtitles.js';
import { artVersion } from '../catalog.js';

const router = express.Router();
router.use(requireAdmin);

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

const MISSING_LABELS = {
  info: 'info file', poster: 'poster', description: 'description', genres: 'genres', ageRating: 'age rating', backdrop: 'banner image',
};

function subtitleRows() {
  return db.prepare(`SELECT s.label, s.format, s.forced, v.title_id FROM subtitles s JOIN videos v ON v.id = s.video_id WHERE v.available = 1`).all();
}

/** What a title is missing (required), what would be nice to have (optional), and any CC mismatch. */
function titleIssues(t, subs) {
  const missing = [];
  if (!t.info_path) missing.push('info');
  if (!t.poster_path) missing.push('poster');
  if (!t.description) missing.push('description');
  if (!t.genres.length) missing.push('genres');
  if (!t.age_rating) missing.push('ageRating');
  const optional = t.backdrop_path ? [] : ['backdrop'];
  let mismatch = null;
  if (t.declared_subtitles.length) {
    const actual = new Set(subs.filter((s) => s.title_id === t.id && s.format !== 'image' && !s.forced).map((s) => langOf(s.label).toLowerCase()));
    const missingLangs = t.declared_subtitles.filter((d) => !actual.has((lookupLanguage(d)?.name || d).toLowerCase()));
    if (missingLangs.length) mismatch = `info file says ${missingLangs.join(', ')} CC, but no ${missingLangs.join('/')} subtitle file was found`;
  }
  return { missing, optional, mismatch };
}

function libraryHealth() {
  const titles = db.prepare('SELECT * FROM titles').all().map(parseRow);
  const subs = subtitleRows();
  const videos = db.prepare('SELECT id, title_id, path, season_number, episode_number FROM videos WHERE available = 1').all();

  const needsInfo = [];
  const mismatches = [];
  for (const t of titles.filter((x) => x.available)) {
    const { missing, mismatch } = titleIssues(t, subs);
    if (missing.length) needsInfo.push({ id: t.id, title: t.title, kind: t.kind, missing: missing.map((m) => (m === 'info' ? 'no info file' : MISSING_LABELS[m])) });
    if (mismatch) mismatches.push({ id: t.id, title: t.title, message: mismatch });
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
  return isLooseFile(t)
    ? path.join(path.dirname(t.folder_path), `${path.basename(t.folder_path, path.extname(t.folder_path))}.txt`)
    : path.join(t.folder_path, 'info.txt');
}

const isLooseFile = (t) => fs.existsSync(t.folder_path) && fs.statSync(t.folder_path).isFile();

/** Folder (or loose file) shown relative to the library, e.g. "Movies/Inception (2010)". */
function relFolder(t) {
  const root = getSetting('library_path') || '';
  return path.relative(root, t.folder_path) || t.folder_path;
}

// Library Fixer: every available title with something missing, most-missing first.
router.get('/fix', (_req, res) => {
  const subs = subtitleRows();
  const titles = db.prepare('SELECT * FROM titles WHERE available = 1 ORDER BY title COLLATE NOCASE').all().map(parseRow);
  const items = titles.map((t) => ({ t, ...titleIssues(t, subs) }))
    .filter((x) => x.missing.length || x.mismatch)
    .sort((a, b) => b.missing.length - a.missing.length)
    .map(({ t, missing, optional, mismatch }) => ({
      id: t.id, title: t.title, kind: t.kind, folder: relFolder(t), missing, optional, mismatch,
      poster: `/media/poster/${t.id}?v=${artVersion(t.poster_path)}`,
    }));
  res.json({ items, totalTitles: titles.length, labels: MISSING_LABELS, canSuggestFrames: !!FFMPEG });
});

router.get('/titles/:id', (req, res) => {
  const t = parseRow(db.prepare('SELECT * FROM titles WHERE id = ?').get(Number(req.params.id)));
  if (!t) return res.status(404).json({ error: 'Not found.' });
  const video = t.kind === 'movie' ? db.prepare('SELECT intro, credits FROM videos WHERE title_id = ? LIMIT 1').get(t.id) : null;
  const videos = db.prepare('SELECT * FROM videos WHERE title_id = ? AND available = 1 ORDER BY season_number, episode_number').all(t.id)
    .map((v) => ({
      id: v.id,
      duration: v.duration,
      label: v.season_number !== null ? `S${v.season_number}:E${v.episode_number} · ${v.episode_title || `Episode ${v.episode_number}`}` : path.basename(v.path),
    }));
  res.json({
    id: t.id,
    kind: t.kind,
    folder: t.folder_path,
    relFolder: relFolder(t),
    infoPath: t.info_path,
    writeTarget: infoTarget(t),
    ...titleIssues(t, subtitleRows()),
    poster: t.poster_path ? path.basename(t.poster_path) : null,
    backdrop: t.backdrop_path ? path.basename(t.backdrop_path) : null,
    posterUrl: `/media/poster/${t.id}?v=${artVersion(t.poster_path)}`,
    backdropUrl: `/media/backdrop/${t.id}?v=${artVersion(t.backdrop_path)}`,
    videos,
    canSuggestFrames: !!FFMPEG,
    fields: {
      title: t.title, year: t.year, genres: t.genres, cast: t.cast_members, directors: t.directors,
      ageRating: t.age_rating, tags: t.tags, language: t.language, audio: t.audio, aka: t.aka,
      collection: t.collection, order: t.collection_order, description: t.description,
      intro: video?.intro || '', credits: video?.credits || '',
    },
  });
});

/** Save edits by writing the info file, so the folder stays the source of truth. */
router.put('/titles/:id', async (req, res) => {
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
  const created = !fs.existsSync(target);
  try {
    writeFileAtomic(target, formatInfoText(fields, t.extra_lines));
  } catch (err) {
    return res.status(500).json({ error: `Could not write ${target}: ${err.message}` });
  }
  // Wait for the rescan so the page reloads with the new details already in place.
  await scanAndWait('title edited');
  res.json({ ok: true, infoPath: target, created });
});

// A still from the video, for the frame picker's suggestions (needs ffmpeg).
router.get('/videos/:id/frame', async (req, res) => {
  const v = db.prepare('SELECT path, mtime FROM videos WHERE id = ?').get(Number(req.params.id));
  if (!v) return res.status(404).end();
  const t = Math.max(0, Math.round((Number(req.query.t) || 0) * 10) / 10);
  const file = await frameThumbnail(v.path, v.mtime, t, 320);
  if (!file) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(file);
});

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

function looksLikeImage(buf, type) {
  if (!Buffer.isBuffer(buf) || buf.length < 100) return false;
  if (type === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8;
  if (type === 'image/png') return buf.subarray(1, 4).toString() === 'PNG';
  if (type === 'image/webp') return buf.subarray(8, 12).toString() === 'WEBP';
  return false;
}

/**
 * Save a poster or banner image (a captured video frame or an uploaded picture) into the title's folder.
 * An existing image is renamed out of the way, never deleted.
 */
router.put('/titles/:id/artwork/:kind', express.raw({ type: 'image/*', limit: '25mb' }), async (req, res) => {
  const kind = req.params.kind;
  if (kind !== 'poster' && kind !== 'backdrop') return res.status(400).json({ error: 'Unknown image type.' });
  const t = db.prepare('SELECT * FROM titles WHERE id = ?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Not found.' });
  const type = String(req.headers['content-type'] || '').split(';')[0].trim();
  const ext = IMAGE_TYPES[type];
  if (!ext || !looksLikeImage(req.body, type)) return res.status(400).json({ error: 'Please use a JPG, PNG or WebP image.' });

  // Folders get poster.jpg / backdrop.jpg; a loose movie file gets "<file name>-poster.jpg" next to it.
  const loose = isLooseFile(t);
  const dir = loose ? path.dirname(t.folder_path) : t.folder_path;
  const base = loose ? `${path.basename(t.folder_path, path.extname(t.folder_path))}-${kind}` : kind;
  const target = path.join(dir, base + ext);

  const old = kind === 'poster' ? t.poster_path : t.backdrop_path;
  let movedOld = null;
  try {
    // Also when the new image has the same name: set the old one aside instead of overwriting it.
    if (old && fs.existsSync(old)) {
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      movedOld = path.join(path.dirname(old), `${path.basename(old, path.extname(old))}.replaced-${stamp}${path.extname(old)}`);
      fs.renameSync(old, movedOld);
    }
    writeFileAtomic(target, req.body);
  } catch (err) {
    return res.status(500).json({ error: `Could not save the image: ${err.message}` });
  }
  await scanAndWait(`${kind} saved`);
  res.json({ ok: true, file: path.basename(target), movedOld: movedOld && path.basename(movedOld) });
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
