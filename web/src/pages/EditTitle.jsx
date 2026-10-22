import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';

const LIST = ['genres', 'cast', 'directors', 'tags', 'audio', 'aka'];

export default function EditTitle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [f, setF] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/api/admin/titles/${id}`).then((d) => {
      setData(d);
      const fields = { ...d.fields };
      for (const k of LIST) fields[k] = (fields[k] || []).join(', ');
      setF(fields);
    }).catch((e) => setError(e.message));
  }, [id]);

  if (error && !f) return <div className="page"><p className="error">{error}</p></div>;
  if (!f) return <div className="center-screen"><div className="spinner" /></div>;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put(`/api/admin/titles/${id}`, { fields: f });
      setTimeout(() => navigate('/admin'), 600);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <p><Link to="/admin">← Admin</Link></p>
      <h1>Edit {data.kind === 'series' ? 'series' : 'movie'}</h1>
      <p className="muted small">Saving writes these details to <code>{data.writeTarget}</code>, so the folder always has everything.{data.infoPath?.endsWith('.nfo') && ' Your .nfo file is left as it is; info.txt takes priority from now on.'}</p>
      <form className="form" onSubmit={save}>
        <div className="form-2">
          <label>Title<input value={f.title || ''} onChange={set('title')} /></label>
          <label>Year<input inputMode="numeric" value={f.year || ''} onChange={set('year')} /></label>
        </div>
        <label>Description<textarea rows={4} value={f.description || ''} onChange={set('description')} /></label>
        <div className="form-2">
          <label>Genres <small>(comma separated)</small><input value={f.genres} onChange={set('genres')} placeholder="Drama, Comedy" /></label>
          <label>Age rating<input value={f.ageRating || ''} onChange={set('ageRating')} placeholder="U, 13+, 16+, 18+" /></label>
        </div>
        <label>Cast<input value={f.cast} onChange={set('cast')} /></label>
        <div className="form-2">
          <label>{data.kind === 'series' ? 'Created by' : 'Director'}<input value={f.directors} onChange={set('directors')} /></label>
          <label>Tags<input value={f.tags} onChange={set('tags')} placeholder="heist, feel-good" /></label>
        </div>
        <div className="form-2">
          <label>Language<input value={f.language || ''} onChange={set('language')} placeholder="English" /></label>
          <label>Audio languages<input value={f.audio} onChange={set('audio')} placeholder="Hindi, English" /></label>
        </div>
        <label>Also known as<input value={f.aka} onChange={set('aka')} placeholder="Other titles people might search for" /></label>
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
        <p className="muted small">Posters, trailers and subtitles are files: put <code>poster.jpg</code>, <code>trailer.mp4</code> or <code>Movie Name.en.srt</code> in the folder. The <b>Subtitles</b> line is filled in from the files that are really there.</p>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save to info.txt'}</button>
      </form>
    </div>
  );
}
