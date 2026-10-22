// Reads and writes the plain-text info files (info.txt, season.txt, <episode>.txt)
// and reads Kodi/Jellyfin-style .nfo files.
import fs from 'node:fs';

// Every label we understand, mapped to one canonical field name.
const KEY_ALIASES = {
  title: 'title', name: 'title',
  year: 'year',
  genre: 'genres', genres: 'genres',
  cast: 'cast', starring: 'cast', actors: 'cast',
  director: 'directors', directors: 'directors',
  'age rating': 'ageRating', rating: 'ageRating', certificate: 'ageRating', certification: 'ageRating',
  tags: 'tags', tag: 'tags', keywords: 'tags',
  language: 'language', 'original language': 'language',
  audio: 'audio', 'audio languages': 'audio',
  subtitles: 'subtitles', cc: 'subtitles', captions: 'subtitles',
  'also known as': 'aka', aka: 'aka',
  collection: 'collection', franchise: 'collection',
  order: 'order', 'collection order': 'order',
  intro: 'intro',
  credits: 'credits',
  description: 'description', plot: 'description', summary: 'description', overview: 'description',
};

const LIST_FIELDS = new Set(['genres', 'cast', 'directors', 'tags', 'audio', 'subtitles', 'aka']);

const splitList = (value) => value.split(',').map((s) => s.trim()).filter(Boolean);

// Title-case words that were typed in lowercase ("comedy" -> "Comedy"), leave the rest alone.
const tidy = (s) => (s === s.toLowerCase() ? s.replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : s);

/**
 * Parse an info text file. Forgiving by design: case and spacing in labels don't matter,
 * unknown lines are kept (so write-back doesn't lose them), and everything after
 * "Description:" is the description.
 */
export function parseInfoText(text) {
  const fields = {};
  const extraLines = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([^:]{1,40}?)\s*:\s*(.*)$/);
    const key = m && KEY_ALIASES[m[1].trim().toLowerCase().replace(/\s+/g, ' ')];
    if (!key) {
      extraLines.push(line);
      continue;
    }
    if (key === 'description') {
      const rest = [m[2], ...lines.slice(i + 1)].join('\n').trim();
      fields.description = rest.replace(/[ \t]*\n[ \t]*/g, '\n');
      break;
    }
    const value = m[2].trim();
    if (!value) continue;
    if (LIST_FIELDS.has(key)) {
      const list = splitList(value);
      fields[key] = key === 'genres' || key === 'audio' || key === 'subtitles' ? list.map(tidy) : list;
    } else if (key === 'year') {
      const y = parseInt(value, 10);
      if (y > 1800 && y < 3000) fields.year = y;
    } else if (key === 'order') {
      const n = parseFloat(value);
      if (!Number.isNaN(n)) fields.order = n;
    } else if (key === 'language') {
      fields.language = tidy(value);
    } else {
      fields[key] = value;
    }
  }
  if (fields.description) {
    // Single line breaks inside a paragraph are just Notepad wrapping.
    fields.description = fields.description.split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ')).join('\n\n');
  }
  return { fields, extraLines };
}

export function readInfoFile(file) {
  try {
    return parseInfoText(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const decodeXml = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  .trim();

/** Read the fields we care about from a Kodi/Jellyfin .nfo file (read-only support). */
export function readNfoFile(file) {
  let xml;
  try {
    xml = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const one = (tag) => {
    const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
    return m ? decodeXml(m[1]) : undefined;
  };
  const all = (tag) => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi'))].map((m) => decodeXml(m[1])).filter(Boolean);
  const fields = {};
  const title = one('title');
  if (title) fields.title = title;
  const year = parseInt(one('year') || '', 10);
  if (year) fields.year = year;
  const plot = one('plot') || one('outline');
  if (plot) fields.description = plot;
  const genres = all('genre');
  if (genres.length) fields.genres = genres;
  const directors = all('director');
  if (directors.length) fields.directors = directors;
  const tags = all('tag');
  if (tags.length) fields.tags = tags;
  const cast = [...xml.matchAll(/<actor>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/actor>/gi)].map((m) => decodeXml(m[1]));
  if (cast.length) fields.cast = cast;
  const mpaa = one('mpaa');
  if (mpaa) fields.ageRating = mpaa.replace(/^Rated\s+/i, '');
  const set = xml.match(/<set>[\s\S]*?<name>([\s\S]*?)<\/name>/i);
  if (set) fields.collection = decodeXml(set[1]);
  return { fields, extraLines: [] };
}

const LABELS = [
  ['title', 'Title'], ['year', 'Year'], ['genres', 'Genres'], ['cast', 'Cast'], ['directors', 'Director'],
  ['ageRating', 'Age Rating'], ['tags', 'Tags'], ['language', 'Language'], ['audio', 'Audio'],
  ['subtitles', 'Subtitles'], ['aka', 'Also Known As'], ['collection', 'Collection'], ['order', 'Order'],
  ['intro', 'Intro'], ['credits', 'Credits'],
];

/** Produce info.txt text. Unknown lines from the original file are kept above the description. */
export function formatInfoText(fields, extraLines = []) {
  const out = [];
  for (const [key, label] of LABELS) {
    const v = fields[key];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    out.push(`${label}: ${Array.isArray(v) ? v.join(', ') : v}`);
  }
  out.push(...extraLines);
  out.push('', 'Description:', (fields.description || '').trim(), '');
  return out.join('\n');
}

export const INFO_TEMPLATE = formatInfoText({
  title: 'Movie or show name',
  year: 2024,
  genres: ['Drama', 'Comedy'],
  cast: ['Actor One', 'Actor Two'],
  directors: ['Director Name'],
  ageRating: '13+',
  tags: ['feel-good'],
  language: 'English',
  description: 'A sentence or two about the story.',
});

/** Write a file atomically so a half-written info.txt is never read by the scanner. */
export function writeFileAtomic(file, text) {
  const tmp = `${file}.homeflix-tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

// "00:30-01:15" -> { start: 30, end: 75 }
export function parseRange(value) {
  if (!value) return null;
  const m = value.match(/([\d:.]+)\s*[-–to]+\s*([\d:.]+)/);
  if (!m) return null;
  const start = parseTime(m[1]);
  const end = parseTime(m[2]);
  return start !== null && end !== null && end > start ? { start, end } : null;
}

// "last 01:40" -> { fromEnd: 100 },  "42:10" -> { at: 2530 }
export function parseCredits(value) {
  if (!value) return null;
  const last = value.match(/last\s+([\d:.]+)/i);
  if (last) {
    const t = parseTime(last[1]);
    return t !== null ? { fromEnd: t } : null;
  }
  const t = parseTime(value);
  return t !== null ? { at: t } : null;
}

export function parseTime(s) {
  const parts = String(s).trim().split(':').map(Number);
  if (!parts.length || parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

// Age ratings people actually type, mapped to a minimum age.
const AGE_MAP = {
  u: 0, all: 0, g: 0, 'tv-y': 0, 'tv-g': 0, e: 0,
  pg: 8, 'tv-y7': 7, 'tv-pg': 8, ua: 12, 'u/a': 12, '12a': 12,
  'pg-13': 13, 'tv-14': 14, r: 17, 'tv-ma': 17, a: 18, 'nc-17': 18, x: 18,
};

/** Minimum viewer age for a rating string, or null when unknown. */
export function ageFromRating(rating) {
  if (!rating) return null;
  const r = rating.trim().toLowerCase();
  if (r in AGE_MAP) return AGE_MAP[r];
  const n = r.match(/(\d{1,2})\s*\+?/);
  return n ? Number(n[1]) : null;
}
