import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, fmtDuration, media } from '../api.js';
import Card from '../components/Card.jsx';
import Stars from '../components/Stars.jsx';

export default function Title() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [t, setT] = useState(null);
  const [related, setRelated] = useState([]);
  const [season, setSeason] = useState(null);
  const [error, setError] = useState(null);
  const [trailer, setTrailer] = useState(false);
  const [epMenu, setEpMenu] = useState(null);
  const [titleMenu, setTitleMenu] = useState(false);

  const load = async () => {
    try {
      const data = await api.get(`/api/titles/${id}`);
      if (params.get('play') === '1') return navigate(`/watch/${data.play.videoId}`, { replace: true });
      setT(data);
      setSeason((s) => (s !== null && data.seasons?.some((x) => x.number === s) ? s : data.currentSeason ?? data.seasons?.[0]?.number ?? null));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    setT(null);
    setSeason(null);
    setRelated([]);
    window.scrollTo(0, 0);
    load();
    api.get(`/api/titles/${id}/related`).then(setRelated).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!t) return <div className="center-screen"><div className="spinner" /></div>;

  const rate = async (stars) => {
    await api.put(`/api/titles/${t.id}/rating`, { stars });
    setT({ ...t, myRating: stars, showRateRow: false });
  };
  const clearRating = async () => {
    await api.del(`/api/titles/${t.id}/rating`);
    setT({ ...t, myRating: null });
  };
  const toggleList = async () => {
    const r = t.inList ? await api.del(`/api/mylist/${t.id}`) : await api.post(`/api/mylist/${t.id}`);
    setT({ ...t, inList: r.inList });
  };
  const markWatched = async (body) => {
    setEpMenu(null);
    setTitleMenu(false);
    await api.post(`/api/titles/${t.id}/watched`, body);
    load();
  };

  const currentSeason = t.seasons?.find((s) => s.number === season);

  return (
    <div className="title-page">
      <section className="title-hero" style={{ backgroundImage: `url(${media(t.backdrop)})` }}>
        <div className="hero-shade" />
        <div className="hero-content">
          <h1>{t.title}</h1>
          <div className="meta">
            {t.year && <span>{t.year}</span>}
            {t.ageRating && <span className="age">{t.ageRating}</span>}
            {t.seasons && <span>{t.seasons.length} Season{t.seasons.length > 1 ? 's' : ''}</span>}
            {t.language && <span>{t.language}</span>}
            {t.hasCC && <span className="cc">CC</span>}
            {t.household && <span className="household">★ {t.household.avg} from {t.household.count} profile{t.household.count > 1 ? 's' : ''}</span>}
          </div>
          {t.play.progress > 0 && <div className="progress inline"><span style={{ width: `${t.play.progress * 100}%` }} /></div>}
          <div className="hero-actions">
            <button className="btn primary" onClick={() => navigate(`/watch/${t.play.videoId}`)}>▶ {t.play.label}</button>
            {t.play.canStartOver && <button className="btn secondary" onClick={() => navigate(`/watch/${t.play.videoId}?start=0`)}>↺ Start over</button>}
            {t.hasTrailer && <button className="btn secondary" onClick={() => setTrailer(true)}>Trailer</button>}
            <button className="btn round" onClick={toggleList} title={t.inList ? 'Remove from My List' : 'Add to My List'}>{t.inList ? '✓' : '+'}</button>
            <button className="btn round" onClick={() => setTitleMenu(true)} title="More">⋯</button>
          </div>
        </div>
      </section>

      <div className="title-body">
        <div className="title-main">
          {t.showRateRow && (
            <div className="rate-row">
              <span>You haven't rated this yet</span>
              <Stars value={null} onChange={rate} />
            </div>
          )}
          {t.description ? <p className="desc">{t.description}</p> : <p className="desc muted">No description yet.</p>}
          {!t.showRateRow && (
            <div className="your-rating">
              <span className="muted">Your rating</span>
              <Stars value={t.myRating} onChange={rate} size={24} />
              {t.myRating && <button className="link" onClick={clearRating}>Clear</button>}
            </div>
          )}
        </div>
        <dl className="title-facts">
          {t.cast.length > 0 && <><dt>Cast</dt><dd>{t.cast.join(', ')}</dd></>}
          {t.directors.length > 0 && <><dt>{t.kind === 'series' ? 'Created by' : 'Director'}</dt><dd>{t.directors.join(', ')}</dd></>}
          {t.genres.length > 0 && <><dt>Genres</dt><dd>{t.genres.join(', ')}</dd></>}
          {t.audio.length > 0 && <><dt>Audio</dt><dd>{t.audio.join(', ')}</dd></>}
          <dt>Subtitles</dt><dd>{t.ccLanguages.length ? t.ccLanguages.join(', ') : 'None'}</dd>
          {t.aka.length > 0 && <><dt>Also known as</dt><dd>{t.aka.join(', ')}</dd></>}
        </dl>
      </div>

      {t.seasons && (
        <section className="episodes">
          <div className="episodes-head">
            <h2>Episodes</h2>
            <select value={season ?? ''} onChange={(e) => setSeason(Number(e.target.value))}>
              {t.seasons.map((s) => <option key={s.number} value={s.number}>{s.name}</option>)}
            </select>
          </div>
          {currentSeason?.description && <p className="muted">{currentSeason.description}</p>}
          <ol className="episode-list">
            {currentSeason?.episodes.map((e) => (
              <li key={e.id} className={`episode ${t.play.videoId === e.id ? 'current' : ''}`}>
                <span className="ep-num">{e.number}</span>
                <button className="ep-thumb" onClick={() => navigate(`/watch/${e.id}`)} aria-label={`Play ${e.title}`}>
                  <img src={media(e.thumb)} alt="" loading="lazy" />
                  <span className="card-play">▶</span>
                  {e.progress > 0 && <span className="progress"><span style={{ width: `${e.progress * 100}%` }} /></span>}
                </button>
                <div className="ep-info">
                  <div className="ep-title">
                    {e.title}
                    {e.finished && <span className="tick" title="Watched">✓</span>}
                    <span className="muted small">{fmtDuration(e.duration)}</span>
                  </div>
                  {e.description && <p className="muted small">{e.description}</p>}
                </div>
                <button className="ep-menu" onClick={() => setEpMenu(e)} aria-label="Episode options">⋮</button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {t.collection && (
        <section className="collection">
          <h2>{t.collection.name} Collection</h2>
          <div className="grid">
            {t.collection.items.map((c) => (
              <div key={c.id} className={`collection-item ${c.current ? 'current' : ''}`}>
                <Card item={{ ...c, label: c.nextUp ? 'Up next in collection' : c.watched ? 'Watched ✓' : c.order ? `Part ${c.order}` : null }} />
              </div>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="related">
          <h2>More Like This</h2>
          <div className="grid">{related.map((r) => <Card key={r.id} item={r} />)}</div>
        </section>
      )}

      {trailer && (
        <div className="modal-backdrop" onClick={() => setTrailer(false)}>
          <video className="trailer" src={media(`/media/trailer/${t.id}`)} autoPlay controls onClick={(e) => e.stopPropagation()} onEnded={() => setTrailer(false)} />
        </div>
      )}

      {epMenu && (
        <div className="modal-backdrop" onClick={() => setEpMenu(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>{epMenu.title}</h3>
            <button onClick={() => navigate(`/watch/${epMenu.id}?start=0`)}>Play from the beginning</button>
            {epMenu.finished || epMenu.progress > 0
              ? <button onClick={() => markWatched({ watched: false, videoId: epMenu.id })}>Mark as unwatched</button>
              : <button onClick={() => markWatched({ watched: true, videoId: epMenu.id })}>Mark as watched</button>}
            <button onClick={() => markWatched({ watched: true, season })}>Mark all of {currentSeason?.name} as watched</button>
            <button onClick={() => markWatched({ watched: false, season })}>Mark all of {currentSeason?.name} as unwatched</button>
            <button className="muted" onClick={() => setEpMenu(null)}>Cancel</button>
          </div>
        </div>
      )}

      {titleMenu && (
        <div className="modal-backdrop" onClick={() => setTitleMenu(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>{t.title}</h3>
            <button onClick={() => markWatched({ watched: true })}>Mark {t.kind === 'series' ? 'the whole series' : 'as'} watched</button>
            <button onClick={() => markWatched({ watched: false })}>Mark {t.kind === 'series' ? 'the whole series' : 'as'} unwatched</button>
            <button onClick={async () => { await api.post(`/api/continue/${t.id}/hide`); setTitleMenu(false); }}>Remove from Continue Watching</button>
            <button className="muted" onClick={() => setTitleMenu(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
