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

// ── Leaderboard ──────────────────────────────────────────────────────────

export function getTrackLeaderboard(env, track) {
  return get(`/api/leaderboard/track?env=${encodeURIComponent(env)}&track=${encodeURIComponent(track)}`);
}
