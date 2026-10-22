import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import Avatar from '../components/Avatar.jsx';
import PinPad from '../components/PinPad.jsx';

export default function Profiles() {
  const { refresh, profile: current } = useApp();
  const [profiles, setProfiles] = useState([]);
  const [pinFor, setPinFor] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/profiles').then(setProfiles).catch((e) => setError(e.message));
  }, []);

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

  return (
    <div className="profiles-screen">
      <h1>Who's watching?</h1>
      <div className="profile-grid">
        {profiles.map((p) => (
          <button key={p.id} className={`profile-tile ${current?.id === p.id ? 'current' : ''}`} onClick={() => (p.hasPin ? (setError(null), setPinFor(p)) : choose(p))}>
            <Avatar profile={p} size={120} />
            <span>{p.name}</span>
            <small>{p.hasPin ? '🔒' : ''}{p.isKid ? ' Kids' : ''}</small>
          </button>
        ))}
      </div>
      {current?.isAdmin && <button className="btn ghost" onClick={() => navigate('/admin#profiles')}>Manage profiles</button>}
      {error && !pinFor && <p className="error">{error}</p>}
      {pinFor && <PinPad title={`Enter ${pinFor.name}'s PIN`} error={error} onSubmit={onPin} onCancel={cancelPin} />}
    </div>
  );
}
