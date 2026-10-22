import { apiUrl, getToken, setToken } from './connection.js';

export { media } from './connection.js';

function headers(extra = {}) {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function handle(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Admin settings timed out: the app shows the password prompt again.
    if (data.code === 'ADMIN_LOCKED') window.dispatchEvent(new Event('admin-locked'));
    // The server no longer knows this device (signed out elsewhere, password changed): sign in again.
    if (data.code === 'SIGNED_OUT' && getToken()) {
      setToken(null);
      window.dispatchEvent(new Event('signed-out'));
    }
    const err = new Error(data.error || `${fallback} (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Small fetch wrapper: JSON in, JSON out, server error messages surfaced as Error.message.
async function request(method, url, body) {
  const res = await fetch(apiUrl(url), {
    method,
    headers: headers(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle(res, 'Request failed');
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
  /** PUT a file or Blob as-is (used for images). */
  async putFile(url, blob) {
    const res = await fetch(apiUrl(url), { method: 'PUT', body: blob, headers: headers({ 'Content-Type': blob.type }) });
    return handle(res, 'Upload failed');
  },
};

/** Fire-and-forget progress save that still goes through when the page is closing. */
export function beacon(url, body) {
  fetch(apiUrl(url), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: headers({ 'Content-Type': 'application/json' }),
    keepalive: true,
  }).catch(() => {});
}

export const fmtTime = (secs) => {
  if (!Number.isFinite(secs)) return '0:00';
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

export const fmtDuration = (secs) => {
  if (!secs) return null;
  const m = Math.round(secs / 60);
  if (m < 1) return `${Math.round(secs)}s`;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};
