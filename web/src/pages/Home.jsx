import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Row from '../components/Row.jsx';

export default function Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const navigate = useNavigate();

  const load = () => api.get('/api/home').then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  // An empty library may just still be scanning (first setup), or waiting for files: keep checking.
  useEffect(() => {
    if (!data || data.hero) return undefined;
    const id = setTimeout(load, data.scanning ? 1000 : 5000);
    return () => clearTimeout(id);
  }, [data]);

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!data) return <div className="center-screen"><div className="spinner" /></div>;

  const { hero, rows } = data;
  if (!hero) {
    if (data.scanning) {
      return (
        <div className="page empty-library">
          <div className="spinner" style={{ margin: '0 auto 24px' }} />
          <h1>Looking through your library…</h1>
          <p className="muted">Found {data.found.movies} movies and {data.found.series} series so far.</p>
        </div>
      );
    }
    return (
      <div className="page empty-library">
        <h1>Your library is empty</h1>
        {data.scanError && <p className="error">{data.scanError}</p>}
        <p className="muted">Add movies to the <b>Movies</b> folder or shows to the <b>Series</b> folder. They'll show up here within a few seconds.</p>
      </div>
    );
  }

  const continueAction = async (action) => {
    const item = menuFor;
    setMenuFor(null);
    if (action === 'hide') await api.post(`/api/continue/${item.id}/hide`);
    if (action === 'watched') await api.post(`/api/titles/${item.id}/watched`, { watched: true, videoId: item.videoId });
    if (action === 'info') return navigate(`/title/${item.id}`);
    load();
  };

  return (
    <div className="home">
      <section className="hero" style={{ backgroundImage: `url(${hero.backdrop})` }}>
        <div className="hero-shade" />
        <div className="hero-content">
          <h1>{hero.title}</h1>
          <div className="meta">
            {hero.year && <span>{hero.year}</span>}
            {hero.ageRating && <span className="age">{hero.ageRating}</span>}
            {hero.seasons && <span>{hero.seasons} Season{hero.seasons > 1 ? 's' : ''}</span>}
            {hero.language && <span>{hero.language}</span>}
            {hero.hasCC && <span className="cc">CC</span>}
          </div>
          {hero.description && <p className="hero-desc">{hero.description}</p>}
          <div className="hero-actions">
            <button className="btn primary" onClick={() => navigate(`/title/${hero.id}?play=1`)}>▶ Play</button>
            <button className="btn secondary" onClick={() => navigate(`/title/${hero.id}`)}>ⓘ More Info</button>
          </div>
        </div>
      </section>
      <div className="rows">
        {rows.map((r) => (
          <Row key={r.key} title={r.title} items={r.items} wide={r.key === 'continue'} onMenu={r.key === 'continue' ? setMenuFor : undefined} />
        ))}
      </div>
      {menuFor && (
        <div className="modal-backdrop" onClick={() => setMenuFor(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>{menuFor.title}</h3>
            <button onClick={() => continueAction('info')}>Episodes & info</button>
            <button onClick={() => continueAction('watched')}>Mark as watched</button>
            <button onClick={() => continueAction('hide')}>Remove from Continue Watching</button>
            <button className="muted" onClick={() => setMenuFor(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
