import { esc, fmtMs } from './shared.js';

// ── State ──────────────────────────────────────────────────────────────────
let filterData = { envs: [], tracks: [], pilots: [] };
let currentPage = 0;
let pageSize = 50;
let totalResults = 0;

// ── Load overview stats ───────────────────────────────────────────────────
function loadOverview() {
  fetch('/api/stats/overview')
    .then(r => r.json())
    .then(data => {
      document.getElementById('stat-laps').textContent = (data.total_laps || 0).toLocaleString();
      document.getElementById('stat-pilots').textContent = (data.total_pilots || 0).toLocaleString();
      document.getElementById('stat-races').textContent = (data.total_races || 0).toLocaleString();
    })
    .catch(() => {});
}

// ── Load filter options ───────────────────────────────────────────────────
function loadFilters() {
  fetch('/api/filters')
    .then(r => r.json())
    .then(data => {
      filterData = data;
      populateEnvSelect('filter-env', data.envs);
      populateEnvSelect('lb-env', data.envs);
    })
    .catch(() => {});
}

function populateEnvSelect(id, envs) {
  const sel = document.getElementById(id);
  const current = sel.value;
  sel.innerHTML = '<option value="">All environments</option>';
  for (const env of envs) {
    const opt = document.createElement('option');
    opt.value = env;
    opt.textContent = env;
    sel.appendChild(opt);
  }
  sel.value = current;
}

function populateTrackSelect(id, env) {
  const sel = document.getElementById(id);
  sel.innerHTML = '<option value="">All tracks</option>';
  const tracks = env
    ? filterData.tracks.filter(t => t.env === env)
    : filterData.tracks;
  // Deduplicate track names
  const seen = new Set();
  for (const t of tracks) {
    if (seen.has(t.track)) continue;
    seen.add(t.track);
    const opt = document.createElement('option');
    opt.value = t.track;
    opt.textContent = t.track;
    sel.appendChild(opt);
  }
}

// ── Env → Track cascade ──────────────────────────────────────────────────
document.getElementById('filter-env').addEventListener('change', function() {
  populateTrackSelect('filter-track', this.value);
});
document.getElementById('lb-env').addEventListener('change', function() {
  populateTrackSelect('lb-track', this.value);
});

// ── Tab switching ─────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ── Lap Browser ───────────────────────────────────────────────────────────
function buildQuery() {
  const params = new URLSearchParams();
  const env = document.getElementById('filter-env').value;
  const track = document.getElementById('filter-track').value;
  const pilot = document.getElementById('filter-pilot').value.trim();
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;

  if (env) params.set('env', env);
  if (track) params.set('track', track);
  if (pilot) params.set('nick', pilot);
  if (from) params.set('dateFrom', from + 'T00:00:00Z');
  if (to) params.set('dateTo', to + 'T23:59:59Z');
  params.set('limit', pageSize);
  params.set('offset', currentPage * pageSize);
  return params.toString();
}

function searchLaps() {
  const tbody = document.getElementById('browser-body');
  tbody.innerHTML = '<tr><td colspan="6" class="empty">Loading…</td></tr>';

  fetch('/api/laps/browse?' + buildQuery())
    .then(r => r.json())
    .then(data => {
      totalResults = data.total;
      renderBrowserResults(data.laps);
      renderPagination();
    })
    .catch(() => {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">Error loading data.</td></tr>';
    });
}

function renderBrowserResults(laps) {
  const tbody = document.getElementById('browser-body');

  if (!laps || laps.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No laps found matching your filters.</td></tr>';
    return;
  }

  tbody.innerHTML = laps.map(l => {
    const date = new Date(l.recorded_at);
    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<tr>
      <td class="pilot-name">${esc(l.nick)}</td>
      <td>${l.lap_number}</td>
      <td class="lap-time">${fmtMs(l.lap_ms)}</td>
      <td><span class="env-badge">${esc(l.env || '—')}</span></td>
      <td class="track-name">${esc(l.track || '—')}</td>
      <td class="date-cell">${dateStr}</td>
    </tr>`;
  }).join('');
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const info = document.getElementById('page-info');
  const count = document.getElementById('result-count');

  count.textContent = totalResults.toLocaleString() + ' lap' + (totalResults !== 1 ? 's' : '') + ' found';
  info.textContent = `Page ${currentPage + 1} of ${totalPages}`;

  document.getElementById('page-first').disabled = currentPage === 0;
  document.getElementById('page-prev').disabled = currentPage === 0;
  document.getElementById('page-next').disabled = currentPage >= totalPages - 1;
  document.getElementById('page-last').disabled = currentPage >= totalPages - 1;
}

document.getElementById('btn-search').addEventListener('click', () => {
  currentPage = 0;
  searchLaps();
});

document.getElementById('btn-clear').addEventListener('click', () => {
  document.getElementById('filter-env').value = '';
  document.getElementById('filter-track').value = '';
  document.getElementById('filter-pilot').value = '';
  document.getElementById('filter-from').value = '';
  document.getElementById('filter-to').value = '';
  populateTrackSelect('filter-track', '');
  currentPage = 0;
  searchLaps();
});

// Enter key triggers search in pilot input
document.getElementById('filter-pilot').addEventListener('keydown', e => {
  if (e.key === 'Enter') { currentPage = 0; searchLaps(); }
});

// Pagination buttons
document.getElementById('page-first').addEventListener('click', () => { currentPage = 0; searchLaps(); });
document.getElementById('page-prev').addEventListener('click', () => { currentPage = Math.max(0, currentPage - 1); searchLaps(); });
document.getElementById('page-next').addEventListener('click', () => {
  const totalPages = Math.ceil(totalResults / pageSize);
  currentPage = Math.min(totalPages - 1, currentPage + 1);
  searchLaps();
});
document.getElementById('page-last').addEventListener('click', () => {
  currentPage = Math.max(0, Math.ceil(totalResults / pageSize) - 1);
  searchLaps();
});

// ── Leaderboard ───────────────────────────────────────────────────────────
function loadLeaderboard() {
  const env = document.getElementById('lb-env').value;
  const track = document.getElementById('lb-track').value;
  const tbody = document.getElementById('lb-body');
  tbody.innerHTML = '<tr><td colspan="4" class="empty">Loading…</td></tr>';

  let url;
  if (env && track) {
    url = '/api/leaderboard/track?env=' + encodeURIComponent(env) + '&track=' + encodeURIComponent(track);
  } else {
    url = '/api/leaderboard';
  }

  fetch(url)
    .then(r => r.json())
    .then(data => {
      if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty">No data for this selection.</td></tr>';
        return;
      }
      tbody.innerHTML = data.map((p, i) => {
        const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
        return `<tr>
          <td class="rank ${rankClass}">${i + 1}</td>
          <td class="pilot-name">${esc(p.nick)}</td>
          <td class="lap-time best-time">${fmtMs(p.best_lap_ms)}</td>
          <td>${p.total_laps.toLocaleString()}</td>
        </tr>`;
      }).join('');
    })
    .catch(() => {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">Error loading leaderboard.</td></tr>';
    });
}

document.getElementById('btn-lb-search').addEventListener('click', loadLeaderboard);

// ── Init ──────────────────────────────────────────────────────────────────
loadOverview();
loadFilters();
// Load all laps by default
searchLaps();
