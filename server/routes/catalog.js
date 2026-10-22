import express from 'express';
import { db, now } from '../db.js';
import { requireProfile } from '../auth.js';
import {
  library, canSee, card, playTarget, progressMap, startedThreshold, householdRatings, invalidateSnapshot,
} from '../catalog.js';
import { homeRows, relatedTitles } from '../recommend.js';
import { search, facets, logSearch, recentSearches } from '../search.js';
import { scanState } from '../scanner.js';

const router = express.Router();
router.use(requireProfile);

function visibleTitle(req, res) {
  const t = library().byId.get(Number(req.params.id));
  if (!t || !t.videos.length || !canSee(req.profile, t)) {
    res.status(404).json({ error: 'This title is not available.' });
    return null;
  }
  return t;
}

router.get('/home', (req, res) => {
  res.json({ ...homeRows(req.profile), scanning: scanState.running, found: scanState.counts, scanError: scanState.error });
});

router.get('/titles/:id', (req, res) => {
  const t = visibleTitle(req, res);
  if (!t) return;
  const pid = req.profile.id;
  const progress = progressMap(pid);
  const target = playTarget(t, progress);
  const mine = db.prepare('SELECT stars FROM ratings WHERE profile_id = ? AND title_id = ?').get(pid, t.id);
  const dismissed = db.prepare("SELECT COUNT(*) n FROM rating_prompts WHERE profile_id = ? AND title_id = ? AND response = 'dismissed'").get(pid, t.id).n;
  const avg = householdRatings().get(t.id);
  const inList = !!db.prepare('SELECT 1 FROM my_list WHERE profile_id = ? AND title_id = ?').get(pid, t.id);

  const epLabel = (v) => `S${v.season_number}:E${v.episode_number}`;
  let playLabel = 'Play';
  if (target.mode === 'resume') playLabel = t.kind === 'series' ? `Resume ${epLabel(target.video)}` : 'Resume';
  else if (target.mode === 'next') playLabel = `Play ${epLabel(target.video)}`;
  else if (target.mode === 'again') playLabel = t.kind === 'series' ? 'Watch again from S1:E1' : 'Play again';

  let seasons = null;
  if (t.kind === 'series') {
    const seasonRows = db.prepare('SELECT * FROM seasons WHERE title_id = ? ORDER BY number').all(t.id);
    seasons = seasonRows.map((s) => ({
      number: s.number,
      name: s.number === 0 ? 'Specials' : `Season ${s.number}`,
      description: s.description,
      episodes: t.videos.filter((v) => v.season_number === s.number).map((v) => {
        const p = progress.get(v.id);
        const dur = p?.duration || v.duration;
        return {
          id: v.id,
          number: v.episode_number,
          title: v.episode_title || `Episode ${v.episode_number}`,
          description: v.description,
          duration: v.duration,
          thumb: `/media/thumb/${v.id}`,
          finished: !!p?.finished,
          progress: p && !p.finished && p.position >= startedThreshold(dur) ? p.position / (dur || 1) : 0,
        };
      }),
    })).filter((s) => s.episodes.length);
  }

  let collection = null;
  if (t.collection) {
    const finished = new Set(db.prepare('SELECT video_id FROM progress WHERE profile_id = ? AND finished = 1').all(pid).map((r) => r.video_id));
    const items = library().titles.filter((x) => x.collection === t.collection && canSee(req.profile, x))
      .sort((a, b) => (a.collection_order ?? 999) - (b.collection_order ?? 999) || (a.year || 0) - (b.year || 0));
    const nextUp = items.find((x) => !x.videos.every((v) => finished.has(v.id)));
    collection = {
      name: t.collection,
      items: items.map((x) => card(x, { order: x.collection_order, current: x.id === t.id, nextUp: x.id === nextUp?.id, watched: x.videos.every((v) => finished.has(v.id)) })),
    };
  }

  res.json({
    ...card(t),
    description: t.description,
    cast: t.cast_members,
    directors: t.directors,
    tags: t.tags,
    aka: t.aka,
    audio: t.audio,
    ccLanguages: t.ccLanguages,
    hasTrailer: !!t.trailer_path,
    play: {
      videoId: target.video.id,
      mode: target.mode,
      label: playLabel,
      progress: target.progress,
      canStartOver: target.mode === 'resume',
    },
    currentSeason: target.video.season_number,
    seasons,
    collection,
    myRating: mine?.stars || null,
    showRateRow: !mine && dismissed > 0,
    household: avg ? { avg: Math.round((avg.sum / avg.n) * 10) / 10, count: avg.n } : null,
    inList,
  });
});

router.get('/titles/:id/related', (req, res) => {
  const t = visibleTitle(req, res);
  if (!t) return;
  res.json(relatedTitles(req.profile, t.id));
});

// ---------------------------------------------------------------------------
// Ratings

router.put('/titles/:id/rating', (req, res) => {
  const t = visibleTitle(req, res);
  if (!t) return;
  const stars = Number(req.body?.stars);
  if (!(stars >= 1 && stars <= 5 && Number.isInteger(stars))) return res.status(400).json({ error: 'Stars must be 1 to 5.' });
  db.prepare(`INSERT INTO ratings (profile_id, title_id, stars, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(profile_id, title_id) DO UPDATE SET stars = excluded.stars, updated_at = excluded.updated_at`)
    .run(req.profile.id, t.id, stars, now());
  if (req.body?.trigger) {
    db.prepare(`INSERT OR REPLACE INTO rating_prompts (profile_id, title_id, trigger_key, response, at) VALUES (?, ?, ?, 'rated', ?)`)
      .run(req.profile.id, t.id, String(req.body.trigger), now());
  }
  res.json({ stars });
});

router.delete('/titles/:id/rating', (req, res) => {
  db.prepare('DELETE FROM ratings WHERE profile_id = ? AND title_id = ?').run(req.profile.id, Number(req.params.id));
  res.json({ ok: true });
});

/**
 * Should the player ask for a rating now? Movies: once, when finished. Series: after the 3rd
 * finished episode and at the end of each season. "Not now" twice for a title means never again.
 */
router.get('/titles/:id/rating-prompt', (req, res) => {
  const t = visibleTitle(req, res);
  if (!t) return;
  const pid = req.profile.id;
  const prompts = db.prepare('SELECT * FROM rating_prompts WHERE profile_id = ? AND title_id = ?').all(pid, t.id);
  const asked = new Set(prompts.map((p) => p.trigger_key));
  const dismissals = prompts.filter((p) => p.response === 'dismissed').length;
  const rating = db.prepare('SELECT stars FROM ratings WHERE profile_id = ? AND title_id = ?').get(pid, t.id);
  const none = () => res.json({ ask: false });
  if (dismissals >= 2) return none();

  if (t.kind === 'movie') {
    if (rating || asked.has('finish')) return none();
    return res.json({ ask: true, trigger: 'finish', question: `How was ${t.title}?`, current: null });
  }
  const video = t.videos.find((v) => v.id === Number(req.query.videoId));
  if (!video) return none();
  const lastInSeason = Math.max(...t.videos.filter((v) => v.season_number === video.season_number).map((v) => v.episode_number));
  if (video.episode_number === lastInSeason) {
    const key = `season:${video.season_number}`;
    if (asked.has(key)) return none();
    return res.json({ ask: true, trigger: key, question: `You finished Season ${video.season_number}. How is ${t.title}?`, current: rating?.stars || null });
  }
  const finishedCount = db.prepare(`SELECT COUNT(*) n FROM progress p JOIN videos v ON v.id = p.video_id
    WHERE p.profile_id = ? AND v.title_id = ? AND p.finished = 1`).get(pid, t.id).n;
  if (finishedCount >= 3 && !rating && !asked.has('ep3')) {
    return res.json({ ask: true, trigger: 'ep3', question: `Enjoying ${t.title} so far?`, current: null });
  }
  none();
});

router.post('/titles/:id/rating-prompt/dismiss', (req, res) => {
  db.prepare(`INSERT OR IGNORE INTO rating_prompts (profile_id, title_id, trigger_key, response, at) VALUES (?, ?, ?, 'dismissed', ?)`)
    .run(req.profile.id, Number(req.params.id), String(req.body?.trigger || 'finish'), now());
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// My List, watched state, history

router.get('/mylist', (req, res) => {
  const rows = db.prepare('SELECT title_id FROM my_list WHERE profile_id = ? ORDER BY added_at DESC').all(req.profile.id);
  res.json(rows.map((r) => library().byId.get(r.title_id)).filter((t) => t && canSee(req.profile, t)).map((t) => card(t)));
});

router.post('/mylist/:id', (req, res) => {
  db.prepare('INSERT OR IGNORE INTO my_list (profile_id, title_id, added_at) VALUES (?, ?, ?)').run(req.profile.id, Number(req.params.id), now());
  res.json({ inList: true });
});

router.delete('/mylist/:id', (req, res) => {
  db.prepare('DELETE FROM my_list WHERE profile_id = ? AND title_id = ?').run(req.profile.id, Number(req.params.id));
  res.json({ inList: false });
});

function setWatched(profileId, videos, watched) {
  const t = now();
  for (const v of videos) {
    if (watched) {
      const dur = v.duration || 1;
      db.prepare(`INSERT INTO progress (profile_id, video_id, position, duration, finished, updated_at) VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(profile_id, video_id) DO UPDATE SET position = excluded.position, finished = 1, updated_at = excluded.updated_at`)
        .run(profileId, v.id, dur, v.duration, t);
    } else {
      db.prepare('DELETE FROM progress WHERE profile_id = ? AND video_id = ?').run(profileId, v.id);
    }
  }
}

// body: { watched: bool, videoId?: number, season?: number }
router.post('/titles/:id/watched', (req, res) => {
  const t = visibleTitle(req, res);
  if (!t) return;
  const { watched, videoId, season } = req.body || {};
  let videos = t.videos;
  if (videoId) videos = videos.filter((v) => v.id === Number(videoId));
  else if (season !== undefined && season !== null) videos = videos.filter((v) => v.season_number === Number(season));
  setWatched(req.profile.id, videos, !!watched);
  res.json({ ok: true });
});

router.post('/continue/:id/hide', (req, res) => {
  db.prepare('INSERT OR REPLACE INTO continue_hidden (profile_id, title_id, at) VALUES (?, ?, ?)').run(req.profile.id, Number(req.params.id), now());
  res.json({ ok: true });
});

router.get('/history', (req, res) => {
  const rows = db.prepare(`SELECT v.title_id, MAX(p.updated_at) at, SUM(p.finished) done, COUNT(*) n FROM progress p
    JOIN videos v ON v.id = p.video_id WHERE p.profile_id = ? GROUP BY v.title_id ORDER BY at DESC`).all(req.profile.id);
  const ratings = new Map(db.prepare('SELECT title_id, stars FROM ratings WHERE profile_id = ?').all(req.profile.id).map((r) => [r.title_id, r.stars]));
  res.json(rows.map((r) => {
    const t = library().byId.get(r.title_id);
    if (!t) return null;
    return card(t, { watchedAt: r.at, myRating: ratings.get(t.id) || null, label: t.kind === 'series' ? `${r.n} episode${r.n === 1 ? '' : 's'} watched` : r.done ? 'Finished' : 'Started' });
  }).filter(Boolean));
});

// Removing from history also removes the rating, so it stops shaping recommendations.
router.delete('/history/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM progress WHERE profile_id = ? AND video_id IN (SELECT id FROM videos WHERE title_id = ?)').run(req.profile.id, id);
  db.prepare('DELETE FROM ratings WHERE profile_id = ? AND title_id = ?').run(req.profile.id, id);
  db.prepare('DELETE FROM rating_prompts WHERE profile_id = ? AND title_id = ?').run(req.profile.id, id);
  invalidateSnapshot();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Search

router.get('/search', (req, res) => {
  const f = req.query;
  const truthy = (v) => v === '1' || v === 'true';
  res.json(search(req.profile, String(f.q || ''), {
    type: f.type || null,
    genre: f.genre || null,
    language: f.language || null,
    audio: f.audio || null,
    decade: f.decade || null,
    cc: truthy(f.cc),
    unwatched: truthy(f.unwatched),
    mylist: truthy(f.mylist),
  }));
});

router.get('/search/facets', (req, res) => res.json(facets(req.profile)));
router.get('/search/recent', (req, res) => res.json(recentSearches(req.profile.id)));
router.post('/search/recent', (req, res) => {
  logSearch(req.profile.id, String(req.body?.q || ''));
  res.json({ ok: true });
});
router.delete('/search/recent', (req, res) => {
  db.prepare('DELETE FROM search_history WHERE profile_id = ?').run(req.profile.id);
  res.json({ ok: true });
});

export default router;
