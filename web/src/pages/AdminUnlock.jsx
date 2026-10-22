import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../App.jsx';

/** Asked every time Admin settings are opened, so a signed-in device doesn't let anyone in. */
export default function AdminUnlock() {
  const { refresh } = useApp();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/admin/unlock', { password });
      await refresh();
    } catch (err) {
      setError(err.message);
      setPassword('');
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="logo big">HOMEFLIX</div>
      <form className="auth-box" onSubmit={submit}>
        <h1>⚙ Admin settings</h1>
        <p className="muted">Enter the Admin password to manage the library and profiles.</p>
        <label>Admin password<input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy || !password}>{busy ? 'Checking…' : 'Open Admin settings'}</button>
        <button type="button" className="link" onClick={() => navigate('/')}>Cancel, back to profiles</button>
      </form>
    </div>
  );
}
