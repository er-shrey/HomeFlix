import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import Avatar, { AVATAR_COLORS } from '../components/Avatar.jsx';

function ProfileEditor({ profile, onSaved, onCancel }) {
  const isNew = !profile.id;
  const [f, setF] = useState({ name: profile.name || '', avatar: profile.avatar || 'blue', isKid: !!profile.isKid, maxAge: profile.maxAge ?? 12, pin: '' });
  const [error, setError] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const body = { name: f.name, avatar: f.avatar, isKid: f.isKid, maxAge: f.maxAge };
      if (f.pin === 'remove') body.pin = '';
      else if (f.pin) body.pin = f.pin;
      if (isNew) await api.post('/api/profiles', body); else await api.put(`/api/profiles/${profile.id}`, body);
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <form className="form card-box" onSubmit={save}>
      <h3>{isNew ? 'Add a profile' : `Edit ${profile.name}`}</h3>
      <label>Name<input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <div className="swatches">
        {Object.entries(AVATAR_COLORS).map(([k, c]) => (
          <button type="button" key={k} className={`swatch ${f.avatar === k ? 'on' : ''}`} style={{ background: c }} onClick={() => setF({ ...f, avatar: k })} aria-label={k} />
        ))}
      </div>
      {!profile.isAdmin && (
        <>
          <label className="check"><input type="checkbox" checked={f.isKid} onChange={(e) => setF({ ...f, isKid: e.target.checked })} /> Kids profile (only shows titles rated for their age)</label>
          {f.isKid && (
            <label>Maximum age rating
              <select value={f.maxAge} onChange={(e) => setF({ ...f, maxAge: Number(e.target.value) })}>
                <option value={0}>All ages only (U / G)</option>
                <option value={7}>7+</option>
                <option value={12}>12+</option>
                <option value={13}>13+</option>
                <option value={16}>16+</option>
              </select>
            </label>
          )}
        </>
      )}
      <label>PIN {profile.hasPin ? '(has one)' : '(optional)'}<input inputMode="numeric" maxLength={4} value={f.pin === 'remove' ? '' : f.pin} onChange={(e) => setF({ ...f, pin: e.target.value })} placeholder="4 digits" /></label>
      {profile.hasPin && <label className="check"><input type="checkbox" checked={f.pin === 'remove'} onChange={(e) => setF({ ...f, pin: e.target.checked ? 'remove' : '' })} /> Remove PIN</label>}
      {error && <p className="error">{error}</p>}
      <div className="auth-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary">Save</button>
      </div>
    </form>
  );
}

export default function Admin() {
  const { refresh } = useApp();
  const [o, setO] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [editing, setEditing] = useState(null);
  const [libPath, setLibPath] = useState('');
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const data = await api.get('/api/admin/overview');
      setO(data);
      setLibPath((p) => p || data.libraryPath || '');
      setProfiles(await api.get('/api/profiles'));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { load(); }, []);

  // While a scan runs, refresh every second so the counts move.
  useEffect(() => {
    if (!o?.scan.running) return undefined;
    const id = setTimeout(load, 1000);
    return () => clearTimeout(id);
  }, [o]);

  useEffect(() => {
    if (o && window.location.hash === '#profiles') document.getElementById('profiles')?.scrollIntoView();
  }, [o]);

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!o) return <div className="center-screen"><div className="spinner" /></div>;

  const scan = async () => {
    await api.post('/api/admin/scan');
    setTimeout(load, 300);
  };
  const changeLibrary = async (e) => {
    e.preventDefault();
    try {
      await api.put('/api/admin/library', { path: libPath });
      setTimeout(load, 500);
    } catch (err) {
      alert(err.message);
    }
  };
  const removeMissing = async (t) => {
    if (!window.confirm(`Permanently remove "${t.title}"? Everyone's progress and ratings for it are deleted.`)) return;
    await api.del(`/api/admin/titles/${t.id}`);
    load();
  };
  const deleteProfile = async (p) => {
    if (!window.confirm(`Delete ${p.name}'s profile, with their history, ratings and My List?`)) return;
    await api.del(`/api/profiles/${p.id}`);
    load();
  };

  const h = o.health;
  const issues = h.needsInfo.length + h.mismatches.length + h.needsConversion.length + h.missingTitles.length + h.imageSubs.length;

  return (
    <div className="page admin">
      <h1>Admin</h1>

      <section className="admin-grid">
        <div className="card-box">
          <h2>Watch on other devices</h2>
          <p className="muted">On any phone, tablet, laptop or smart-TV browser on the same Wi-Fi, open:</p>
          {o.addresses.length ? o.addresses.map((a) => <div key={a} className="address">{a}</div>) : <p className="error">This computer isn't connected to a network.</p>}
          {o.qr && <div className="qr" dangerouslySetInnerHTML={{ __html: o.qr }} />}
          <p className="muted small">Or scan this code with a phone camera.</p>
        </div>

        <div className="card-box">
          <h2>Library</h2>
          <div className="stats">
            <div><strong>{o.counts.movies}</strong><span>Movies</span></div>
            <div><strong>{o.counts.series}</strong><span>Series</span></div>
            <div><strong>{o.counts.episodes}</strong><span>Episodes</span></div>
            <div><strong>{o.counts.profiles}</strong><span>Profiles</span></div>
          </div>
          <form onSubmit={changeLibrary} className="inline-form">
            <input value={libPath} onChange={(e) => setLibPath(e.target.value)} aria-label="Library folder" />
            {libPath !== o.libraryPath && <button className="btn secondary small">Use this folder</button>}
          </form>
          <div className="scan-line">
            <button className="btn primary small" onClick={scan} disabled={o.scan.running}>{o.scan.running ? 'Scanning…' : 'Scan now'}</button>
            <span className="muted small">
              {o.scan.running
                ? `Found ${o.scan.counts.movies} movies, ${o.scan.counts.series} series…`
                : o.scan.finishedAt ? `Last scan ${new Date(o.scan.finishedAt).toLocaleTimeString()} (${o.scan.reason}), took ${(o.scan.lastDurationMs / 1000).toFixed(1)}s` : 'Not scanned yet'}
            </span>
          </div>
          {o.scan.error && <p className="error">{o.scan.error}</p>}
          <p className="muted small">New files are picked up automatically within a few seconds, and everything is re-checked every 30 minutes.</p>
          <p className="small"><a href="/api/admin/info-template" download>Download a blank info.txt template</a></p>
          {!o.tools.ffmpeg && <p className="warn small">ffmpeg isn't installed, so posters for titles without a poster file use plain placeholders.</p>}
        </div>
      </section>

      <section className="card-box">
        <h2>Needs attention {issues > 0 && <span className="count">{issues}</span>}</h2>
        {!issues && <p className="muted">Everything looks good.</p>}
        {(h.needsInfo.length > 0 || h.mismatches.length > 0) && (
          <div className="fixer-callout">
            <span><b>{new Set([...h.needsInfo, ...h.mismatches].map((x) => x.id)).size} titles</b> are missing a poster, info file or details.</span>
            <Link className="btn primary small" to="/admin/fix">Open Library Fixer</Link>
          </div>
        )}
        {h.needsInfo.length > 0 && (
          <>
            <h3>Missing details</h3>
            <ul className="issue-list">
              {h.needsInfo.map((t) => (
                <li key={t.id}>
                  <span><b>{t.title}</b> <span className="muted">missing {t.missing.join(', ')}</span></span>
                  <Link className="btn secondary small" to={`/admin/fix/${t.id}`}>Fix</Link>
                </li>
              ))}
            </ul>
          </>
        )}
        {h.mismatches.length > 0 && (
          <>
            <h3>Subtitle mismatches</h3>
            <ul className="issue-list">
              {h.mismatches.map((m) => <li key={m.id}><span><b>{m.title}</b>: <span className="muted">{m.message}</span></span><Link className="btn secondary small" to={`/admin/fix/${m.id}`}>Fix</Link></li>)}
            </ul>
          </>
        )}
        {h.needsConversion.length > 0 && (
          <>
            <h3>May not play in some browsers</h3>
            <p className="muted small">These files aren't MP4. Chrome usually plays them; Safari and TVs may not. Converting to MP4 will be added in a later version.</p>
            <ul className="issue-list">{h.needsConversion.map((v) => <li key={v.file}><span><b>{v.title}</b> <span className="muted">{v.file}</span></span></li>)}</ul>
          </>
        )}
        {h.imageSubs.length > 0 && (
          <>
            <h3>Unsupported subtitles</h3>
            <ul className="issue-list">{h.imageSubs.map((s, i) => <li key={i}><span><b>{s.title}</b> <span className="muted">{s.label} is image-based and can't be shown</span></span></li>)}</ul>
          </>
        )}
        {h.missingTitles.length > 0 && (
          <>
            <h3>Files not found</h3>
            <p className="muted small">Hidden from everyone until the files come back (for example, when a USB drive is plugged in again). History and ratings are kept.</p>
            <ul className="issue-list">
              {h.missingTitles.map((t) => (
                <li key={t.id}><span><b>{t.title}</b> <span className="muted">{t.folder}</span></span><button className="btn ghost small" onClick={() => removeMissing(t)}>Remove permanently</button></li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card-box" id="profiles">
        <h2>Profiles</h2>
        <ul className="profile-admin">
          {profiles.map((p) => (
            <li key={p.id}>
              <Avatar profile={p} size={40} />
              <span className="grow"><b>{p.name}</b> <span className="muted small">{p.isAdmin ? 'Admin' : ''}{p.isKid ? `Kids, up to ${p.maxAge || 'all ages'}${p.maxAge ? '+' : ''}` : ''}{p.hasPin ? ' · PIN' : ''}</span></span>
              <button className="btn secondary small" onClick={() => setEditing(p)}>Edit</button>
              {!p.isAdmin && <button className="btn ghost small" onClick={() => deleteProfile(p)}>Delete</button>}
            </li>
          ))}
        </ul>
        {editing
          ? <ProfileEditor profile={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); refresh(); }} />
          : <button className="btn primary small" onClick={() => setEditing({})}>+ Add profile</button>}
      </section>
    </div>
  );
}
