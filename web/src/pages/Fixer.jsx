import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import FramePicker from '../components/FramePicker.jsx';
import TitleInfoForm from '../components/TitleInfoForm.jsx';

const FILTERS = [
  ['all', 'Everything'],
  ['poster', 'No poster'],
  ['info', 'No info file'],
  ['details', 'Missing details'],
  ['mismatch', 'CC mismatch'],
];
const DETAIL_KEYS = ['description', 'genres', 'ageRating'];

const matches = (item, filter) => {
  if (filter === 'all') return true;
  if (filter === 'mismatch') return !!item.mismatch;
  if (filter === 'details') return item.missing.some((m) => DETAIL_KEYS.includes(m));
  return item.missing.includes(filter);
};

export default function Fixer() {
  const { id } = useParams();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);

  const loadList = useCallback(() => api.get('/api/admin/fix').then(setList).catch((e) => setError(e.message)), []);
  useEffect(() => { loadList(); }, [loadList, id]);

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!list) return <div className="center-screen"><div className="spinner" /></div>;
  return id ? <FixTitle id={Number(id)} list={list} onChanged={loadList} /> : <FixList list={list} />;
}

function FixList({ list }) {
  const [filter, setFilter] = useState('all');
  const items = list.items.filter((i) => matches(i, filter));
  return (
    <div className="page fixer">
      <p><Link to="/admin">← Admin</Link></p>
      <h1>Library Fixer</h1>
      {list.items.length === 0 ? (
        <div className="card-box all-good">
          <h2>✓ Everything is complete</h2>
          <p className="muted">All {list.totalTitles} titles have a poster and an info file with the main details.</p>
        </div>
      ) : (
        <>
          <p className="muted">{list.items.length} of {list.totalTitles} titles are missing something. Pick one to fix it. Posters can be taken from any moment in the video, and missing info files are created for you.</p>
          <div className="chips filter-chips">
            {FILTERS.map(([k, label]) => {
              const n = list.items.filter((i) => matches(i, k)).length;
              if (k !== 'all' && !n) return null;
              return <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{label} ({n})</button>;
            })}
          </div>
          <ul className="fix-list">
            {items.map((i) => (
              <li key={i.id}>
                <Link to={`/admin/fix/${i.id}`} className="fix-row">
                  <img src={i.poster} alt="" loading="lazy" />
                  <div className="fix-row-main">
                    <strong>{i.title}</strong>
                    <span className="muted small">{i.kind === 'series' ? 'Series' : 'Movie'} · {i.folder}</span>
                    <div className="issue-chips">
                      {i.missing.map((m) => <span key={m} className="issue-chip">{m === 'info' ? 'No info file' : `No ${list.labels[m]}`}</span>)}
                      {i.mismatch && <span className="issue-chip warn">CC mismatch</span>}
                    </div>
                  </div>
                  <span className="fix-go">Fix ›</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function StatusBadge({ ok, optional }) {
  if (ok) return <span className="status ok">✓ Done</span>;
  return <span className={`status ${optional ? 'optional' : 'missing'}`}>{optional ? 'Optional' : 'Missing'}</span>;
}

function FixTitle({ id, list, onChanged }) {
  const navigate = useNavigate();
  const [t, setT] = useState(null);
  const [error, setError] = useState(null);
  const [picking, setPicking] = useState(null); // 'poster' | 'backdrop'
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => api.get(`/api/admin/titles/${id}`).then(setT).catch((e) => setError(e.message)), [id]);
  useEffect(() => {
    setT(null);
    setPicking(null);
    setEditing(false);
    setNotice(null);
    load();
    window.scrollTo(0, 0);
  }, [load]);

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!t) return <div className="center-screen"><div className="spinner" /></div>;

  const after = async (message) => {
    setNotice(message);
    setPicking(null);
    setEditing(false);
    await Promise.all([load(), onChanged()]);
  };

  const saveArt = (kind) => async (blob) => {
    const r = await api.putFile(`/api/admin/titles/${id}/artwork/${kind}`, blob);
    await after(`Saved ${r.file} in the folder.${r.movedOld ? ` The old image was kept as ${r.movedOld}.` : ''}`);
  };

  const hasPoster = !t.missing.includes('poster');
  const hasBackdrop = !t.optional.includes('backdrop');
  const hasInfo = !t.missing.includes('info');
  const missingDetails = t.missing.filter((m) => DETAIL_KEYS.includes(m));
  const detailsOk = hasInfo && !missingDetails.length && !t.mismatch;
  const allDone = !t.missing.length && !t.mismatch;
  const others = list.items.filter((i) => i.id !== id);
  const next = others[0];
  const fileName = t.writeTarget.split(/[\\/]/).pop();

  return (
    <div className="page fixer narrow-wide">
      <p><Link to="/admin/fix">← All issues ({list.items.length})</Link></p>
      <div className="fix-head">
        <img src={t.posterUrl} alt="" />
        <div>
          <h1>{t.fields.title}</h1>
          <p className="muted small">{t.kind === 'series' ? 'Series' : 'Movie'} · <code>{t.relFolder}</code></p>
          <div className="issue-chips">
            <span className={`issue-chip ${hasInfo ? 'ok' : ''}`}>{hasInfo ? '✓' : '✗'} Info file</span>
            <span className={`issue-chip ${hasPoster ? 'ok' : ''}`}>{hasPoster ? '✓' : '✗'} Poster</span>
            <span className={`issue-chip ${detailsOk ? 'ok' : ''}`}>{detailsOk ? '✓' : '✗'} Details</span>
            <span className={`issue-chip ${hasBackdrop ? 'ok' : 'optional'}`}>{hasBackdrop ? '✓' : '○'} Banner</span>
          </div>
        </div>
      </div>

      {notice && <p className="notice">✓ {notice}</p>}
      {allDone && (
        <div className="card-box all-good">
          <h2>✓ {t.fields.title} is complete</h2>
          <div className="hero-actions">
            {next ? <button className="btn primary" onClick={() => navigate(`/admin/fix/${next.id}`)}>Next: {next.title} ›</button>
              : <span className="muted">That was the last one. Your whole library is complete.</span>}
            <Link className="btn ghost" to={`/title/${t.id}`}>See how it looks</Link>
          </div>
        </div>
      )}

      <section className="card-box fix-section">
        <div className="fix-section-head">
          <h2>Poster</h2>
          <StatusBadge ok={hasPoster} />
        </div>
        {picking === 'poster' ? (
          <FramePicker videos={t.videos} kind="poster" canSuggest={t.canSuggestFrames} onSave={saveArt('poster')} onCancel={() => setPicking(null)} />
        ) : (
          <div className="art-row">
            <img className="art-poster" src={t.posterUrl} alt="" />
            <div>
              <p className="muted">{hasPoster
                ? <>Using <code>{t.poster}</code> from the folder.</>
                : 'No poster file yet, so HomeFlix is showing an automatic frame. Choose a moment that represents it better.'}</p>
              <button className="btn primary small" onClick={() => setPicking('poster')}>{hasPoster ? 'Change poster' : 'Choose a frame for the poster'}</button>
            </div>
          </div>
        )}
      </section>

      <section className="card-box fix-section">
        <div className="fix-section-head">
          <h2>Details <span className="muted small">({fileName})</span></h2>
          <StatusBadge ok={detailsOk} />
        </div>
        {!hasInfo && <p className="muted">There's no info file yet. Fill this in and HomeFlix will create <code>{fileName}</code> in {t.kind === 'series' ? 'the show\'s folder' : 'the movie\'s folder'}. The title and year were guessed from the folder name.</p>}
        {hasInfo && missingDetails.length > 0 && <p className="muted">Still missing: {missingDetails.map((m) => ({ description: 'description', genres: 'genres', ageRating: 'age rating' })[m]).join(', ')}.</p>}
        {t.mismatch && <p className="warn small">The {t.mismatch}. Saving updates the Subtitles line to match the files that are really there.</p>}
        {detailsOk && !editing ? (
          <div>
            <p className="muted">{t.fields.description}</p>
            <button className="btn ghost small" onClick={() => setEditing(true)}>Edit details</button>
          </div>
        ) : (
          <TitleInfoForm
            data={t}
            missing={t.missing}
            compact
            submitLabel={hasInfo ? `Save to ${fileName}` : `Create ${fileName}`}
            onSaved={(r) => after(r.created ? `Created ${fileName} in the folder.` : `Saved ${fileName}.`)}
          />
        )}
      </section>

      <section className="card-box fix-section">
        <div className="fix-section-head">
          <h2>Banner image</h2>
          <StatusBadge ok={hasBackdrop} optional />
        </div>
        {picking === 'backdrop' ? (
          <FramePicker videos={t.videos} kind="backdrop" canSuggest={t.canSuggestFrames} onSave={saveArt('backdrop')} onCancel={() => setPicking(null)} />
        ) : (
          <div className="art-row">
            <img className="art-backdrop" src={t.backdropUrl} alt="" />
            <div>
              <p className="muted">The wide picture at the top of the title page and the home screen.{hasBackdrop ? <> Using <code>{t.backdrop}</code>.</> : ' Optional: an automatic frame is used until you pick one.'}</p>
              <button className="btn secondary small" onClick={() => setPicking('backdrop')}>{hasBackdrop ? 'Change banner' : 'Choose a frame for the banner'}</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
