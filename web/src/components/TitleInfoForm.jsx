import { useEffect, useState } from 'react';
import { api } from '../api.js';

const LIST = ['genres', 'cast', 'directors', 'tags', 'audio', 'aka'];
const GENRES = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'Horror', 'Musical', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller'];
const AGES = ['All', '7+', '13+', '16+', '18+'];

/**
 * The details form that writes info.txt. `missing` highlights the fields still empty;
 * `compact` shows just the essentials first, with the rest behind "More details".
 */
export default function TitleInfoForm({ data, missing = [], compact = false, submitLabel, onSaved }) {
  const [f, setF] = useState(null);
  const [more, setMore] = useState(!compact);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fields = { ...data.fields };
    for (const k of LIST) fields[k] = (fields[k] || []).join(', ');
    setF(fields);
  }, [data]);

  if (!f) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const need = (k) => (missing.includes(k) ? 'needs' : '');
  const tag = (k) => missing.includes(k) && <span className="missing-tag">(missing)</span>;
  const genreList = f.genres.split(',').map((s) => s.trim()).filter(Boolean);
  const toggleGenre = (g) => {
    const next = genreList.includes(g) ? genreList.filter((x) => x !== g) : [...genreList, g];
    setF({ ...f, genres: next.join(', ') });
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.put(`/api/admin/titles/${data.id}`, { fields: f });
      setBusy(false);
      onSaved?.(r);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={save}>
      <div className="form-2">
        <label>Title<input value={f.title || ''} onChange={set('title')} /></label>
        <label>Year<input inputMode="numeric" value={f.year || ''} onChange={set('year')} placeholder="e.g. 2019" /></label>
      </div>
      <label className={need('description')}><span>Description{tag('description')}</span><textarea rows={3} value={f.description || ''} onChange={set('description')} placeholder="A sentence or two about the story" /></label>
      <div className={`field ${need('genres')}`}>
        <span className="field-label">Genres{tag('genres')}</span>
        <div className="chips">
          {[...new Set([...GENRES, ...genreList])].map((g) => (
            <button type="button" key={g} className={`chip ${genreList.includes(g) ? 'on' : ''}`} onClick={() => toggleGenre(g)}>{g}</button>
          ))}
        </div>
      </div>
      <div className={`field ${need('ageRating')}`}>
        <span className="field-label">Age rating{tag('ageRating')} <small className="muted">(kids profiles only see titles rated for their age)</small></span>
        <div className="chips">
          {AGES.map((a) => <button type="button" key={a} className={`chip ${f.ageRating === a ? 'on' : ''}`} onClick={() => setF({ ...f, ageRating: a })}>{a}</button>)}
          <input className="chip-input" value={AGES.includes(f.ageRating) ? '' : f.ageRating || ''} onChange={set('ageRating')} placeholder="or type: U, PG-13…" />
        </div>
      </div>
      <label>Language<input value={f.language || ''} onChange={set('language')} placeholder="English" /></label>

      {!more && <button type="button" className="link" onClick={() => setMore(true)}>More details (cast, director, tags, collection…)</button>}
      {more && (
        <>
          <label>Cast <small>(comma separated)</small><input value={f.cast} onChange={set('cast')} /></label>
          <div className="form-2">
            <label>{data.kind === 'series' ? 'Created by' : 'Director'}<input value={f.directors} onChange={set('directors')} /></label>
            <label>Tags<input value={f.tags} onChange={set('tags')} placeholder="heist, feel-good" /></label>
          </div>
          <div className="form-2">
            <label>Audio languages<input value={f.audio} onChange={set('audio')} placeholder="Hindi, English" /></label>
            <label>Also known as<input value={f.aka} onChange={set('aka')} placeholder="Other names people search for" /></label>
          </div>
          <div className="form-2">
            <label>Collection<input value={f.collection || ''} onChange={set('collection')} placeholder="e.g. Harry Potter" /></label>
            <label>Order in collection<input inputMode="numeric" value={f.order ?? ''} onChange={set('order')} /></label>
          </div>
          {data.kind === 'movie' && (
            <div className="form-2">
              <label>Intro <small>(e.g. 00:30-01:15)</small><input value={f.intro || ''} onChange={set('intro')} /></label>
              <label>Credits <small>(e.g. last 02:00)</small><input value={f.credits || ''} onChange={set('credits')} /></label>
            </div>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : submitLabel || 'Save to info.txt'}</button>
    </form>
  );
}
