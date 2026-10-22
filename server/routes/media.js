// Files: video streaming with Range support, artwork, trailers and subtitles.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import { requireLogin } from '../auth.js';
import { library, canSee } from '../catalog.js';
import { frameThumbnail, placeholderSvg, extractSubtitle, convertSubtitleFile } from '../media.js';
import { readSubtitleText, toVtt } from '../subtitles.js';

const router = express.Router();
// Signed in is enough: Admin settings (no profile) shows artwork and plays video in the Library Fixer.
router.use(requireLogin);

const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
};

/** Stream a file, honouring Range requests so the browser can seek. */
function streamFile(req, res, file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return res.status(404).end();
  }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range && req.headers.range.match(/bytes=(\d*)-(\d*)/);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', type);
  if (!range) {
    res.setHeader('Content-Length', stat.size);
    return fs.createReadStream(file).pipe(res);
  }
  let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
  let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
  if (!range[1]) end = stat.size - 1;
  if (start >= stat.size || start < 0 || end < start) {
    res.setHeader('Content-Range', `bytes */${stat.size}`);
    return res.status(416).end();
  }
  end = Math.min(end, stat.size - 1);
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
  res.setHeader('Content-Length', end - start + 1);
  fs.createReadStream(file, { start, end }).pipe(res);
}

function sendImage(res, file) {
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.sendFile(file, { dotfiles: 'allow' });
}

function sendPlaceholder(res, title, wide) {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.send(placeholderSvg(title, wide));
}

function titleFor(req, res) {
  const t = library().byId.get(Number(req.params.id));
  if (!t || !canSee(req.profile, t)) {
    res.status(404).end();
    return null;
  }
  return t;
}

function videoFor(req, res) {
  const v = db.prepare('SELECT * FROM videos WHERE id = ?').get(Number(req.params.id));
  const t = v && library().byId.get(v.title_id);
  if (!v || !t || !canSee(req.profile, t)) {
    res.status(404).end();
    return {};
  }
  return { v, t };
}

router.get('/video/:id', (req, res) => {
  const { v } = videoFor(req, res);
  if (v) streamFile(req, res, v.path);
});

router.get('/trailer/:id', (req, res) => {
  const t = titleFor(req, res);
  if (!t) return;
  if (!t.trailer_path) return res.status(404).end();
  streamFile(req, res, t.trailer_path);
});

// Poster: poster file > a frame from the video (needs ffmpeg) > a generated placeholder.
router.get('/poster/:id', async (req, res) => {
  const t = titleFor(req, res);
  if (!t) return;
  if (t.poster_path && fs.existsSync(t.poster_path)) return sendImage(res, t.poster_path);
  const v = t.videos[0];
  const frame = v && await frameThumbnail(v.path, v.mtime, Math.round((v.duration || 60) * 0.1), 400);
  if (frame) return sendImage(res, frame);
  sendPlaceholder(res, t.title, false);
});

router.get('/backdrop/:id', async (req, res) => {
  const t = titleFor(req, res);
  if (!t) return;
  if (t.backdrop_path && fs.existsSync(t.backdrop_path)) return sendImage(res, t.backdrop_path);
  const v = t.videos[0];
  const frame = v && await frameThumbnail(v.path, v.mtime, Math.round((v.duration || 60) * 0.2), 1280);
  if (frame) return sendImage(res, frame);
  if (t.poster_path && fs.existsSync(t.poster_path)) return sendImage(res, t.poster_path);
  sendPlaceholder(res, t.title, true);
});

router.get('/thumb/:id', async (req, res) => {
  const { v, t } = videoFor(req, res);
  if (!v) return;
  if (v.thumb_path && fs.existsSync(v.thumb_path)) return sendImage(res, v.thumb_path);
  const frame = await frameThumbnail(v.path, v.mtime, Math.round((v.duration || 60) * 0.25), 480);
  if (frame) return sendImage(res, frame);
  sendPlaceholder(res, v.episode_title || t.title, true);
});

router.get('/sub/:id.vtt', async (req, res) => {
  const s = db.prepare('SELECT s.*, v.title_id, v.mtime, v.sub_offset_ms FROM subtitles s JOIN videos v ON v.id = s.video_id WHERE s.id = ?').get(Number(req.params.id));
  const t = s && library().byId.get(s.title_id);
  if (!s || !t || !canSee(req.profile, t)) return res.status(404).end();
  const offset = req.query.offset !== undefined ? Number(req.query.offset) || 0 : s.sub_offset_ms;
  try {
    let text;
    if (s.stream_index !== null) {
      const file = await extractSubtitle(s.path, s.mtime, s.stream_index);
      if (!file) return res.status(404).end();
      text = fs.readFileSync(file, 'utf8');
    } else if (s.format === 'ass' || s.format === 'ssa') {
      const file = await convertSubtitleFile(s.path, fs.statSync(s.path).mtimeMs);
      if (!file) return res.status(404).end();
      text = fs.readFileSync(file, 'utf8');
    } else {
      text = readSubtitleText(s.path);
    }
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(toVtt(text, offset));
  } catch {
    res.status(404).end();
  }
});

export default router;
