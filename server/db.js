import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'homeflix.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- One household login; everyone then picks a profile.
CREATE TABLE IF NOT EXISTS account (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT 'red',
  pin_hash TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_kid INTEGER NOT NULL DEFAULT 0,
  max_age INTEGER NOT NULL DEFAULT 12,
  prefs TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- A movie or a series. folder_path is the key that ties it to the library.
CREATE TABLE IF NOT EXISTS titles (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('movie', 'series')),
  folder_path TEXT NOT NULL UNIQUE,
  info_path TEXT,
  title TEXT NOT NULL,
  year INTEGER,
  description TEXT,
  genres TEXT NOT NULL DEFAULT '[]',
  cast_members TEXT NOT NULL DEFAULT '[]',
  directors TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  aka TEXT NOT NULL DEFAULT '[]',
  language TEXT,
  audio TEXT NOT NULL DEFAULT '[]',
  declared_subtitles TEXT NOT NULL DEFAULT '[]',
  age_rating TEXT,
  collection TEXT,
  collection_order REAL,
  poster_path TEXT,
  backdrop_path TEXT,
  trailer_path TEXT,
  extra_lines TEXT NOT NULL DEFAULT '[]',
  available INTEGER NOT NULL DEFAULT 1,
  missing_since INTEGER,
  added_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  folder_path TEXT,
  description TEXT,
  intro TEXT,
  credits TEXT,
  UNIQUE (title_id, number)
);

-- A playable file: a movie's main file or one episode.
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  season_number INTEGER,
  episode_number INTEGER,
  episode_title TEXT,
  description TEXT,
  path TEXT NOT NULL UNIQUE,
  size INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  duration REAL,
  thumb_path TEXT,
  intro TEXT,
  credits TEXT,
  sub_offset_ms INTEGER NOT NULL DEFAULT 0,
  available INTEGER NOT NULL DEFAULT 1,
  missing_since INTEGER,
  added_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS videos_title ON videos(title_id);
CREATE INDEX IF NOT EXISTS videos_fingerprint ON videos(fingerprint);

CREATE TABLE IF NOT EXISTS subtitles (
  id INTEGER PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  stream_index INTEGER,
  lang TEXT,
  label TEXT NOT NULL,
  sdh INTEGER NOT NULL DEFAULT 0,
  forced INTEGER NOT NULL DEFAULT 0,
  format TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS progress (
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  position REAL NOT NULL,
  duration REAL,
  finished INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (profile_id, video_id)
);

CREATE TABLE IF NOT EXISTS ratings (
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (profile_id, title_id)
);

-- Which rating prompts a profile has already seen, so we never nag.
CREATE TABLE IF NOT EXISTS rating_prompts (
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  trigger_key TEXT NOT NULL,
  response TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (profile_id, title_id, trigger_key)
);

CREATE TABLE IF NOT EXISTS my_list (
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (profile_id, title_id)
);

-- Titles removed from Continue Watching by hand.
CREATE TABLE IF NOT EXISTS continue_hidden (
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  PRIMARY KEY (profile_id, title_id)
);

CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  at INTEGER NOT NULL
);
`);

// Columns added after the first release.
const sessionCols = db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
if (!sessionCols.includes('admin_until')) db.exec('ALTER TABLE sessions ADD COLUMN admin_until INTEGER');

export const now = () => Date.now();

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

const JSON_COLUMNS = ['genres', 'cast_members', 'directors', 'tags', 'aka', 'audio', 'declared_subtitles', 'extra_lines', 'prefs'];

// Turn stored JSON text columns back into arrays/objects.
export function parseRow(row) {
  if (!row) return row;
  const out = { ...row };
  for (const col of JSON_COLUMNS) {
    if (typeof out[col] === 'string') out[col] = JSON.parse(out[col]);
  }
  return out;
}
