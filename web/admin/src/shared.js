/**
 * Shared utilities used by the admin frontend.
 */

export function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

export function fmtMs(ms) {
  if (ms == null) return '—';
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = (totalSec % 60).toFixed(3).padStart(6, '0');
  return m > 0 ? `${m}:${s}` : `${s}s`;
}

export function fmtDelta(ms) {
  if (ms == null) return '—';
  const sign = ms < 0 ? '-' : '+';
  const abs = Math.abs(ms);
  return `${sign}${fmtMs(abs)}`;
}
