import express from 'express';
import path from 'node:path';
import { db, parseRow } from '../db.js';
import { requireProfile } from '../auth.js';
import { BROWSER_SAFE_EXTS } from '../config.js';
import { library, canSee, resolveTimings, saveProgress, startedThreshold } from '../catalog.js';

const router = express.Router();
router.use(requireProfile);

function visibleVideo(req, res) {
  const video = db.prepare('SELECT * FROM videos WHERE id = ? AND available = 1').get(Number(req.params.id));
  const title = video && library().byId.get(video.title_id);
  if (!video || !title || !canSee(req.profile, title)) {
    res.status(404).json({ error: 'This video is not available.' });
    return {};
  }
  return { video, title };
}

router.get('/play/:id', (req, res) => {
  const { video, title } = visibleVideo(req, res);
  if (!video) return;
  const p = db.prepare('SELECT * FROM progress WHERE profile_id = ? AND video_id = ?').get(req.profile.id, video.id);
  const fromStart = req.query.start === '0';
  let resumeAt = 0;
  if (!fromStart && p && !p.finished && p.position >= startedThreshold(p.duration || video.duration)) resumeAt = Math.max(0, p.position - 5);

  const { intro, creditsStart } = resolveTimings(video);
  const subtitles = db.prepare("SELECT * FROM subtitles WHERE video_id = ? AND format != 'image' ORDER BY forced, sdh, label").all(video.id)
    .map((s) => ({ id: s.id, lang: s.lang, label: s.label, forced: !!s.forced, sdh: !!s.sdh, src: `/media/sub/${s.id}.vtt` }));

  const idx = title.videos.findIndex((v) => v.id === video.id);
  const next = title.kind === 'series' ? title.videos[idx + 1] : null;
  const isEp = title.kind === 'series';
  res.json({
    video: {
      id: video.id,
      src: `/media/video/${video.id}`,
      duration: video.duration,
      season: video.season_number,
      episode: video.episode_number,
      episodeTitle: video.episode_title,
      heading: isEp ? `S${video.season_number}:E${video.episode_number} · ${video.episode_title || `Episode ${video.episode_number}`}` : null,
      mayNeedConversion: !BROWSER_SAFE_EXTS.has(path.extname(video.path).toLowerCase()),
    },
    title: { id: title.id, title: title.title, kind: title.kind },
    resumeAt,
    intro,
    creditsStart,
    subtitles,
    subOffsetMs: video.sub_offset_ms,
    next: next ? {
      videoId: next.id,
      label: `S${next.season_number}:E${next.episode_number} · ${next.episode_title || `Episode ${next.episode_number}`}`,
      thumb: `/media/thumb/${next.id}`,
      description: next.description,
    } : null,
    prefs: parseRow(req.profile).prefs,
  });
});

router.post('/progress', (req, res) => {
  // sendBeacon posts as text/plain, so accept a raw JSON string too.
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const videoId = Number(body.videoId);
  const position = Number(body.position);
  if (!videoId || !(position >= 0)) return res.status(400).json({ error: 'Bad progress report.' });
  const video = db.prepare('SELECT title_id FROM videos WHERE id = ?').get(videoId);
  const title = video && library().byId.get(video.title_id);
  if (!title || !canSee(req.profile, title)) return res.status(404).json({ error: 'Not found.' });
  const out = saveProgress(req.profile.id, videoId, position, Number(body.duration) || null);
  res.json(out);
});

router.put('/videos/:id/sub-offset', (req, res) => {
  const { video } = visibleVideo(req, res);
  if (!video) return;
  const ms = Math.max(-60000, Math.min(60000, Math.round(Number(req.body?.ms) || 0)));
  db.prepare('UPDATE videos SET sub_offset_ms = ? WHERE id = ?').run(ms, video.id);
  res.json({ ms });
});

export default router;
