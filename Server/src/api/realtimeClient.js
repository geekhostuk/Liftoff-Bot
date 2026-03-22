/**
 * Realtime Client
 *
 * Thin HTTP client for the API server to communicate with the realtime server's
 * internal API. All admin routes that need plugin commands, playlist control,
 * competition runner state, idle kick, or broadcasting go through here.
 */

const REALTIME_URL = process.env.REALTIME_URL || 'http://localhost:3001';

async function post(path, body = {}) {
  const res = await fetch(`${REALTIME_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function get(path) {
  const res = await fetch(`${REALTIME_URL}${path}`);
  return res.json();
}

async function del(path, body = {}) {
  const res = await fetch(`${REALTIME_URL}${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Plugin commands ─────────────────────────────────────────────────────────

async function sendCommand(cmd) {
  const result = await post('/internal/command', cmd);
  return result.ok;
}

async function sendCommandAwait(cmd) {
  return post('/internal/command-await', cmd);
}

async function getPluginStatus() {
  return get('/internal/plugin-status');
}

// ── Track ───────────────────────────────────────────────────────────────────

async function setTrack(trackInfo) {
  const result = await post('/internal/track/set', trackInfo);
  return result.ok;
}

// ── Playlist ────────────────────────────────────────────────────────────────

async function startPlaylist(playlistId, intervalMs, startIndex = 0) {
  return post('/internal/playlist/start', { playlist_id: playlistId, interval_ms: intervalMs, start_index: startIndex });
}

async function stopPlaylist() {
  return post('/internal/playlist/stop');
}

async function skipPlaylist() {
  return post('/internal/playlist/skip');
}

async function getPlaylistState() {
  return get('/internal/playlist/state');
}

// ── Competition runner ──────────────────────────────────────────────────────

async function getCompetitionRunnerState() {
  return get('/internal/competition/runner/state');
}

async function setCompetitionAutoManaged(enabled) {
  return post('/internal/competition/runner/auto', { enabled });
}

// ── Idle kick ───────────────────────────────────────────────────────────────

async function getIdleKickStatus() {
  return get('/internal/idle-kick/status');
}

async function getIdleKickWhitelist() {
  return get('/internal/idle-kick/whitelist');
}

async function addToIdleKickWhitelist(nick) {
  return post('/internal/idle-kick/whitelist', { nick });
}

async function removeFromIdleKickWhitelist(nick) {
  return del('/internal/idle-kick/whitelist', { nick });
}

// ── Broadcast ───────────────────────────────────────────────────────────────

async function broadcast(event) {
  return post('/internal/broadcast', event);
}

// ── State ───────────────────────────────────────────────────────────────────

async function getState() {
  return get('/internal/state');
}

module.exports = {
  sendCommand,
  sendCommandAwait,
  getPluginStatus,
  setTrack,
  startPlaylist,
  stopPlaylist,
  skipPlaylist,
  getPlaylistState,
  getCompetitionRunnerState,
  setCompetitionAutoManaged,
  getIdleKickStatus,
  getIdleKickWhitelist,
  addToIdleKickWhitelist,
  removeFromIdleKickWhitelist,
  broadcast,
  getState,
};
