import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';

const STEPS = ['Welcome', 'Admin password', 'Library folder'];

export default function Setup() {
  const { refresh, status } = useApp();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ householdName: '', password: '', password2: '', libraryPath: '' });
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/setup/suggest').then((s) => {
      setSuggestions(s);
      if (s[0]) setForm((f) => ({ ...f, libraryPath: f.libraryPath || s[0] }));
    }).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const next = () => {
    setError(null);
    if (step === 1) {
      if (form.password.length < 4) return setError('The password needs at least 4 characters.');
      if (form.password !== form.password2) return setError('The two passwords are different.');
    }
    setStep(step + 1);
  };

  const finish = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/setup', form);
      await refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (!status.onHost) {
    return (
      <div className="auth-screen">
        <div className="logo big">HOMEFLIX</div>
        <div className="auth-box">
          <h1>Almost ready</h1>
          <p className="muted">HomeFlix hasn't been set up yet. Finish the setup on the computer it's installed on, then come back here and sign in.</p>
          <button className="btn ghost" onClick={refresh}>Check again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="logo big">HOMEFLIX</div>
      <form className="auth-box wide" onSubmit={step === 2 ? finish : (e) => { e.preventDefault(); next(); }}>
        <ol className="steps">{STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>{s}</li>)}</ol>

        {step === 0 && (
          <>
            <h1>Welcome to HomeFlix</h1>
            <p className="muted">Your own streaming service for the movies and shows on this computer. Everyone at home can watch from their phone, laptop or TV browser over your Wi-Fi.</p>
            <p className="muted">Setup takes about a minute.</p>
            <label>Name your HomeFlix (optional)<input value={form.householdName} onChange={set('householdName')} placeholder="e.g. The Sharma Family" /></label>
          </>
        )}
        {step === 1 && (
          <>
            <h1>Create the Admin password</h1>
            <p className="muted">HomeFlix has one sign-in: <b>Admin</b>. Sign in once on each phone, laptop or TV; after that it opens straight to "Who's watching?", where everyone picks their profile.</p>
            <p className="muted small">The Admin password also opens Admin settings (library, profiles). Keep it to yourself.</p>
            <label>Password<input type="password" autoFocus value={form.password} onChange={set('password')} autoComplete="new-password" /></label>
            <label>Type the password again<input type="password" value={form.password2} onChange={set('password2')} autoComplete="new-password" /></label>
          </>
        )}
        {step === 2 && (
          <>
            <h1>Where are your movies?</h1>
            <p className="muted">Choose the folder that has a <b>Movies</b> folder and/or a <b>Series</b> folder inside it.</p>
            {suggestions.length > 0 && (
              <div className="suggestions">
                {suggestions.map((s) => (
                  <button type="button" key={s} className={`chip ${form.libraryPath === s ? 'on' : ''}`} onClick={() => setForm({ ...form, libraryPath: s })}>{s}</button>
                ))}
              </div>
            )}
            <label>Folder<input value={form.libraryPath} onChange={set('libraryPath')} placeholder="/Users/you/Movies" /></label>
            <pre className="folder-example">{`Your folder/
  Movies/
    Inception (2010)/
      Inception (2010).mp4
      info.txt   poster.jpg
  Series/
    Show Name/
      Season 1/
        S01E01 - Pilot.mp4`}</pre>
          </>
        )}

        {error && <p className="error">{error}</p>}
        <div className="auth-actions">
          {step > 0 && <button type="button" className="btn ghost" onClick={() => { setError(null); setStep(step - 1); }}>Back</button>}
          <button type="submit" className="btn primary" disabled={busy}>{step === 2 ? (busy ? 'Setting up…' : 'Finish setup') : 'Next'}</button>
        </div>
      </form>
    </div>
  );
}
