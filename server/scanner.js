// Walks the library folder and keeps the index (titles, seasons, videos, subtitles) in sync.
// Heavy work (fingerprint + probe) only happens for videos whose size or modified time changed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { db, now, getSetting, tx } from './db.js';
import { VIDEO_EXTS, IMAGE_EXTS, SUBTITLE_EXTS, QUICK_SCAN_INTERVAL_MS } from './config.js';
import { readInfoFile, readNfoFile } from './infofile.js';
import { describeSubtitle, lookupLanguage, languageName } from './subtitles.js';
import { probe } from './media.js';

export const libraryEvents = new EventEmitter();

export const scanState = {
  running: false,
  queued: false,
  reason: null,
  startedAt: null,
  finishedAt: null,
  lastDurationMs: null,
  counts: { movies: 0, series: 0, episodes: 0 },
  error: null,
};

const ext = (f) => path.extname(f).toLowerCase();
const stem = (f) => path.basename(f, path.extname(f));

function listDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.') && !e.name.endsWith('.homeflix-tmp'));
  } catch {
    return [];
  }
}

function findFile(entries, dir, names, exts) {
  for (const name of names) {
    const hit = entries.find((e) => e.isFile() && stem(e.name).toLowerCase() === name && exts.has(ext(e.name)));
    if (hit) return path.join(dir, hit.name);
  }
  return null;
}

/** Size + first and last megabyte: stable across renames and moves, cheap to compute. */
function fingerprint(file, size) {
  const hash = crypto.createHash('sha1').update(String(size));
  const fd = fs.openSync(file, 'r');
  try {
    const chunk = Buffer.alloc(Math.min(1024 * 1024, size));
    fs.readSync(fd, chunk, 0, chunk.length, 0);
    hash.update(chunk);
    if (size > chunk.length) {
      fs.readSync(fd, chunk, 0, chunk.length, size - chunk.length);
      hash.update(chunk);
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

// "Inception (2010)" -> { title: 'Inception', year: 2010 }
function parseFolderName(name) {
  const m = name.match(/^(.*?)[\s._]*[([](\d{4})[)\]]\s*$/);
  if (m) return { title: m[1].replace(/[._]/g, ' ').trim(), year: Number(m[2]) };
  return { title: name.replace(/[._]/g, ' ').trim(), year: null };
}

// Pull season/episode numbers and the episode name out of a file name.
function parseEpisodeName(name, seasonFromFolder) {
  const patterns = [
    /s(\d{1,2})[\s._-]*e(\d{1,3})/i,
    /(?:^|[\s._-])(\d{1,2})x(\d{1,3})(?=$|[\s._-])/i,
  ];
  for (const re of patterns) {
    const m = name.match(re);
    if (m) {
      const rest = name.slice(m.index + m[0].length).replace(/^[\s._-]+/, '').replace(/[._]/g, ' ').trim();
      return { season: Number(m[1]), episode: Number(m[2]), title: rest || null };
    }
  }
  const m = name.match(/(?:^|[\s._-])(?:e|ep|episode)[\s._-]*(\d{1,3})/i);
  if (m && seasonFromFolder !== null) {
    const rest = name.slice(m.index + m[0].length).replace(/^[\s._-]+/, '').replace(/[._]/g, ' ').trim();
    return { season: seasonFromFolder, episode: Number(m[1]), title: rest || null };
  }
  return null;
}

function parseSeasonFolder(name) {
  if (/^specials?$/i.test(name)) return 0;
  const m = name.match(/^(?:season|series|s)[\s._-]*0*(\d{1,3})$/i);
  return m ? Number(m[1]) : null;
}

const isTrailer = (name) => /(^|[\s._-])trailer([\s._-]|$)/i.test(stem(name));
const isSample = (name) => /(^|[\s._-])sample([\s._-]|$)/i.test(stem(name));

/** External subtitle files that belong to a video ("<video name>.<lang>.<flags>.srt"). */
function subtitleFilesFor(videoFile, entries, dir, onlyVideoInFolder) {
  const base = stem(videoFile).toLowerCase();
  const subs = entries.filter((e) => e.isFile() && SUBTITLE_EXTS.has(ext(e.name)));
  let matched = subs.filter((e) => e.name.toLowerCase().startsWith(base + '.') || stem(e.name).toLowerCase() === base);
  // With one video in the folder, any subtitle file in it is for that video.
  if (!matched.length && onlyVideoInFolder) matched = subs;
  return matched.map((e) => {
    const name = e.name.toLowerCase().startsWith(base) ? e.name.slice(base.length) : `.${stem(e.name)}${ext(e.name)}`;
    const tokens = name.split('.').filter(Boolean).slice(0, -1);
    return { path: path.join(dir, e.name), format: ext(e.name).slice(1), ...describeSubtitle(tokens) };
  });
}

// ---------------------------------------------------------------------------
// Database writes

let seenVideoIds;
let seenTitleIds;
let relinked;

function upsertTitle({ kind, folderPath, infoPath, fields, fallback, poster, backdrop, trailer, extraLines }) {
  const t = now();
  const lang = fields.language ? (lookupLanguage(fields.language)?.name || fields.language) : null;
  const values = {
    kind,
    folder_path: folderPath,
    info_path: infoPath,
    title: fields.title || fallback.title,
    year: fields.year || fallback.year || null,
    description: fields.description || null,
    genres: JSON.stringify(fields.genres || []),
    cast_members: JSON.stringify(fields.cast || []),
    directors: JSON.stringify(fields.directors || []),
    tags: JSON.stringify((fields.tags || []).map((s) => s.toLowerCase())),
    aka: JSON.stringify(fields.aka || []),
    language: lang,
    audio: JSON.stringify(fields.audio || []),
    declared_subtitles: JSON.stringify(fields.subtitles || []),
    age_rating: fields.ageRating || null,
    collection: fields.collection || null,
    collection_order: fields.order ?? null,
    poster_path: poster,
    backdrop_path: backdrop,
    trailer_path: trailer,
    extra_lines: JSON.stringify(extraLines || []),
  };
  const existing = db.prepare('SELECT id FROM titles WHERE folder_path = ?').get(folderPath);
  const cols = Object.keys(values);
  if (existing) {
    db.prepare(`UPDATE titles SET ${cols.map((c) => `${c} = ?`).join(', ')}, available = 1, missing_since = NULL, updated_at = ? WHERE id = ?`)
      .run(...cols.map((c) => values[c]), t, existing.id);
    seenTitleIds.add(existing.id);
    return existing.id;
  }
  const res = db.prepare(`INSERT INTO titles (${cols.join(', ')}, added_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, ?, ?)`)
    .run(...cols.map((c) => values[c]), t, t);
  const id = Number(res.lastInsertRowid);
  seenTitleIds.add(id);
  return id;
}

function upsertSeason(titleId, number, folderPath, info) {
  const f = info?.fields || {};
  db.prepare(`INSERT INTO seasons (title_id, number, folder_path, description, intro, credits) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(title_id, number) DO UPDATE SET folder_path = excluded.folder_path, description = excluded.description,
      intro = excluded.intro, credits = excluded.credits`)
    .run(titleId, number, folderPath, f.description || null, f.intro || null, f.credits || null);
}

async function upsertVideo({ titleId, file, season = null, episode = null, episodeTitle = null, description = null, thumb = null, intro = null, credits = null, subtitles }) {
  const stat = fs.statSync(file);
  const mtime = Math.round(stat.mtimeMs);
  let row = db.prepare('SELECT * FROM videos WHERE path = ?').get(file);
  let probed = null;

  if (!row) {
    const fp = fingerprint(file, stat.size);
    // Same content at a new path: a renamed or moved file. Keep its id so progress carries over.
    const moved = db.prepare('SELECT * FROM videos WHERE fingerprint = ? ORDER BY available ASC').all(fp)
      .find((v) => !fs.existsSync(v.path));
    probed = await probe(file);
    if (moved) {
      if (moved.title_id !== titleId) relinked.push([moved.title_id, titleId]);
      db.prepare('UPDATE videos SET path = ?, title_id = ?, size = ?, mtime = ?, available = 1, missing_since = NULL WHERE id = ?')
        .run(file, titleId, stat.size, mtime, moved.id);
      row = { ...moved, path: file };
    } else {
      const res = db.prepare(`INSERT INTO videos (title_id, path, size, mtime, fingerprint, duration, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(titleId, file, stat.size, mtime, fp, probed?.duration ?? null, now());
      row = { id: Number(res.lastInsertRowid) };
    }
  } else if (row.size !== stat.size || row.mtime !== mtime) {
    // The file was replaced. Keep progress if the length is about the same (a better copy of the same thing).
    probed = await probe(file);
    const fp = fingerprint(file, stat.size);
    const sameLength = !row.duration || !probed?.duration || Math.abs(row.duration - probed.duration) < 60;
    if (!sameLength) db.prepare('DELETE FROM progress WHERE video_id = ?').run(row.id);
    db.prepare('UPDATE videos SET size = ?, mtime = ?, fingerprint = ?, duration = COALESCE(?, duration) WHERE id = ?')
      .run(stat.size, mtime, fp, probed?.duration ?? null, row.id);
  } else if (row.duration === null) {
    probed = await probe(file);
    if (probed?.duration) db.prepare('UPDATE videos SET duration = ? WHERE id = ?').run(probed.duration, row.id);
  }

  db.prepare(`UPDATE videos SET title_id = ?, season_number = ?, episode_number = ?, episode_title = ?, description = ?,
    thumb_path = ?, intro = ?, credits = ?, available = 1, missing_since = NULL WHERE id = ?`)
    .run(titleId, season, episode, episodeTitle, description, thumb, intro, credits, row.id);
  seenVideoIds.add(row.id);

  db.prepare('DELETE FROM subtitles WHERE video_id = ? AND stream_index IS NULL').run(row.id);
  const ins = db.prepare('INSERT INTO subtitles (video_id, path, stream_index, lang, label, sdh, forced, format) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const s of subtitles) ins.run(row.id, s.path, null, s.lang, s.label, s.sdh ? 1 : 0, s.forced ? 1 : 0, s.format);

  if (probed) {
    // Embedded subtitles only change when the file changes, so refresh them only after a probe.
    db.prepare('DELETE FROM subtitles WHERE video_id = ? AND stream_index IS NOT NULL').run(row.id);
    for (const s of probed.subtitles) {
      const lang = lookupLanguage(s.lang);
      let label = s.title || lang?.name || 'Subtitles';
      if (s.forced && !/forced/i.test(label)) label += ' (Forced)';
      ins.run(row.id, file, s.index, lang?.code || null, label, s.sdh ? 1 : 0, s.forced ? 1 : 0, s.imageBased ? 'image' : 'embedded');
    }
    if (probed.audio.length > 1) {
      db.prepare("UPDATE titles SET audio = ? WHERE id = ? AND audio = '[]'")
        .run(JSON.stringify([...new Set(probed.audio.map((a) => languageName(a.lang)).filter(Boolean))]), titleId);
    }
  }
  return row.id;
}

// ---------------------------------------------------------------------------
// Folder handlers

function readInfo(entries, dir, names) {
  const txt = findFile(entries, dir, names, new Set(['.txt']));
  if (txt) return { info: readInfoFile(txt), infoPath: txt };
  const nfo = findFile(entries, dir, [...names, 'movie', 'tvshow'], new Set(['.nfo']))
    || (entries.find((e) => e.isFile() && ext(e.name) === '.nfo') && path.join(dir, entries.find((e) => ext(e.name) === '.nfo').name));
  if (nfo) return { info: readNfoFile(nfo), infoPath: nfo };
  return { info: null, infoPath: null };
}

async function scanMovieFolder(dir) {
  const entries = listDir(dir);
  const videos = entries.filter((e) => e.isFile() && VIDEO_EXTS.has(ext(e.name)) && !isTrailer(e.name) && !isSample(e.name));
  if (!videos.length) return;
  const main = videos.map((e) => ({ e, size: fs.statSync(path.join(dir, e.name)).size })).sort((a, b) => b.size - a.size)[0].e;
  const mainPath = path.join(dir, main.name);
  const { info, infoPath } = readInfo(entries, dir, ['info', stem(main.name).toLowerCase()]);
  const fields = info?.fields || {};
  const trailerEntry = entries.find((e) => e.isFile() && VIDEO_EXTS.has(ext(e.name)) && isTrailer(e.name));

  const titleId = upsertTitle({
    kind: 'movie',
    folderPath: dir,
    infoPath,
    fields,
    extraLines: info?.extraLines,
    fallback: parseFolderName(path.basename(dir)),
    poster: findFile(entries, dir, ['poster', 'folder', 'cover', stem(main.name).toLowerCase()], IMAGE_EXTS),
    backdrop: findFile(entries, dir, ['backdrop', 'fanart', 'background'], IMAGE_EXTS),
    trailer: trailerEntry ? path.join(dir, trailerEntry.name) : null,
  });
  await upsertVideo({
    titleId,
    file: mainPath,
    intro: fields.intro || null,
    credits: fields.credits || null,
    subtitles: subtitleFilesFor(main.name, entries, dir, videos.length === 1),
  });
  scanState.counts.movies++;
}

// A video dropped straight into Movies/ with optional same-name sidecar files.
async function scanLooseMovie(dir, entry, entries) {
  const file = path.join(dir, entry.name);
  const base = stem(entry.name).toLowerCase();
  const txt = entries.find((e) => e.isFile() && stem(e.name).toLowerCase() === base && ext(e.name) === '.txt');
  const nfo = entries.find((e) => e.isFile() && stem(e.name).toLowerCase() === base && ext(e.name) === '.nfo');
  const infoPath = txt ? path.join(dir, txt.name) : nfo ? path.join(dir, nfo.name) : null;
  const info = txt ? readInfoFile(infoPath) : nfo ? readNfoFile(infoPath) : null;
  const fields = info?.fields || {};
  const titleId = upsertTitle({
    kind: 'movie',
    folderPath: file,
    infoPath,
    fields,
    extraLines: info?.extraLines,
    fallback: parseFolderName(stem(entry.name)),
    poster: findFile(entries, dir, [base], IMAGE_EXTS),
    backdrop: null,
    trailer: null,
  });
  await upsertVideo({ titleId, file, intro: fields.intro || null, credits: fields.credits || null, subtitles: subtitleFilesFor(entry.name, entries, dir, false) });
  scanState.counts.movies++;
}

async function scanEpisodes(titleId, dir, entries, seasonFromFolder, seasonsSeen) {
  for (const e of entries) {
    if (!e.isFile() || !VIDEO_EXTS.has(ext(e.name)) || isTrailer(e.name) || isSample(e.name)) continue;
    const parsed = parseEpisodeName(stem(e.name), seasonFromFolder);
    if (!parsed) continue;
    const season = seasonFromFolder ?? parsed.season;
    const base = stem(e.name).toLowerCase();
    const epTxt = entries.find((x) => x.isFile() && ext(x.name) === '.txt' && stem(x.name).toLowerCase() === base);
    const epInfo = epTxt ? readInfoFile(path.join(dir, epTxt.name))?.fields || {} : {};
    if (!seasonsSeen.has(season)) {
      seasonsSeen.add(season);
      upsertSeason(titleId, season, seasonFromFolder !== null ? dir : null, null);
    }
    await upsertVideo({
      titleId,
      file: path.join(dir, e.name),
      season,
      episode: parsed.episode,
      episodeTitle: epInfo.title || parsed.title,
      description: epInfo.description || null,
      thumb: findFile(entries, dir, [base], IMAGE_EXTS),
      intro: epInfo.intro || null,
      credits: epInfo.credits || null,
      subtitles: subtitleFilesFor(e.name, entries, dir, false),
    });
    scanState.counts.episodes++;
  }
}

async function scanSeriesFolder(dir) {
  const entries = listDir(dir);
  const { info, infoPath } = readInfo(entries, dir, ['info', 'tvshow']);
  const fields = info?.fields || {};
  const trailerEntry = entries.find((e) => e.isFile() && VIDEO_EXTS.has(ext(e.name)) && isTrailer(e.name));
  const titleId = upsertTitle({
    kind: 'series',
    folderPath: dir,
    infoPath,
    fields,
    extraLines: info?.extraLines,
    fallback: parseFolderName(path.basename(dir)),
    poster: findFile(entries, dir, ['poster', 'folder', 'cover'], IMAGE_EXTS),
    backdrop: findFile(entries, dir, ['backdrop', 'fanart', 'background'], IMAGE_EXTS),
    trailer: trailerEntry ? path.join(dir, trailerEntry.name) : null,
  });

  const seasonsSeen = new Set();
  // Episodes directly in the show folder ("1x02 Name.mp4", "S01E02.mp4").
  await scanEpisodes(titleId, dir, entries, null, seasonsSeen);

  for (const sub of entries.filter((e) => e.isDirectory())) {
    const n = parseSeasonFolder(sub.name);
    if (n === null) continue;
    const sdir = path.join(dir, sub.name);
    const sentries = listDir(sdir);
    const seasonTxt = findFile(sentries, sdir, ['season'], new Set(['.txt']));
    upsertSeason(titleId, n, sdir, seasonTxt ? readInfoFile(seasonTxt) : null);
    seasonsSeen.add(n);
    await scanEpisodes(titleId, sdir, sentries, n, seasonsSeen);
  }
  // Season info for flat shows can live in season.txt next to the episodes.
  const flatSeasonTxt = findFile(entries, dir, ['season'], new Set(['.txt']));
  if (flatSeasonTxt && seasonsSeen.size) {
    const sinfo = readInfoFile(flatSeasonTxt);
    for (const n of seasonsSeen) {
      const s = db.prepare('SELECT folder_path FROM seasons WHERE title_id = ? AND number = ?').get(titleId, n);
      if (s && !s.folder_path) upsertSeason(titleId, n, null, sinfo);
    }
  }
  db.prepare(`DELETE FROM seasons WHERE title_id = ? AND number NOT IN (${[...seasonsSeen].map(() => '?').join(',') || 'NULL'})`)
    .run(titleId, ...seasonsSeen);
  scanState.counts.series++;
}

// Ratings, My List etc. follow a title whose files moved to a new folder.
function migrateTitleData(fromId, toId) {
  if (fromId === toId) return;
  for (const table of ['ratings', 'my_list', 'rating_prompts', 'continue_hidden']) {
    db.prepare(`UPDATE OR IGNORE ${table} SET title_id = ? WHERE title_id = ?`).run(toId, fromId);
    db.prepare(`DELETE FROM ${table} WHERE title_id = ?`).run(fromId);
  }
  const left = db.prepare('SELECT COUNT(*) n FROM videos WHERE title_id = ?').get(fromId).n;
  if (!left) db.prepare('DELETE FROM titles WHERE id = ?').run(fromId);
}

const MOVIE_DIR = /^(movies?|films?)$/i;
const SERIES_DIR = /^(series|tv|tv[\s_-]?shows?|shows?)$/i;

export async function scanLibrary(reason = 'manual') {
  if (scanState.running) {
    scanState.queued = true;
    return;
  }
  const root = getSetting('library_path');
  Object.assign(scanState, { running: true, queued: false, reason, startedAt: now(), error: null, counts: { movies: 0, series: 0, episodes: 0 } });
  seenVideoIds = new Set();
  seenTitleIds = new Set();
  relinked = [];
  const started = Date.now();
  try {
    if (!root || !fs.existsSync(root)) {
      scanState.error = root ? `Library folder not found: ${root}` : 'No library folder chosen yet.';
    } else {
      const top = listDir(root).filter((e) => e.isDirectory());
      const movieDirs = top.filter((e) => MOVIE_DIR.test(e.name));
      const seriesDirs = top.filter((e) => SERIES_DIR.test(e.name));
      if (!movieDirs.length && !seriesDirs.length) {
        scanState.error = 'Put movies in a "Movies" folder and shows in a "Series" folder inside the library folder.';
      }
      for (const m of movieDirs) {
        const dir = path.join(root, m.name);
        const entries = listDir(dir);
        for (const e of entries) {
          try {
            if (e.isDirectory()) await scanMovieFolder(path.join(dir, e.name));
            else if (VIDEO_EXTS.has(ext(e.name)) && !isTrailer(e.name)) await scanLooseMovie(dir, e, entries);
          } catch (err) {
            console.warn(`Skipped ${e.name}: ${err.message}`);
          }
        }
      }
      for (const s of seriesDirs) {
        const dir = path.join(root, s.name);
        for (const e of listDir(dir).filter((x) => x.isDirectory())) {
          try {
            await scanSeriesFolder(path.join(dir, e.name));
          } catch (err) {
            console.warn(`Skipped ${e.name}: ${err.message}`);
          }
        }
      }
    }

    tx(() => {
      for (const [from, to] of relinked) migrateTitleData(from, to);
      // Anything we didn't see this time is hidden (not deleted): the drive may just be unplugged.
      const t = now();
      for (const v of db.prepare('SELECT id FROM videos WHERE available = 1').all()) {
        if (!seenVideoIds.has(v.id)) db.prepare('UPDATE videos SET available = 0, missing_since = ? WHERE id = ?').run(t, v.id);
      }
      for (const row of db.prepare('SELECT id FROM titles WHERE available = 1').all()) {
        if (!seenTitleIds.has(row.id)) db.prepare('UPDATE titles SET available = 0, missing_since = ? WHERE id = ?').run(t, row.id);
      }
      db.prepare(`UPDATE titles SET available = 0, missing_since = COALESCE(missing_since, ?)
        WHERE available = 1 AND NOT EXISTS (SELECT 1 FROM videos v WHERE v.title_id = titles.id AND v.available = 1)`).run(t);
    });
  } catch (err) {
    scanState.error = err.message;
    console.error('Scan failed:', err);
  } finally {
    Object.assign(scanState, { running: false, finishedAt: now(), lastDurationMs: Date.now() - started });
    libraryEvents.emit('changed');
  }
  if (scanState.queued) scanLibrary('queued');
}

// ---------------------------------------------------------------------------
// Watching for changes

let watcher = null;
let debounce = null;
let interval = null;

export function startWatching() {
  stopWatching();
  const root = getSetting('library_path');
  if (root && fs.existsSync(root)) {
    try {
      watcher = fs.watch(root, { recursive: true }, (_event, name) => {
        if (name && (name.endsWith('.homeflix-tmp') || path.basename(name).startsWith('.'))) return;
        clearTimeout(debounce);
        debounce = setTimeout(() => scanLibrary('file change'), 2000);
      });
      watcher.on('error', () => stopWatching());
    } catch {
      // Network drives may not support watching; the timer below still catches changes.
    }
  }
  interval = setInterval(() => scanLibrary('scheduled'), QUICK_SCAN_INTERVAL_MS);
}

export function stopWatching() {
  watcher?.close();
  watcher = null;
  clearInterval(interval);
}
