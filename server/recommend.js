// Recommendations without any external service:
//  1. content similarity (genres, tags, director, cast, language, era) weighted by rarity (TF-IDF)
//  2. household co-ratings ("profiles who rated this 4★+ also rated ... 4★+")
//  3. a per-profile taste vector built from that profile's star ratings, centred on its own average
import { db } from './db.js';
import { library, visibleTitles, canSee, card, finishedTitleIds, watchedTitleIds, householdRatings, continueWatching } from './catalog.js';

const WEIGHTS = { g: 1, t: 1.5, d: 1.5, c: 1, l: 0.8, e: 0.4, k: 0.3 };

let model = null;

export function invalidateModel() {
  model = null;
}

function features(t) {
  const f = [];
  for (const g of t.genres) f.push(`g:${g.toLowerCase()}`);
  for (const tag of t.tags) f.push(`t:${tag}`);
  for (const d of t.directors) f.push(`d:${d.toLowerCase()}`);
  for (const c of t.cast_members.slice(0, 6)) f.push(`c:${c.toLowerCase()}`);
  if (t.language) f.push(`l:${t.language.toLowerCase()}`);
  if (t.year) f.push(`e:${Math.floor(t.year / 10) * 10}`);
  f.push(`k:${t.kind}`);
  return f;
}

function buildModel() {
  const titles = library().titles;
  const df = new Map();
  const raw = new Map();
  for (const t of titles) {
    const f = [...new Set(features(t))];
    raw.set(t.id, f);
    for (const x of f) df.set(x, (df.get(x) || 0) + 1);
  }
  const n = titles.length || 1;
  const vectors = new Map();
  for (const [id, f] of raw) {
    const v = new Map();
    let norm = 0;
    for (const x of f) {
      // Features shared by only one title can't connect anything; skip them.
      if (df.get(x) < 2) continue;
      const w = WEIGHTS[x[0]] * Math.log(1 + n / df.get(x));
      v.set(x, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [k, w] of v) v.set(k, w / norm);
    vectors.set(id, v);
  }
  return { vectors };
}

function getModel() {
  if (!model) model = buildModel();
  return model;
}

function dot(a, b) {
  if (!a || !b) return 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let s = 0;
  for (const [k, w] of small) {
    const o = big.get(k);
    if (o) s += w * o;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Ratings

function allRatings() {
  return db.prepare('SELECT r.profile_id, r.title_id, r.stars, p.name, p.is_kid FROM ratings r JOIN profiles p ON p.id = r.profile_id').all();
}

/** Each profile rates differently; a rating counts relative to that profile's own average. */
function profileCentre(ratings) {
  if (!ratings.length) return 3;
  const mean = ratings.reduce((s, r) => s + r.stars, 0) / ratings.length;
  // Shrink towards 3 until there are enough ratings to trust the profile's own average.
  return (mean * ratings.length + 3 * 2) / (ratings.length + 2);
}

export function tasteVector(profileId) {
  const { vectors } = getModel();
  const mine = db.prepare('SELECT title_id, stars FROM ratings WHERE profile_id = ?').all(profileId);
  const centre = profileCentre(mine);
  const taste = new Map();
  let any = false;
  for (const r of mine) {
    const w = r.stars - centre;
    const v = vectors.get(r.title_id);
    if (!v || Math.abs(w) < 0.01) continue;
    any = true;
    for (const [k, x] of v) taste.set(k, (taste.get(k) || 0) + w * x);
  }
  if (!any) return null;
  let norm = 0;
  for (const x of taste.values()) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (const [k, x] of taste) taste.set(k, x / norm);
  return taste;
}

/** Item-to-item similarity from household ratings: co-liked / sqrt(likesA * likesB). */
function coLikes() {
  const ratings = allRatings();
  const byProfile = new Map();
  for (const r of ratings) {
    if (!byProfile.has(r.profile_id)) byProfile.set(r.profile_id, []);
    byProfile.get(r.profile_id).push(r);
  }
  const likers = new Map();
  for (const [pid, rs] of byProfile) {
    const centre = Math.max(4, profileCentre(rs));
    for (const r of rs) {
      if (r.stars >= centre) {
        if (!likers.has(r.title_id)) likers.set(r.title_id, new Map());
        likers.get(r.title_id).set(pid, r);
      }
    }
  }
  return likers;
}

function collabScore(likers, a, b) {
  const la = likers.get(a);
  const lb = likers.get(b);
  if (!la || !lb) return { score: 0, by: null };
  let co = 0;
  let by = null;
  for (const [pid] of la) {
    if (lb.has(pid)) {
      co++;
      if (!by || lb.get(pid).stars > by.stars) by = lb.get(pid);
    }
  }
  return { score: co / Math.sqrt(la.size * lb.size), by };
}

// ---------------------------------------------------------------------------
// Explanations

function reasonFor(source, target, collab, profileId) {
  const lc = (a) => a.map((x) => x.toLowerCase());
  const sharedDirector = target.directors.find((d) => lc(source.directors).includes(d.toLowerCase()));
  if (sharedDirector) return `Same director · ${sharedDirector}`;
  const sharedCast = target.cast_members.find((c) => lc(source.cast_members).includes(c.toLowerCase()));
  if (sharedCast) return `Also starring ${sharedCast}`;
  if (collab.by && collab.by.profile_id !== profileId) return `Rated ${collab.by.stars}★ by ${collab.by.name}`;
  const genres = target.genres.filter((g) => lc(source.genres).includes(g.toLowerCase()));
  const tags = target.tags.filter((t) => source.tags.includes(t)).map((t) => t.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()));
  const parts = [...genres.slice(0, 2), ...tags.slice(0, 1)];
  if (parts.length) return parts.join(' · ');
  if (source.language && source.language === target.language) return `More in ${source.language}`;
  return null;
}

// ---------------------------------------------------------------------------
// Public API

export function relatedTitles(profile, titleId, limit = 18) {
  const lib = library();
  const source = lib.byId.get(titleId);
  if (!source) return [];
  const { vectors } = getModel();
  const likers = coLikes();
  const taste = tasteVector(profile.id);
  const myRatings = new Map(db.prepare('SELECT title_id, stars FROM ratings WHERE profile_id = ?').all(profile.id).map((r) => [r.title_id, r.stars]));
  const finished = finishedTitleIds(profile.id);
  const sv = vectors.get(titleId);

  const scored = [];
  for (const t of visibleTitles(profile)) {
    if (t.id === titleId) continue;
    // Same collection is shown in its own row above.
    if (source.collection && t.collection === source.collection) continue;
    if ((myRatings.get(t.id) || 3) <= 2) continue;
    const content = dot(sv, vectors.get(t.id));
    const collab = collabScore(likers, titleId, t.id);
    let score = 0.65 * content + 0.35 * collab.score + (taste ? 0.15 * dot(taste, vectors.get(t.id)) : 0);
    if (t.kind === source.kind) score += 0.08;
    if (finished.has(t.id)) score *= 0.6;
    if (score <= 0.05) continue;
    scored.push({ t, score, collab });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ t, collab }) => card(t, { reason: reasonFor(source, t, collab, profile.id) }));
}

/** Titles ordered by how well they fit this profile's taste (popular/new when there's no taste yet). */
export function topPicks(profile, limit = 20) {
  const { vectors } = getModel();
  const taste = tasteVector(profile.id);
  const rated = new Set(db.prepare('SELECT title_id FROM ratings WHERE profile_id = ?').all(profile.id).map((r) => r.title_id));
  // Anything already started belongs in Continue Watching, not in picks.
  const watched = watchedTitleIds(profile.id);
  const popularity = popularityScores();
  return visibleTitles(profile)
    .filter((t) => !rated.has(t.id) && !watched.has(t.id))
    .map((t) => ({ t, score: (taste ? dot(taste, vectors.get(t.id)) : 0) + 0.05 * (popularity.get(t.id) || 0) + t.added_at / 1e15 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ t }) => card(t));
}

/** Distinct profiles who watched it, plus a bonus for a good household average. */
function popularityScores() {
  const watchers = db.prepare(`SELECT v.title_id, COUNT(DISTINCT p.profile_id) n FROM progress p JOIN videos v ON v.id = p.video_id GROUP BY v.title_id`).all();
  const avg = householdRatings();
  const out = new Map();
  for (const w of watchers) out.set(w.title_id, w.n);
  for (const [id, r] of avg) out.set(id, (out.get(id) || 0) + (r.sum / r.n - 3) * 0.5);
  return out;
}

export function homeRows(profile) {
  const lib = visibleTitles(profile);
  const rows = [];
  const { vectors } = getModel();
  const taste = tasteVector(profile.id);

  const cont = continueWatching(profile);
  if (cont.length) rows.push({ key: 'continue', title: 'Continue Watching', items: cont });

  const list = db.prepare('SELECT title_id FROM my_list WHERE profile_id = ? ORDER BY added_at DESC').all(profile.id)
    .map((r) => library().byId.get(r.title_id)).filter((t) => t && canSee(profile, t));
  if (list.length) rows.push({ key: 'mylist', title: 'My List', items: list.map((t) => card(t)) });

  const picks = topPicks(profile);
  if (picks.length) rows.push({ key: 'picks', title: taste ? `Top Picks for ${profile.name}` : 'Start Here', items: picks });

  // "Because you watched": the most recent titles this profile watched and didn't dislike.
  const recent = db.prepare(`SELECT v.title_id, MAX(p.updated_at) at FROM progress p JOIN videos v ON v.id = p.video_id
    WHERE p.profile_id = ? GROUP BY v.title_id ORDER BY at DESC LIMIT 6`).all(profile.id);
  const myRatings = new Map(db.prepare('SELECT title_id, stars FROM ratings WHERE profile_id = ?').all(profile.id).map((r) => [r.title_id, r.stars]));
  const watched = watchedTitleIds(profile.id);
  let because = 0;
  for (const r of recent) {
    if (because >= 2) break;
    if ((myRatings.get(r.title_id) || 3) < 3) continue;
    const src = library().byId.get(r.title_id);
    if (!src) continue;
    const items = relatedTitles(profile, r.title_id, 12).filter((c) => !watched.has(c.id));
    if (items.length >= 3) {
      rows.push({ key: `because-${r.title_id}`, title: `Because you watched ${src.title}`, items });
      because++;
    }
  }

  const fresh = [...lib].sort((a, b) => b.added_at - a.added_at).slice(0, 20);
  rows.push({ key: 'new', title: 'New on HomeFlix', items: fresh.map((t) => card(t)) });

  const pop = popularityScores();
  const popular = lib.filter((t) => (pop.get(t.id) || 0) > 0).sort((a, b) => pop.get(b.id) - pop.get(a.id)).slice(0, 20);
  if (popular.length >= 3) rows.push({ key: 'popular', title: 'Popular in Your Home', items: popular.map((t) => card(t)) });

  const avg = householdRatings();
  const topRated = lib.filter((t) => avg.has(t.id) && avg.get(t.id).sum / avg.get(t.id).n >= 4)
    .sort((a, b) => avg.get(b.id).sum / avg.get(b.id).n - avg.get(a.id).sum / avg.get(a.id).n);
  if (topRated.length >= 3) rows.push({ key: 'toprated', title: 'Highest Rated at Home', items: topRated.map((t) => card(t)) });

  // Genre rows, ordered by this profile's taste for each genre.
  const genreCount = new Map();
  for (const t of lib) for (const g of t.genres) genreCount.set(g, (genreCount.get(g) || 0) + 1);
  const genres = [...genreCount].filter(([, n]) => n >= 3)
    .sort((a, b) => ((taste?.get(`g:${b[0].toLowerCase()}`) || 0) - (taste?.get(`g:${a[0].toLowerCase()}`) || 0)) || b[1] - a[1])
    .slice(0, 6);
  for (const [g] of genres) {
    const items = lib.filter((t) => t.genres.includes(g))
      .map((t) => ({ t, s: taste ? dot(taste, vectors.get(t.id)) : 0 }))
      .sort((a, b) => b.s - a.s)
      .map(({ t }) => card(t));
    rows.push({ key: `genre-${g}`, title: g, items });
  }

  // A row per language when the library has more than one.
  const langCount = new Map();
  for (const t of lib) if (t.language) langCount.set(t.language, (langCount.get(t.language) || 0) + 1);
  const langs = [...langCount].sort((a, b) => b[1] - a[1]);
  for (const [lang, n] of langs.slice(1)) {
    if (n >= 2) rows.push({ key: `lang-${lang}`, title: `${lang} Movies & Shows`, items: lib.filter((t) => t.language === lang).map((t) => card(t)) });
  }

  // Hero: the best pick that has a backdrop, else the newest title with one.
  const heroPool = [...picks, ...fresh.map((t) => card(t))];
  const hero = heroPool.find((c) => c.hasBackdrop) || heroPool[0] || null;
  if (hero) {
    const t = library().byId.get(hero.id);
    hero.description = t.description;
    hero.hasTrailer = !!t.trailer_path;
  }
  return { hero, rows };
}

export { getModel as _getModel, dot as _dot };
