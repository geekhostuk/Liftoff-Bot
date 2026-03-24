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

// ── Tag runner ─────────────────────────────────────────────────────────

async function startTagRunner(tagNames, intervalMs) {
  return post('/internal/tag-runner/start', { tag_names: tagNames, interval_ms: intervalMs });
}

async function stopTagRunner() {
  return post('/internal/tag-runner/stop');
}

async function skipTagRunner() {
  return post('/internal/tag-runner/skip');
}

async function getTagRunnerState() {
  return get('/internal/tag-runner/state');
}

// ── Tag vote ─────────────────────────────────────────────────────────

async function startTagVote(tagOptions, durationMs) {
  return post('/internal/tag-vote/start', { tag_options: tagOptions, duration_ms: durationMs });
}

async function cancelTagVote() {
  return post('/internal/tag-vote/cancel');
}

async function getTagVoteState() {
  return get('/internal/tag-vote/state');
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

// ── Session sync ────────────────────────────────────────────────────────────

async function syncSession(token, session) {
  return post('/internal/session/register', { token, session });
}

async function destroyRemoteSession(token) {
  return post('/internal/session/destroy', { token });
}

// ── Broadcast ───────────────────────────────────────────────────────────────

async function broadcast(event) {
  return post('/internal/broadcast', event);
}

// ── Tracks info ─────────────────────────────────────────────────────────────

async function getTracksInfo() {
  return get('/internal/tracks/info');
}

// ── Chat template preview ───────────────────────────────────────────────────

async function previewTemplate(template) {
  return post('/internal/chat/template-preview', { template });
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
  startTagRunner,
  stopTagRunner,
  skipTagRunner,
  getTagRunnerState,
  startTagVote,
  cancelTagVote,
  getTagVoteState,
  getCompetitionRunnerState,
  setCompetitionAutoManaged,
  getIdleKickStatus,
  getIdleKickWhitelist,
  addToIdleKickWhitelist,
  removeFromIdleKickWhitelist,
  syncSession,
  destroyRemoteSession,
  broadcast,
  getTracksInfo,
  previewTemplate,
  getState,
};
