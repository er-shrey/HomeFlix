import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';

export default function Login() {
  const { refresh, status } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/login', { username, password });
      await refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="logo big">HOMEFLIX</div>
      <form className="auth-box" onSubmit={submit}>
        <h1>Sign in</h1>
        {status.householdName !== 'HomeFlix' && <p className="muted">{status.householdName}</p>}
        <label>Username<input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted small">Forgot the password? Ask whoever set up HomeFlix on the main computer.</p>
      </form>
    </div>
  );
}
