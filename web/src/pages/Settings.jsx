import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import Avatar, { AVATAR_COLORS } from '../components/Avatar.jsx';

const LANGS = [['', 'Off'], ['en', 'English'], ['hi', 'Hindi'], ['ta', 'Tamil'], ['te', 'Telugu'], ['ml', 'Malayalam'], ['bn', 'Bengali'], ['mr', 'Marathi'], ['fr', 'French'], ['es', 'Spanish'], ['de', 'German'], ['ja', 'Japanese'], ['ko', 'Korean']];

export default function Settings() {
  const { profile, refresh } = useApp();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [pin, setPin] = useState('');
  const [prefs, setPrefs] = useState(profile.prefs || {});
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const saveProfile = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const body = { name, avatar };
      if (pin === 'remove') body.pin = '';
      else if (pin) body.pin = pin;
      await api.put(`/api/profiles/${profile.id}`, body);
      await api.put('/api/me/prefs', prefs);
      setPin('');
      await refresh();
      setMsg('Saved.');
      setTimeout(() => setMsg(null), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page narrow">
      <h1>Profile & subtitles</h1>
      <form className="form" onSubmit={saveProfile}>
        <div className="form-row avatar-row">
          <Avatar profile={{ name, avatar }} size={72} />
          <div className="swatches">
            {Object.entries(AVATAR_COLORS).map(([k, c]) => (
              <button type="button" key={k} className={`swatch ${avatar === k ? 'on' : ''}`} style={{ background: c }} onClick={() => setAvatar(k)} aria-label={k} />
            ))}
          </div>
        </div>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>
          PIN {profile.hasPin ? '(this profile has a PIN)' : '(none)'}
          <input inputMode="numeric" maxLength={4} value={pin === 'remove' ? '' : pin} onChange={(e) => setPin(e.target.value)} placeholder={profile.hasPin ? 'Type a new 4-digit PIN to change it' : 'Type 4 digits to add a PIN'} />
        </label>
        {profile.hasPin && <label className="check"><input type="checkbox" checked={pin === 'remove'} onChange={(e) => setPin(e.target.checked ? 'remove' : '')} /> Remove my PIN</label>}

        <h2>Subtitles</h2>
        <label>Turn on subtitles automatically in
          <select value={prefs.subtitleLang || ''} onChange={(e) => setPrefs({ ...prefs, subtitleLang: e.target.value })}>
            {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>Text size
          <select value={prefs.subtitleSize || 'medium'} onChange={(e) => setPrefs({ ...prefs, subtitleSize: e.target.value })}>
            <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={prefs.subtitleBackground !== false} onChange={(e) => setPrefs({ ...prefs, subtitleBackground: e.target.checked })} /> Dark box behind subtitle text</label>
        <div className="subtitle-preview"><span style={{ background: prefs.subtitleBackground === false ? 'transparent' : 'rgba(0,0,0,.75)', fontSize: { small: 16, medium: 22, large: 30 }[prefs.subtitleSize || 'medium'] }}>This is how subtitles will look.</span></div>

        {error && <p className="error">{error}</p>}
        {msg && <p className="ok">{msg}</p>}
        <button className="btn primary">Save</button>
      </form>
    </div>
  );
}
