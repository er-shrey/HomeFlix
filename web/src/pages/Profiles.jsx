import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { setToken } from '../connection.js';
import { useApp } from '../App.jsx';
import Avatar from '../components/Avatar.jsx';
import PinPad from '../components/PinPad.jsx';
import ProfileForm from '../components/ProfileForm.jsx';
import ServerBadge from '../components/ServerBadge.jsx';

/** "Who's watching?": the main screen after the Admin signs in on a device. */
export default function Profiles() {
  const { refresh, status } = useApp();
  const [profiles, setProfiles] = useState(null);
  const [pinFor, setPinFor] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(() => api.get('/api/profiles').then(setProfiles).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  // Back on this screen (even with the browser's Back button), Admin settings lock again.
  useEffect(() => {
    if (status.adminUnlocked) api.post('/api/admin/lock').then(refresh);
  }, [status.adminUnlocked, refresh]);

  const choose = useCallback(async (p, pin) => {
    try {
      await api.post(`/api/profiles/${p.id}/select`, { pin });
      setPinFor(null);
      await refresh();
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  }, [refresh, navigate]);

  const onPin = useCallback((pin) => choose(pinFor, pin), [choose, pinFor]);
  const cancelPin = useCallback(() => { setPinFor(null); setError(null); }, []);

  const signOut = async () => {
    await api.post('/api/logout').catch(() => {});
    setToken(null);
    await refresh();
  };

  return (
    <div className="profiles-screen">
      <header className="picker-top">
        <span className="logo">HOMEFLIX</span>
        <div className="picker-actions">
          <button className="btn ghost small" onClick={() => navigate('/admin')}>⚙ Admin settings</button>
          <button className="link" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <h1>{profiles?.length ? "Who's watching?" : 'Add your first profile'}</h1>
      {status.householdName !== 'HomeFlix' && <p className="muted household-name">{status.householdName}</p>}
      <div className="profile-grid">
        {profiles?.map((p) => (
          <button key={p.id} className="profile-tile" onClick={() => (p.hasPin ? (setError(null), setPinFor(p)) : choose(p))}>
            <Avatar profile={p} size={120} />
            <span>{p.name}</span>
            <small>{p.hasPin ? '🔒' : ''}{p.isKid ? ' Kids' : ''}</small>
          </button>
        ))}
        {profiles && (
          <button className="profile-tile add-tile" onClick={() => setAdding(true)} aria-label="Add profile">
            <span className="add-circle">+</span>
            <span>Add profile</span>
            <small />
          </button>
        )}
      </div>
      {error && !pinFor && <p className="error">{error}</p>}
      <ServerBadge />

      {pinFor && <PinPad title={`Enter ${pinFor.name}'s PIN`} error={error} onSubmit={onPin} onCancel={cancelPin} />}
      {adding && (
        <div className="modal-backdrop" onClick={() => setAdding(false)}>
          <div className="sheet wide-sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Add a profile</h2>
            <ProfileForm onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />
          </div>
        </div>
      )}
    </div>
  );
}
