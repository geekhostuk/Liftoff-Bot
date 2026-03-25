async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ── Status / Activity ──────────────────────────────────────────────────────

export function getStatus() {
  return get('/api/status');
}

export function getPilotActivity() {
  return get('/api/pilot-activity');
}

export function getOnlineStats(nicks) {
  return get(`/api/players/online-stats?nicks=${encodeURIComponent(nicks.join(','))}`);
}

// ── Competition ────────────────────────────────────────────────────────────

export function getCompetitionCurrent() {
  return get('/api/competition/current');
}

export function getCompetitionWeeks() {
  return get('/api/competition/weeks');
}

export function getSeasonStandings() {
  return get('/api/competition/season');
}

export function getWeeklyStandings(weekId) {
  return get(`/api/competition/standings/${weekId}`);
}

export function getCurrentWeekStandings() {
  return get('/api/competition/standings');
}

export function getPilotDetail(pilotKey) {
  return get(`/api/competition/pilot/${encodeURIComponent(pilotKey)}`);
}

// ── Players / Stats ────────────────────────────────────────────────────────

export function getPlayers() {
  return get('/api/players');
}

export function getStatsOverview() {
  return get('/api/stats/overview');
}

export function getFilters() {
  return get('/api/filters');
}

export function getCatalog() {
  return get('/api/catalog');
}

// ── Tracks ──────────────────────────────────────────────────────────────

export function getTracks() {
  return get('/api/tracks');
}

// ── Leaderboard ──────────────────────────────────────────────────────────

export function getTrackLeaderboard(env, track) {
  return get(`/api/leaderboard/track?env=${encodeURIComponent(env)}&track=${encodeURIComponent(track)}`);
}

// ── Track browser ────────────────────────────────────────────────────────

export function getBrowseTracks({ search = '', sort = 'name', limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (sort) params.set('sort', sort);
  params.set('limit', limit);
  params.set('offset', offset);
  return get(`/api/browse?${params}`);
}

export function getTrackDetail(env, track) {
  return get(`/api/browse/${encodeURIComponent(env)}/${encodeURIComponent(track)}`);
}

export function getTrackDetailLeaderboard(env, track) {
  return get(`/api/browse/${encodeURIComponent(env)}/${encodeURIComponent(track)}/leaderboard`);
}

export function getTrackComments(env, track, { limit = 50, offset = 0 } = {}) {
  return get(`/api/browse/${encodeURIComponent(env)}/${encodeURIComponent(track)}/comments?limit=${limit}&offset=${offset}`);
}

export async function postTrackComment(env, track, { authorName, body }) {
  const res = await fetch(`/api/browse/${encodeURIComponent(env)}/${encodeURIComponent(track)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author_name: authorName, body }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function getTrackUserTags(env, track) {
  return get(`/api/browse/${encodeURIComponent(env)}/${encodeURIComponent(track)}/user-tags`);
}

export async function postUserTagVote(env, track, label) {
  const res = await fetch(`/api/browse/${encodeURIComponent(env)}/${encodeURIComponent(track)}/user-tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function imageProxyUrl(steamUrl) {
  if (!steamUrl) return null;
  return `/api/image-proxy?url=${encodeURIComponent(steamUrl)}`;
}
