/**
 * Realtime Client
 *
 * Thin HTTP client for the API server to communicate with the realtime server's
 * internal API. All admin routes that need plugin commands, track overseer,
 * idle kick, or broadcasting go through here.
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

// ── Track Overseer ──────────────────────────────────────────────────────────

async function getOverseerState() {
  return get('/internal/overseer/state');
}

async function startOverseerPlaylist(playlistId, intervalMs, startIndex = 0) {
  return post('/internal/overseer/start-playlist', { playlist_id: playlistId, interval_ms: intervalMs, start_index: startIndex });
}

async function startOverseerTags(tagNames, intervalMs) {
  return post('/internal/overseer/start-tags', { tag_names: tagNames, interval_ms: intervalMs });
}

async function stopOverseer() {
  return post('/internal/overseer/stop');
}

async function skipOverseer() {
  return post('/internal/overseer/skip');
}

async function extendOverseer(ms) {
  return post('/internal/overseer/extend', { ms });
}

async function skipToIndex(index) {
  return post('/internal/overseer/skip-to-index', { index });
}

async function setNextPlaylist(playlistId, intervalMs) {
  return post('/internal/overseer/next-playlist', { playlist_id: playlistId, interval_ms: intervalMs });
}

async function clearNextPlaylist() {
  return del('/internal/overseer/next-playlist');
}

// ── Queue ───────────────────────────────────────────────────────────────────

async function getQueue() {
  return get('/internal/queue');
}

async function addToQueue(track) {
  return post('/internal/queue', track);
}

async function removeFromQueue(id) {
  return del(`/internal/queue/${id}`);
}

async function reorderQueue(id, direction) {
  return post(`/internal/queue/${id}/move`, { direction });
}

async function clearQueue() {
  return del('/internal/queue');
}

// ── Tracks info ─────────────────────────────────────────────────────────────

async function getUpcomingTracks(count = 10) {
  return get(`/internal/tracks/upcoming?count=${count}`);
}

async function getTrackHistory(limit = 50, offset = 0) {
  return get(`/internal/tracks/history?limit=${limit}&offset=${offset}`);
}

// ── Tag vote ─────────────────────────────────────────────────────────────

async function startTagVote(tagOptions, durationMs) {
  return post('/internal/tag-vote/start', { tag_options: tagOptions, duration_ms: durationMs });
}

async function cancelTagVote() {
  return post('/internal/tag-vote/cancel');
}

async function getTagVoteState() {
  return get('/internal/tag-vote/state');
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
  // Overseer
  getOverseerState,
  startOverseerPlaylist,
  startOverseerTags,
  stopOverseer,
  skipOverseer,
  extendOverseer,
  skipToIndex,
  setNextPlaylist,
  clearNextPlaylist,
  // Queue
  getQueue,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  clearQueue,
  // Tracks
  getUpcomingTracks,
  getTrackHistory,
  // Tag vote
  startTagVote,
  cancelTagVote,
  getTagVoteState,
  // Idle kick
  getIdleKickStatus,
  getIdleKickWhitelist,
  addToIdleKickWhitelist,
  removeFromIdleKickWhitelist,
  // Session
  syncSession,
  destroyRemoteSession,
  // Broadcast
  broadcast,
  getTracksInfo,
  previewTemplate,
  getState,
};
