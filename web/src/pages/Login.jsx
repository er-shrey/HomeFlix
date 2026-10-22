import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';

export default function Login() {
  const { refresh, status } = useApp();
  const [password, setPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [next, setNext] = useState({ a: '', b: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/login', { password });
      await refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    if (next.a !== next.b) return setError('The two passwords are different.');
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/reset-password', { password: next.a });
      await refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (resetting) {
    return (
      <div className="auth-screen">
        <div className="logo big">HOMEFLIX</div>
        {status.onHost ? (
          <form className="auth-box" onSubmit={reset}>
            <h1>Reset Admin password</h1>
            <p className="muted small">You're on the computer HomeFlix runs on, so you can choose a new password here. Other devices will need to sign in again.</p>
            <label>New password<input type="password" autoFocus value={next.a} onChange={(e) => setNext({ ...next, a: e.target.value })} autoComplete="new-password" /></label>
            <label>Type it again<input type="password" value={next.b} onChange={(e) => setNext({ ...next, b: e.target.value })} autoComplete="new-password" /></label>
            {error && <p className="error">{error}</p>}
            <button className="btn primary block" disabled={busy}>{busy ? 'Saving…' : 'Set new password'}</button>
            <button type="button" className="link" onClick={() => { setResetting(false); setError(null); }}>Back to sign in</button>
          </form>
        ) : (
          <div className="auth-box">
            <h1>Forgot the password?</h1>
            <p className="muted">For safety, the Admin password can only be reset on the computer HomeFlix is installed on. Open HomeFlix there and choose <b>Forgot password?</b>.</p>
            <button className="btn ghost" onClick={() => setResetting(false)}>Back to sign in</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="logo big">HOMEFLIX</div>
      <form className="auth-box" onSubmit={submit}>
        <h1>Admin</h1>
        {status.householdName !== 'HomeFlix' && <p className="muted">{status.householdName}</p>}
        <label>Password<input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="link" onClick={() => { setResetting(true); setError(null); }}>Forgot password?</button>
      </form>
    </div>
  );
}
