import { esc } from './shared.js';

let _countdownTimer = null;
let _nextChangeAt = null;

// ── Data loading ────────────────────────────────────────────────────────────

async function loadTracks() {
  let data;
  try {
    const res = await fetch('/api/tracks');
    data = await res.json();
  } catch {
    return;
  }

  renderNowPlaying(data.current_track, data.next_change_at);
  renderPlaylists(data.active_playlists);
  renderUpcoming(data.upcoming);
  renderRecent(data.recent_tracks);
}

// ── Now Playing ─────────────────────────────────────────────────────────────

function renderNowPlaying(track, nextChangeAt) {
  const trackEl = document.getElementById('np-track');
  const envEl = document.getElementById('np-env');

  if (!track || (!track.track && !track.env)) {
    trackEl.textContent = 'No track loaded';
    envEl.textContent = '';
  } else {
    trackEl.textContent = track.track || '—';
    envEl.textContent = track.env || '';
  }

  _nextChangeAt = nextChangeAt ? new Date(nextChangeAt).getTime() : null;
  startCountdown();
}

function startCountdown() {
  if (_countdownTimer) clearInterval(_countdownTimer);
  const el = document.getElementById('np-countdown');

  function tick() {
    if (!_nextChangeAt) { el.textContent = '—'; return; }
    const remainMs = _nextChangeAt - Date.now();
    if (remainMs <= 0) { el.textContent = '0:00'; return; }
    const m = Math.floor(remainMs / 60000);
    const s = Math.floor((remainMs % 60000) / 1000);
    el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  tick();
  _countdownTimer = setInterval(tick, 1000);
}

// ── Active Playlists ────────────────────────────────────────────────────────

function renderPlaylists(playlists) {
  const container = document.getElementById('playlists-container');

  if (!playlists || playlists.length === 0) {
    container.innerHTML = '<div class="empty">No active playlists</div>';
    return;
  }

  container.innerHTML = playlists.map((pl, pIdx) => {
    const tracks = pl.tracks || [];
    const trackItems = tracks.map((t, i) => {
      const isCurrent = pl.is_current && i === pl.current_index;
      return `<li class="track-item${isCurrent ? ' current' : ''}">
        <span class="track-index">${i + 1}</span>
        <span class="track-name">${esc(t.track)}</span>
        <span class="track-env">${esc(t.env)}</span>
      </li>`;
    }).join('');

    const badge = pl.is_current ? '<span class="playlist-badge">Playing</span>' : '';
    // Auto-open the first playlist or the currently playing one
    const isOpen = pl.is_current || (pIdx === 0 && !playlists.some(p => p.is_current));

    return `<div class="playlist-card${isOpen ? ' open' : ''}" data-playlist>
      <div class="playlist-header" data-toggle>
        <span class="playlist-chevron">&#9654;</span>
        <span class="playlist-name">${esc(pl.playlist_name)}</span>
        ${badge}
        <span class="playlist-track-count">${tracks.length} track${tracks.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="playlist-tracks">
        <ul class="track-list">${trackItems}</ul>
      </div>
    </div>`;
  }).join('');

  // Toggle click handlers
  container.querySelectorAll('[data-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('[data-playlist]').classList.toggle('open');
    });
  });
}

// ── Upcoming ────────────────────────────────────────────────────────────────

function renderUpcoming(tracks) {
  const container = document.getElementById('upcoming-container');

  if (!tracks || tracks.length === 0) {
    container.innerHTML = '<div class="empty">No upcoming tracks</div>';
    return;
  }

  const items = tracks.map((t, i) => `<li class="track-item">
    <span class="track-index">${i + 1}</span>
    <span class="track-name">${esc(t.track)}</span>
    <span class="track-env">${esc(t.env)}</span>
  </li>`).join('');

  container.innerHTML = `<ul class="track-list">${items}</ul>`;
}

// ── Recently Played ─────────────────────────────────────────────────────────

function renderRecent(tracks) {
  const container = document.getElementById('recent-container');

  if (!tracks || tracks.length === 0) {
    container.innerHTML = '<div class="empty">No recent tracks</div>';
    return;
  }

  const rows = tracks.map(t => {
    const ago = timeAgo(t.last_played);
    return `<tr>
      <td>${esc(t.track)}</td>
      <td>${esc(t.env)}</td>
      <td class="time-ago">${ago}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `<table>
    <thead><tr><th>Track</th><th>Environment</th><th>Last Played</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── WebSocket for live updates ──────────────────────────────────────────────

function connectWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws/live`);

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event_type === 'playlist_state' || msg.event_type === 'track_changed') {
        loadTracks();
      }
    } catch {}
  };

  ws.onclose = () => setTimeout(connectWebSocket, 3000);
}

// ── Init ────────────────────────────────────────────────────────────────────

loadTracks();
connectWebSocket();
