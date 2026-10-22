import { useEffect, useRef, useState } from 'react';
import { DEFAULT_PORT, discover, hello, normalizeAddress, isNativeApp } from '../connection.js';

/**
 * Find the HomeFlix server: search this Wi-Fi network first, and if nothing answers,
 * let the person type the address shown on the server's Admin settings page.
 */
export default function Connect({ onConnected, problem, autoSearch = true }) {
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [found, setFound] = useState([]);
  const [address, setAddress] = useState('');
  const [port, setPort] = useState(String(DEFAULT_PORT));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef(null);

  // On first start the app connects to what it finds; when changing servers, the person picks.
  const search = async (autoConnect = false) => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setSearching(true);
    setNotFound(false);
    setFound([]);
    setError(null);
    setProgress(null);
    const results = await discover({ port: Number(port) || DEFAULT_PORT, onProgress: setProgress, signal: ctrl.signal });
    if (ctrl.signal.aborted) return;
    setSearching(false);
    if (results.length && autoConnect) onConnected(results[0].base);
    else if (results.length) setFound(results);
    else setNotFound(true);
  };

  useEffect(() => {
    if (autoSearch) search(true);
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async (e) => {
    e.preventDefault();
    const base = normalizeAddress(address, Number(port) || DEFAULT_PORT);
    if (!base) return setError('Type the server address, for example 192.168.1.20');
    abort.current?.abort();
    setSearching(false);
    setBusy(true);
    setError(null);
    const info = await hello(base, 5000);
    setBusy(false);
    if (info) onConnected(info.base);
    else setError(`No HomeFlix server answered at ${base}. Check the address, and that the computer running HomeFlix is switched on and on the same Wi-Fi.`);
  };

  const pct = progress ? Math.round((progress.checked / progress.total) * 100) : 0;

  return (
    <div className="auth-screen">
      <div className="logo big">HOMEFLIX</div>
      <div className="auth-box">
        <h1>Connect to HomeFlix</h1>
        {problem && <p className="warn small">{problem}</p>}

        {searching ? (
          <div className="searching">
            <div className="spinner small-spinner" />
            <div>
              <p>Looking for HomeFlix on your Wi-Fi…</p>
              {progress && <p className="muted small">Checked {progress.checked} of {progress.total} addresses on {progress.subnet}.x</p>}
              <div className="progress inline"><span style={{ width: `${pct}%` }} /></div>
            </div>
          </div>
        ) : notFound ? (
          <p className="muted">No HomeFlix server was found on this network automatically. Type its address below. It's shown in <b>Admin settings → Watch on other devices</b> on the computer running HomeFlix.</p>
        ) : null}

        <form className="form" onSubmit={connect}>
          <div className="address-row">
            <label className="grow">Server address
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.168.1.20 or myserver.local" inputMode="url" autoCapitalize="off" autoCorrect="off" />
            </label>
            <label className="port">Port
              <input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={5} />
            </label>
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn primary block" disabled={busy || !address.trim()}>{busy ? 'Connecting…' : 'Connect'}</button>
        </form>
        {found.length > 0 && (
          <div className="found-servers">
            <span className="muted small">Found on this network:</span>
            {found.map((f) => (
              <button key={f.base} className="btn secondary block" onClick={() => onConnected(f.base)}>
                {f.name} <span className="muted small">{f.base.replace(/^https?:\/\//, '')}</span>
              </button>
            ))}
          </div>
        )}
        {!searching && <button className="link" onClick={() => search(false)}>{autoSearch ? 'Search the network again' : 'Search the network'}</button>}
        {!isNativeApp && <p className="muted small">Tip: the easiest way is to open the address shown on the server's Admin page directly in this browser.</p>}
      </div>
    </div>
  );
}
