// Small fetch wrapper: JSON in, JSON out, server error messages surfaced as Error.message.
async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
  /** PUT a file or Blob as-is (used for images). */
  async putFile(url, blob) {
    const res = await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type }, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
    return data;
  },
};

/** Fire-and-forget progress save that survives the tab closing. */
export function beacon(url, body) {
  const blob = new Blob([JSON.stringify(body)], { type: 'text/plain' });
  if (!navigator.sendBeacon?.(url, blob)) {
    fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain' }, keepalive: true }).catch(() => {});
  }
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
