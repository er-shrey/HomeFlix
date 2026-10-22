import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import Card from '../components/Card.jsx';

const FILTER_KEYS = ['type', 'genre', 'language', 'audio', 'decade', 'cc', 'unwatched', 'mylist'];

export default function Search() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState(params.get('q') || '');
  const [data, setData] = useState(null);
  const [facets, setFacets] = useState(null);
  const [recent, setRecent] = useState([]);
  const inputRef = useRef(null);
  const reqId = useRef(0);

  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']));
  const hasFilters = FILTER_KEYS.some((k) => filters[k]);

  useEffect(() => {
    api.get('/api/search/facets').then(setFacets).catch(() => {});
    api.get('/api/search/recent').then(setRecent).catch(() => {});
    inputRef.current?.focus();
  }, []);

  // Keep the box in sync when the header's Movies/Series links change the URL.
  useEffect(() => { setQ(params.get('q') || ''); }, [params]);

  // Results update as you type (debounced a little so each key doesn't send a request).
  useEffect(() => {
    const id = ++reqId.current;
    const timer = setTimeout(() => {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('q', q.trim());
      for (const k of FILTER_KEYS) if (filters[k]) qs.set(k, filters[k]);
      api.get(`/api/search?${qs}`).then((d) => { if (id === reqId.current) setData(d); }).catch(() => {});
    }, 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, params]);

  const setFilter = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  const onType = (value) => {
    setQ(value);
    const next = new URLSearchParams(params);
    if (value) next.set('q', value); else next.delete('q');
    setParams(next, { replace: true });
  };

  const open = (item) => {
    if (q.trim()) api.post('/api/search/recent', { q: q.trim() }).catch(() => {});
    navigate(`/title/${item.id}`);
  };

  const clearRecent = async () => {
    await api.del('/api/search/recent');
    setRecent([]);
  };

  const heading = q.trim()
    ? null
    : filters.type === 'movie' ? 'Movies' : filters.type === 'series' ? 'Series' : hasFilters ? 'Browse' : 'Everything in your library';

  return (
    <div className="page search-page">
      <div className="search-box">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
        <input ref={inputRef} value={q} onChange={(e) => onType(e.target.value)} placeholder="Titles, people, genres, languages, episodes" aria-label="Search" />
        {q && <button className="icon-btn" onClick={() => onType('')} aria-label="Clear">✕</button>}
      </div>

      {facets && (
        <div className="filters">
          <select value={filters.type} onChange={(e) => setFilter('type', e.target.value)} aria-label="Type">
            <option value="">Movies & Series</option>
            <option value="movie">Movies</option>
            <option value="series">Series</option>
          </select>
          <select value={filters.genre} onChange={(e) => setFilter('genre', e.target.value)} aria-label="Genre">
            <option value="">All genres</option>
            {facets.genres.map((g) => <option key={g.value} value={g.value}>{g.value} ({g.n})</option>)}
          </select>
          <select value={filters.language} onChange={(e) => setFilter('language', e.target.value)} aria-label="Language">
            <option value="">All languages</option>
            {facets.languages.map((g) => <option key={g.value} value={g.value}>{g.value} ({g.n})</option>)}
          </select>
          {facets.audio.length > 0 && (
            <select value={filters.audio} onChange={(e) => setFilter('audio', e.target.value)} aria-label="Audio language">
              <option value="">Any audio</option>
              {facets.audio.map((g) => <option key={g.value} value={g.value}>Audio: {g.value}</option>)}
            </select>
          )}
          <select value={filters.decade} onChange={(e) => setFilter('decade', e.target.value)} aria-label="Decade">
            <option value="">Any year</option>
            {facets.decades.map((g) => <option key={g.value} value={g.value}>{g.value}</option>)}
          </select>
          {[['cc', 'Has CC'], ['unwatched', 'Unwatched'], ['mylist', 'My List']].map(([k, label]) => (
            <button key={k} className={`chip ${filters[k] ? 'on' : ''}`} onClick={() => setFilter(k, filters[k] ? '' : '1')}>{label}</button>
          ))}
          {hasFilters && <button className="link" onClick={() => setParams(q ? { q } : {}, { replace: true })}>Clear filters</button>}
        </div>
      )}

      {!q && !hasFilters && recent.length > 0 && (
        <div className="recent">
          <span className="muted">Recent searches:</span>
          {recent.map((r) => <button key={r} className="chip" onClick={() => onType(r)}>{r}</button>)}
          <button className="link" onClick={clearRecent}>Clear</button>
        </div>
      )}

      {heading && <h2 className="row-title">{heading}</h2>}

      {data && data.results.length > 0 && (
        <div className="grid">{data.results.map((r) => <div key={r.id} onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); open(r); }}><Card item={r} /></div>)}</div>
      )}

      {data && !data.results.length && (
        <div className="no-results">
          <p>Nothing found for “{q}”{hasFilters ? ' with these filters' : ''}.</p>
          {data.didYouMean && <p>Did you mean <button className="link big" onClick={() => onType(data.didYouMean)}>{data.didYouMean}</button>?</p>}
          {data.similar?.length > 0 && (
            <>
              <h2 className="row-title">You might like instead</h2>
              <div className="grid">{data.similar.map((r) => <Card key={r.id} item={r} />)}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
