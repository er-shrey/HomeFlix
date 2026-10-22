import { useState } from 'react';
import { api } from '../api.js';
import Avatar, { AVATAR_COLORS } from './Avatar.jsx';

/** Add or edit a profile: name, colour, kids limits and an optional PIN. */
export default function ProfileForm({ profile = {}, onSaved, onCancel }) {
  const isNew = !profile.id;
  const [f, setF] = useState({
    name: profile.name || '',
    avatar: profile.avatar || Object.keys(AVATAR_COLORS)[Math.floor(Math.random() * 8)],
    isKid: !!profile.isKid,
    maxAge: profile.maxAge ?? 7,
    pin: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = { name: f.name, avatar: f.avatar, isKid: f.isKid, maxAge: f.maxAge };
      if (f.pin === 'remove') body.pin = '';
      else if (f.pin) body.pin = f.pin;
      const saved = isNew ? await api.post('/api/profiles', body) : await api.put(`/api/profiles/${profile.id}`, body);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="form profile-form" onSubmit={save}>
      <div className="avatar-row">
        <Avatar profile={{ name: f.name || '?', avatar: f.avatar }} size={72} />
        <div className="swatches">
          {Object.entries(AVATAR_COLORS).map(([k, c]) => (
            <button type="button" key={k} className={`swatch ${f.avatar === k ? 'on' : ''}`} style={{ background: c }} onClick={() => setF({ ...f, avatar: k })} aria-label={k} />
          ))}
        </div>
      </div>
      <label>Name<input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={30} /></label>
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
      <label>PIN {profile.hasPin ? '(this profile has one)' : '(optional, stops others using this profile)'}
        <input inputMode="numeric" maxLength={4} value={f.pin === 'remove' ? '' : f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} placeholder="4 digits" />
      </label>
      {profile.hasPin && <label className="check"><input type="checkbox" checked={f.pin === 'remove'} onChange={(e) => setF({ ...f, pin: e.target.checked ? 'remove' : '' })} /> Remove the PIN</label>}
      {error && <p className="error">{error}</p>}
      <div className="auth-actions">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Add profile' : 'Save'}</button>
      </div>
    </form>
  );
}
