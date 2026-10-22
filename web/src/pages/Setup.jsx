import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';

const STEPS = ['Welcome', 'Sign-in', 'Your profile', 'Library folder'];

export default function Setup() {
  const { refresh } = useApp();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ householdName: '', username: '', password: '', password2: '', profileName: '', pin: '', libraryPath: '' });
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
      if (!form.username.trim()) return setError('Pick a username.');
      if (form.password.length < 4) return setError('The password needs at least 4 characters.');
      if (form.password !== form.password2) return setError('The two passwords are different.');
    }
    if (step === 2) {
      if (!form.profileName.trim()) return setError('Type your name.');
      if (form.pin && !/^\d{4}$/.test(form.pin)) return setError('A PIN is exactly 4 numbers, or leave it empty.');
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

  return (
    <div className="auth-screen">
      <div className="logo big">HOMEFLIX</div>
      <form className="auth-box wide" onSubmit={step === 3 ? finish : (e) => { e.preventDefault(); next(); }}>
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
            <h1>Create the household sign-in</h1>
            <p className="muted">Everyone at home uses this once per device. After that, each person picks their own profile.</p>
            <label>Username<input autoFocus value={form.username} onChange={set('username')} autoComplete="username" /></label>
            <label>Password<input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" /></label>
            <label>Type the password again<input type="password" value={form.password2} onChange={set('password2')} autoComplete="new-password" /></label>
          </>
        )}
        {step === 2 && (
          <>
            <h1>Your profile</h1>
            <p className="muted">This is the admin profile. It can add movies, manage profiles and change settings.</p>
            <label>Your name<input autoFocus value={form.profileName} onChange={set('profileName')} /></label>
            <label>4-digit PIN (optional, recommended for the admin)<input inputMode="numeric" maxLength={4} value={form.pin} onChange={set('pin')} placeholder="Leave empty for no PIN" /></label>
          </>
        )}
        {step === 3 && (
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
          <button type="submit" className="btn primary" disabled={busy}>{step === 3 ? (busy ? 'Setting up…' : 'Finish setup') : 'Next'}</button>
        </div>
      </form>
    </div>
  );
}
