import { useApp } from '../App.jsx';
import { getBase, isNativeApp } from '../connection.js';

/** "Connected to <name> · Change": shown where a device might need to switch servers. */
export default function ServerBadge() {
  const { server, changeServer } = useApp();
  const base = getBase();
  // A browser showing the server's own page has nothing to switch to.
  if (!isNativeApp && !base) return null;
  const host = base ? base.replace(/^https?:\/\//, '') : window.location.host;
  return (
    <p className="server-badge muted small">
      Connected to <b>{server?.name || 'HomeFlix'}</b> at {host} · <button className="link" onClick={changeServer}>Change server</button>
    </p>
  );
}
