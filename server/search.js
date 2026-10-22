// In-memory search over the library. A home library is small enough (even tens of thousands of
// titles) to score every title per keystroke, which lets us be generous with typos.
import { db } from './db.js';
import { library, visibleTitles, card, finishedTitleIds } from './catalog.js';
import { tasteVector, _getModel, _dot, topPicks } from './recommend.js';

// Lowercase, strip accents ("Élise" -> "elise"), keep letters/digits in any script.
export const normalize = (s) => (s || '').normalize('NFKD').replace(/\p{M}/gu, (m) => (/[ऀ-෿]/.test(m) ? m : ''))
  .toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();

const words = (s) => normalize(s).split(' ').filter(Boolean);

function levenshtein(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** How well one query word matches one indexed word: 1 exact, 0.85 prefix, less for typos. */
function wordScore(q, w) {
  if (w === q) return 1;
  if (w.startsWith(q) && q.length >= 2) return 0.85;
  if (q.length < 4) return 0;
  const max = q.length >= 7 ? 2 : 1;
  const d = levenshtein(q, w.slice(0, q.length + max), max);
  if (d <= max) return 0.7 - d * 0.1;
  return 0;
}

// Field weights: a title match beats a cast match beats a description match.
const FIELDS = [
  ['title', 10], ['people', 6], ['genre', 4], ['language', 3], ['episodes', 3], ['description', 1],
];

let index = null;

export function invalidateSearch() {
  index = null;
}

function buildIndex() {
  return library().titles.map((t) => {
    const fieldWords = {
      title: [t.title, ...t.aka],
      people: [...t.cast_members, ...t.directors],
      genre: [...t.genres, ...t.tags.map((x) => x.replace(/-/g, ' '))],
      language: [t.language || '', ...t.audio],
      episodes: t.episodeTitles,
      description: [t.description || ''],
    };
    const doc = { id: t.id, phrases: {}, words: {} };
    for (const [field, values] of Object.entries(fieldWords)) {
      doc.phrases[field] = values.map(normalize).filter(Boolean);
      const ws = new Set();
      for (const v of values) {
        const list = words(v);
        list.forEach((w, i) => {
          ws.add(w);
          // "shah rukh" is often typed as "shahrukh".
          if (list[i + 1]) ws.add(w + list[i + 1]);
        });
      }
      doc.words[field] = [...ws];
    }
    return doc;
  });
}

function scoreDoc(doc, q, qWords) {
  let total = 0;
  let matchedField = null;
  // Whole-phrase matches first.
  for (const [field, weight] of FIELDS) {
    for (const p of doc.phrases[field]) {
      if (p === q) total = Math.max(total, weight * 1.6);
      else if (p.startsWith(q)) total = Math.max(total, weight * 1.35);
      else if (q.length >= 3 && p.includes(q)) total = Math.max(total, weight * 1.1);
      else continue;
      matchedField = matchedField || field;
    }
  }
  // Then every query word must match something, somewhere.
  let wordTotal = 0;
  for (const qw of qWords) {
    let best = 0;
    let bestField = null;
    for (const [field, weight] of FIELDS) {
      for (const w of doc.words[field]) {
        const s = wordScore(qw, w) * weight;
        if (s > best) {
          best = s;
          bestField = field;
        }
      }
    }
    if (!best) {
      wordTotal = 0;
      break;
    }
    wordTotal += best / qWords.length;
    matchedField = matchedField || bestField;
  }
  return { score: Math.max(total, wordTotal), field: matchedField };
}

export function facets(profile) {
  const titles = visibleTitles(profile);
  const count = (fn) => {
    const m = new Map();
    for (const t of titles) for (const v of fn(t)) if (v) m.set(v, (m.get(v) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n }));
  };
  return {
    genres: count((t) => t.genres),
    languages: count((t) => [t.language]),
    audio: count((t) => t.audio),
    decades: count((t) => (t.year ? [`${Math.floor(t.year / 10) * 10}s`] : [])).sort((a, b) => b.value.localeCompare(a.value)),
  };
}

/**
 * filters: { type: 'movie'|'series', genre, language, audio, decade: '2010s', cc: bool, unwatched: bool, mylist: bool }
 */
export function search(profile, rawQuery, filters = {}) {
  if (!index) index = buildIndex();
  const q = normalize(rawQuery);
  const qWords = q.split(' ').filter(Boolean);
  const lib = library();
  const visible = new Set(visibleTitles(profile).map((t) => t.id));
  const finished = finishedTitleIds(profile.id);
  const myList = filters.mylist ? new Set(db.prepare('SELECT title_id FROM my_list WHERE profile_id = ?').all(profile.id).map((r) => r.title_id)) : null;
  const { vectors } = _getModel();
  const taste = tasteVector(profile.id);

  const pass = (t) => {
    if (!visible.has(t.id)) return false;
    if (filters.type && t.kind !== filters.type) return false;
    if (filters.genre && !t.genres.includes(filters.genre)) return false;
    if (filters.language && t.language !== filters.language) return false;
    if (filters.audio && !t.audio.includes(filters.audio)) return false;
    if (filters.decade && !(t.year && `${Math.floor(t.year / 10) * 10}s` === filters.decade)) return false;
    if (filters.cc && !t.hasCC) return false;
    if (filters.unwatched && finished.has(t.id)) return false;
    if (myList && !myList.has(t.id)) return false;
    return true;
  };

  const results = [];
  for (const doc of index) {
    const t = lib.byId.get(doc.id);
    if (!t || !pass(t)) continue;
    let score;
    let field = null;
    if (qWords.length) {
      ({ score, field } = scoreDoc(doc, q, qWords));
      if (!score) continue;
    } else {
      score = 1;
    }
    // Personal touch: titles closer to this profile's taste rank a little higher.
    if (taste) score += 1.5 * _dot(taste, vectors.get(t.id));
    if (finished.has(t.id)) score *= 0.9;
    let note = null;
    if (field === 'episodes') {
      const ep = t.videos.find((v) => v.episode_title && qWords.every((w) => words(v.episode_title).some((x) => wordScore(w, x) > 0)));
      if (ep) note = `Episode: ${ep.episode_title} (S${ep.season_number}:E${ep.episode_number})`;
    } else if (field === 'people') {
      const who = [...t.cast_members, ...t.directors].find((p) => qWords.every((w) => words(p).concat(words(p).join('')).some((x) => wordScore(w, x) > 0)));
      if (who) note = t.directors.includes(who) ? `Directed by ${who}` : `Starring ${who}`;
    }
    results.push({ t, score, note });
  }
  // On a tie the shorter title wins, so "quantum" puts "Quantum Heist" before "Quantum Heist 2".
  results.sort((a, b) => b.score - a.score || a.t.title.length - b.t.title.length || b.t.added_at - a.t.added_at);

  const out = { results: results.slice(0, 60).map(({ t, note }) => card(t, { note })) };
  if (!out.results.length && qWords.length) {
    // "Did you mean": the closest title by edit distance.
    let best = null;
    for (const t of visibleTitles(profile)) {
      for (const name of [t.title, ...t.aka]) {
        const n = normalize(name);
        const d = levenshtein(q, n.slice(0, q.length + 3), Math.max(3, Math.floor(q.length / 2)));
        if (!best || d < best.d) best = { d, name: t.title };
      }
    }
    if (best && best.d <= Math.max(3, Math.floor(q.length / 2))) out.didYouMean = best.name;
    out.similar = topPicks(profile, 12);
  }
  return out;
}

export function logSearch(profileId, query) {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return;
  db.prepare('DELETE FROM search_history WHERE profile_id = ? AND lower(query) = lower(?)').run(profileId, q);
  db.prepare('INSERT INTO search_history (profile_id, query, at) VALUES (?, ?, ?)').run(profileId, q, Date.now());
}

export function recentSearches(profileId) {
  return db.prepare('SELECT query FROM search_history WHERE profile_id = ? ORDER BY at DESC LIMIT 8').all(profileId).map((r) => r.query);
}
