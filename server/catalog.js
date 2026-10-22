// Shared catalog logic: what a profile may see, how titles become cards,
// watch progress, Continue Watching and "up next".
import { db, now, parseRow } from './db.js';
import { ageFromRating, parseRange, parseCredits } from './infofile.js';

// ---------------------------------------------------------------------------
// Library snapshot (rebuilt after every scan; small enough to keep in memory)

let snapshot = null;

export function invalidateSnapshot() {
  snapshot = null;
}

export function library() {
  if (snapshot) return snapshot;
  const titles = db.prepare('SELECT * FROM titles WHERE available = 1').all().map(parseRow);
  const videos = db.prepare('SELECT * FROM videos WHERE available = 1 ORDER BY title_id, season_number, episode_number').all();
  const subs = db.prepare("SELECT video_id, lang, label FROM subtitles WHERE format != 'image'").all();
  const subsByVideo = new Map();
  for (const s of subs) {
    if (!subsByVideo.has(s.video_id)) subsByVideo.set(s.video_id, []);
    subsByVideo.get(s.video_id).push(s);
  }
  const byId = new Map(titles.map((t) => [t.id, { ...t, videos: [], ccLanguages: new Set(), age: ageFromRating(t.age_rating) }]));
  for (const v of videos) {
    const t = byId.get(v.title_id);
    if (!t) continue;
    t.videos.push(v);
    for (const s of subsByVideo.get(v.id) || []) t.ccLanguages.add(s.label.replace(/\s*\((CC|Forced)\)/g, ''));
  }
  for (const t of byId.values()) {
    t.ccLanguages = [...t.ccLanguages];
    t.hasCC = t.ccLanguages.length > 0;
    t.episodeTitles = t.kind === 'series' ? t.videos.map((v) => v.episode_title).filter(Boolean) : [];
  }
  snapshot = { titles: [...byId.values()].filter((t) => t.videos.length), byId };
  return snapshot;
}

/** Kids profiles only see titles with a known age rating at or under their limit. */
export function canSee(profile, title) {
  if (!profile?.is_kid) return true;
  return title.age !== null && title.age <= profile.max_age;
}

export function visibleTitles(profile) {
  return library().titles.filter((t) => canSee(profile, t));
}

// ---------------------------------------------------------------------------
// Timing rules

export const startedThreshold = (duration) => Math.min(120, (duration || 0) * 0.05);

/**
 * Where intro/credits are for a video: episode .txt (or a movie's info.txt, both stored on the
 * video row by the scanner) wins over season.txt. Without credits info, the last 3% counts.
 */
export function resolveTimings(video) {
  const season = video.season_number !== null
    ? db.prepare('SELECT intro, credits FROM seasons WHERE title_id = ? AND number = ?').get(video.title_id, video.season_number)
    : null;
  const introText = video.intro || season?.intro || null;
  const creditsText = video.credits || season?.credits || null;
  const intro = parseRange(introText);
  const duration = video.duration || null;
  let creditsStart = null;
  const c = parseCredits(creditsText);
  if (duration) {
    if (c?.fromEnd) creditsStart = Math.max(0, duration - c.fromEnd);
    else if (c?.at && c.at < duration) creditsStart = c.at;
    else creditsStart = duration * 0.97;
  }
  return { intro, creditsStart };
}

export function isFinished(position, duration, creditsStart) {
  if (!duration) return false;
  return position >= duration * 0.9 || (creditsStart !== null && position >= creditsStart);
}

export function saveProgress(profileId, videoId, position, reportedDuration) {
  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);
  if (!video) return null;
  if (reportedDuration && (!video.duration || Math.abs(video.duration - reportedDuration) > 1)) {
    // No ffprobe, or a wrong guess: the browser knows the real length.
    db.prepare('UPDATE videos SET duration = ? WHERE id = ?').run(reportedDuration, videoId);
    video.duration = reportedDuration;
    invalidateSnapshot();
  }
  const { creditsStart } = resolveTimings(video);
  const finished = isFinished(position, video.duration, creditsStart) ? 1 : 0;
  db.prepare(`INSERT INTO progress (profile_id, video_id, position, duration, finished, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_id, video_id) DO UPDATE SET position = excluded.position, duration = excluded.duration,
      finished = CASE WHEN excluded.finished = 1 THEN 1 WHEN excluded.position < ? THEN 0 ELSE progress.finished END,
      updated_at = excluded.updated_at`)
    .run(profileId, videoId, position, video.duration, finished, now(), startedThreshold(video.duration) + 1);
  // Watching again brings a title back into Continue Watching.
  db.prepare('DELETE FROM continue_hidden WHERE profile_id = ? AND title_id = ?').run(profileId, video.title_id);
  return { finished: !!finished, creditsStart };
}

export function progressMap(profileId) {
  const rows = db.prepare('SELECT * FROM progress WHERE profile_id = ?').all(profileId);
  return new Map(rows.map((r) => [r.video_id, r]));
}

const isStarted = (p) => p && (p.finished || p.position >= startedThreshold(p.duration));

const fmtLeft = (secs) => {
  const m = Math.max(1, Math.round(secs / 60));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m} min left`;
};

const epLabel = (v) => `S${v.season_number}:E${v.episode_number}`;

/**
 * What pressing Play on a title should do for this profile:
 * resume the current episode/movie, move on to the next episode, or start from the beginning.
 */
export function playTarget(title, progress) {
  const videos = title.videos;
  if (!videos.length) return null;
  if (title.kind === 'movie') {
    const v = videos[0];
    const p = progress.get(v.id);
    if (p && isStarted(p) && !p.finished) {
      return { video: v, resumeAt: Math.max(0, p.position - 5), progress: p.position / (p.duration || v.duration || 1), mode: 'resume', left: (p.duration || v.duration || 0) - p.position };
    }
    return { video: v, resumeAt: 0, progress: 0, mode: p?.finished ? 'again' : 'start' };
  }
  const watched = videos.map((v) => ({ v, p: progress.get(v.id) })).filter((x) => isStarted(x.p));
  if (!watched.length) return { video: videos[0], resumeAt: 0, progress: 0, mode: 'start' };
  const last = watched.sort((a, b) => b.p.updated_at - a.p.updated_at)[0];
  if (!last.p.finished) {
    return { video: last.v, resumeAt: Math.max(0, last.p.position - 5), progress: last.p.position / (last.p.duration || last.v.duration || 1), mode: 'resume', left: (last.p.duration || last.v.duration || 0) - last.p.position, lastActivity: last.p.updated_at };
  }
  const idx = videos.findIndex((v) => v.id === last.v.id);
  const next = videos[idx + 1];
  if (next) return { video: next, resumeAt: 0, progress: 0, mode: 'next', isNew: next.added_at > last.p.updated_at, lastActivity: last.p.updated_at };
  return { video: videos[0], resumeAt: 0, progress: 0, mode: 'again', lastActivity: last.p.updated_at };
}

export function continueWatching(profile) {
  const progress = progressMap(profile.id);
  const hidden = new Map(db.prepare('SELECT title_id, at FROM continue_hidden WHERE profile_id = ?').all(profile.id).map((r) => [r.title_id, r.at]));
  const touched = new Set();
  for (const p of progress.values()) {
    const v = db.prepare('SELECT title_id FROM videos WHERE id = ?').get(p.video_id);
    if (v) touched.add(v.title_id);
  }
  const items = [];
  for (const id of touched) {
    const title = library().byId.get(id);
    if (!title || !title.videos.length || !canSee(profile, title)) continue;
    const target = playTarget(title, progress);
    if (!target || target.mode === 'start' || target.mode === 'again') continue;
    const lastActivity = target.lastActivity || progress.get(target.video.id)?.updated_at || 0;
    if (hidden.has(id) && hidden.get(id) >= lastActivity) continue;
    let label;
    if (target.mode === 'resume') label = title.kind === 'series' ? `${epLabel(target.video)} · ${fmtLeft(target.left)}` : fmtLeft(target.left);
    else label = `${epLabel(target.video)} · Up next`;
    items.push({
      ...card(title),
      videoId: target.video.id,
      progress: target.progress,
      label,
      badge: target.isNew ? 'New Episode' : null,
      thumb: title.kind === 'series' ? `/media/thumb/${target.video.id}` : null,
      lastActivity,
    });
  }
  return items.sort((a, b) => b.lastActivity - a.lastActivity);
}

// ---------------------------------------------------------------------------
// Cards

export function card(title, extra = {}) {
  return {
    id: title.id,
    kind: title.kind,
    title: title.title,
    year: title.year,
    ageRating: title.age_rating,
    language: title.language,
    genres: title.genres,
    hasCC: title.hasCC,
    poster: `/media/poster/${title.id}`,
    backdrop: `/media/backdrop/${title.id}`,
    hasBackdrop: !!title.backdrop_path,
    seasons: title.kind === 'series' ? new Set(title.videos.map((v) => v.season_number)).size : null,
    ...extra,
  };
}

export function householdRatings() {
  const rows = db.prepare(`SELECT r.title_id, r.stars, r.profile_id, p.is_kid FROM ratings r JOIN profiles p ON p.id = r.profile_id`).all();
  const map = new Map();
  for (const r of rows) {
    if (r.is_kid) continue;
    if (!map.has(r.title_id)) map.set(r.title_id, { sum: 0, n: 0 });
    const m = map.get(r.title_id);
    m.sum += r.stars;
    m.n++;
  }
  return map;
}

export function finishedTitleIds(profileId) {
  const rows = db.prepare(`SELECT v.title_id, SUM(p.finished) done FROM progress p
    JOIN videos v ON v.id = p.video_id AND v.available = 1
    WHERE p.profile_id = ? GROUP BY v.title_id`).all(profileId);
  const out = new Set();
  for (const r of rows) {
    const title = library().byId.get(r.title_id);
    if (!title) continue;
    if (title.kind === 'movie' ? r.done > 0 : r.done >= title.videos.length) out.add(r.title_id);
  }
  return out;
}

export function watchedTitleIds(profileId) {
  return new Set(db.prepare(`SELECT DISTINCT v.title_id FROM progress p JOIN videos v ON v.id = p.video_id WHERE p.profile_id = ?`)
    .all(profileId).map((r) => r.title_id));
}
