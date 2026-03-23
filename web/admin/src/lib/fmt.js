export function esc(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function fmtMs(ms) {
  if (ms == null || ms < 0) return '-';
  const totalSec = ms / 1000;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return mins > 0
    ? `${mins}:${secs.toFixed(3).padStart(6, '0')}`
    : `${secs.toFixed(3)}s`;
}

export function fmtDelta(ms) {
  if (ms == null) return '';
  const sign = ms >= 0 ? '+' : '-';
  return sign + fmtMs(Math.abs(ms));
}

export function fmtIdleTime(ms) {
  if (ms == null) return '-';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m ${rem.toString().padStart(2, '0')}s`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function fmtCountdown(targetMs) {
  const diff = targetMs - Date.now();
  if (diff <= 0) return '0:00';
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
