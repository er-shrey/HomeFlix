import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import ProfileForm from '../components/ProfileForm.jsx';

function PasswordCard() {
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    setMsg(null);
    setError(null);
    if (f.next !== f.again) return setError('The two new passwords are different.');
    try {
      await api.put('/api/account/password', { current: f.current, next: f.next });
      setF({ current: '', next: '', again: '' });
      setMsg('Password changed. Other devices need to sign in again with the new one.');
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <section className="card-box">
      <h2>Admin password</h2>
      <form className="form password-form" onSubmit={save}>
        <label>Current password<input type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoComplete="current-password" /></label>
        <div className="form-2">
          <label>New password<input type="password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} autoComplete="new-password" /></label>
          <label>Type it again<input type="password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} autoComplete="new-password" /></label>
        </div>
        {error && <p className="error">{error}</p>}
        {msg && <p className="ok">{msg}</p>}
        <div><button className="btn primary small" disabled={!f.current || !f.next}>Change password</button></div>
      </form>
    </section>
  );
}

export default function Admin() {
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
      <h1>Admin settings</h1>

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
              <span className="grow"><b>{p.name}</b> <span className="muted small">{p.isKid ? `Kids, up to ${p.maxAge ? `${p.maxAge}+` : 'all ages'}` : ''}{p.isKid && p.hasPin ? ' · ' : ''}{p.hasPin ? 'PIN' : ''}</span></span>
              <button className="btn secondary small" onClick={() => setEditing(p)}>Edit</button>
              <button className="btn ghost small" onClick={() => deleteProfile(p)}>Remove</button>
            </li>
          ))}
        </ul>
        {!profiles.length && <p className="muted">No profiles yet. Add one here or with the + on the "Who's watching?" screen.</p>}
        {editing
          ? <div className="card-box inset"><h3>{editing.id ? `Edit ${editing.name}` : 'Add a profile'}</h3><ProfileForm profile={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} /></div>
          : <button className="btn primary small" onClick={() => setEditing({})}>+ Add profile</button>}
      </section>

      <PasswordCard />
    </div>
  );
}
