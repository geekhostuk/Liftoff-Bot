/** HTML-escape a string for safe insertion. */
export function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Format milliseconds as a lap time string (e.g. "1:23.456" or "23.456s"). */
export function fmtMs(ms) {
  if (ms == null) return '\u2014';
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = (totalSec % 60).toFixed(3).padStart(6, '0');
  return m > 0 ? `${m}:${s}` : `${s}s`;
}

/** Format a delta in milliseconds with +/- sign. */
export function fmtDelta(ms) {
  if (ms == null) return '\u2014';
  const sign = ms < 0 ? '-' : '+';
  const abs = Math.abs(ms);
  return `${sign}${fmtMs(abs)}`;
}

/** Format an ISO date as short date (e.g. "Mar 15"). */
export function fmtDate(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Format an ISO date as date + time. */
export function fmtDateTime(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Format a number with locale-aware commas. */
export function fmtNumber(n) {
  if (n == null) return '\u2014';
  return Number(n).toLocaleString();
}

/** Generate a URL path to the track browser detail page. */
export function browsePath(env, track) {
  return `/browse/${encodeURIComponent(env)}/${encodeURIComponent(track)}`;
}

/** Format a timestamp as relative time (e.g. "3m ago", "2h ago"). */
export function timeAgo(dateStr) {
  if (!dateStr) return '\u2014';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
