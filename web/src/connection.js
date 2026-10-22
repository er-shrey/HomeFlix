// Which HomeFlix server this app talks to, the sign-in token for it, and finding servers on the network.
// In a browser the page usually comes from the server itself (same origin). The Android app has no
// server of its own, so it searches the Wi-Fi network or asks for an address.
import { Capacitor, registerPlugin } from '@capacitor/core';

export const isNativeApp = Capacitor.isNativePlatform();
export const DEFAULT_PORT = 8080;

// Small native helper (android/app/.../NetInfoPlugin.java) that reports the device's Wi-Fi address.
const NetInfo = registerPlugin('NetInfo');

const SERVER_KEY = 'hf_server';
const tokenKey = (base) => `hf_token:${base || 'same-origin'}`;

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };

let base = read(SERVER_KEY); // null = not chosen yet, '' = same origin
let mediaToken = null;

export const getBase = () => base;
export const getToken = () => (base === null ? null : read(tokenKey(base)));
export const setToken = (t) => write(tokenKey(base), t);
export const setMediaToken = (t) => { mediaToken = t; };

export function setServer(newBase) {
  base = newBase;
  write(SERVER_KEY, newBase);
}

/** Forget the chosen server (the "Change server" button). Tokens for other servers are kept. */
export function forgetServer() {
  base = null;
  write(SERVER_KEY, null);
}

/** Full URL for an API path on the current server. */
export const apiUrl = (path) => `${base || ''}${path}`;

/** URL for images, video and subtitles: <img>/<video> can't send headers, so the media token rides along. */
export function media(path) {
  if (!path || !path.startsWith('/media/')) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${base || ''}${path}${mediaToken ? `${sep}mt=${mediaToken}` : ''}`;
}

/** "192.168.1.20", "192.168.1.20:9000", "http://media.home:8080/" -> "http://host:port" */
export function normalizeAddress(input, port = DEFAULT_PORT) {
  let s = String(input || '').trim().replace(/\/+$/, '');
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    const u = new URL(s);
    if (!u.port) u.port = String(port || DEFAULT_PORT);
    return `${u.protocol}//${u.hostname}:${u.port}`;
  } catch {
    return null;
  }
}

/** Ask an address whether it's a HomeFlix server. Resolves to its details, or null. */
export async function hello(candidate, timeoutMs = 2500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${candidate}/api/hello`, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.app === 'homeflix' ? { base: candidate, ...data } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Home routers' usual address ranges, used when the device's own address isn't known.
const COMMON_SUBNETS = ['192.168.1', '192.168.0', '192.168.29', '192.168.31', '192.168.2', '192.168.100', '10.0.0', '10.0.1'];

async function deviceSubnet() {
  if (!isNativeApp) return null;
  try {
    const { ip } = await NetInfo.getIPv4();
    const m = ip && ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Look for HomeFlix servers: the page's own server, then every address on this device's Wi-Fi
 * network (or the usual home ranges). Stops at the first one found.
 * onProgress({ checked, total, subnet }) is called as it goes.
 */
export async function discover({ port = DEFAULT_PORT, onProgress, signal } = {}) {
  if (!isNativeApp) {
    const same = await hello('', 2000);
    if (same) return [same];
  }
  const local = await deviceSubnet();
  const lastHost = (read(SERVER_KEY) || '').match(/\/\/(\d+\.\d+\.\d+)\.\d+:/)?.[1];
  const subnets = [...new Set([local, lastHost, ...(local ? [] : COMMON_SUBNETS)].filter(Boolean))];

  const found = [];
  const total = subnets.length * 254;
  let checked = 0;
  for (const subnet of subnets) {
    const hosts = Array.from({ length: 254 }, (_, i) => `http://${subnet}.${i + 1}:${port}`);
    let next = 0;
    const worker = async () => {
      while (next < hosts.length && !found.length && !signal?.aborted) {
        const h = hosts[next++];
        const r = await hello(h, 900);
        checked++;
        onProgress?.({ checked, total, subnet });
        if (r) found.push(r);
      }
    };
    await Promise.all(Array.from({ length: 48 }, worker));
    if (found.length || signal?.aborted) break;
    // Skip the rest of this subnet in the progress count.
    checked = Math.max(checked, (subnets.indexOf(subnet) + 1) * 254);
  }
  return found;
}
