// Android-app behaviour: the hardware Back button, and moving around with a TV remote's D-pad.
import { App as CapApp } from '@capacitor/app';
import { isNativeApp } from './connection.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

function visible(el) {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && !el.closest('[aria-hidden="true"]');
}

/** Pick the nearest focusable element in the pressed direction (what TV remotes need). */
function move(dir) {
  const [dx, dy] = dir;
  const scope = document.querySelector('.modal-backdrop') || document;
  const all = [...scope.querySelectorAll(FOCUSABLE)].filter(visible);
  const current = document.activeElement && document.activeElement !== document.body && scope.contains(document.activeElement)
    ? document.activeElement : null;
  if (!current) {
    all.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    return all[0];
  }
  const c = current.getBoundingClientRect();
  const cx = c.left + c.width / 2;
  const cy = c.top + c.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const el of all) {
    if (el === current || el.contains(current)) continue;
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width / 2;
    const ey = r.top + r.height / 2;
    // Must lie in the pressed direction, past the current element's edge.
    const ahead = dx > 0 ? r.left >= c.right - 4 : dx < 0 ? r.right <= c.left + 4 : dy > 0 ? r.top >= c.bottom - 4 : r.bottom <= c.top + 4;
    if (!ahead) continue;
    const along = dx ? Math.abs(ex - cx) : Math.abs(ey - cy);
    const across = dx ? Math.abs(ey - cy) : Math.abs(ex - cx);
    const score = along + across * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

function onKeyDown(e) {
  const dir = DIRS[e.key];
  if (!dir || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  // The video player uses the arrow keys itself (seek, volume).
  if (document.querySelector('.player')) return;
  const el = document.activeElement;
  const tag = el?.tagName;
  // Text boxes keep left/right for the cursor; sliders and dropdowns keep their own keys.
  if ((tag === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(el.type)) || tag === 'TEXTAREA') {
    if (dir[0] !== 0 || el.type === 'range') return;
  }
  if (tag === 'SELECT') return;
  const target = move(dir);
  if (!target) return;
  e.preventDefault();
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

export function setupNative() {
  // D-pad navigation in the app (phones ignore it), or in a browser with ?tv=1 for testing.
  const tvParam = new URLSearchParams(window.location.search).get('tv');
  if (tvParam !== null) {
    try { localStorage.setItem('hf_tv', tvParam === '0' ? '' : '1'); } catch { /* ignore */ }
  }
  let tv = isNativeApp;
  try { tv = tv || !!localStorage.getItem('hf_tv'); } catch { /* ignore */ }
  if (tv) {
    document.documentElement.classList.add('tv-nav');
    window.addEventListener('keydown', onKeyDown);
  }

  if (isNativeApp) {
    CapApp.addListener('backButton', ({ canGoBack }) => {
      // Close an open dialog first, like Escape does.
      const backdrop = document.querySelector('.modal-backdrop');
      if (backdrop) {
        backdrop.click();
        return;
      }
      if (canGoBack) window.history.back();
      else CapApp.minimizeApp();
    });
  }
}
