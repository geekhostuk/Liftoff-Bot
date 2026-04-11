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

async function setSkipVoteEnabled(enabled) {
  return post('/internal/overseer/skip-vote-enabled', { enabled });
}

async function setExtendVoteEnabled(enabled) {
  return post('/internal/overseer/extend-vote-enabled', { enabled });
}

async function getPlaylistQueue() {
  return get('/internal/overseer/playlist-queue');
}

async function addToPlaylistQueue(playlistId, intervalMs, shuffle, startAfter) {
  return post('/internal/overseer/playlist-queue', {
    playlist_id: playlistId, interval_ms: intervalMs, shuffle, start_after: startAfter,
  });
}

async function removeFromPlaylistQueue(id) {
  return del(`/internal/overseer/playlist-queue/${id}`);
}

async function reorderPlaylistQueue(id, direction) {
  return post(`/internal/overseer/playlist-queue/${id}/move`, { direction });
}

async function clearPlaylistQueue() {
  return del('/internal/overseer/playlist-queue');
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

async function setUnregKickEnabled(enabled) {
  return post('/internal/idle-kick/unreg-kick', { enabled });
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

async function refreshIntervalScheduler() {
  return post('/internal/chat/interval-refresh', {});
}

// ── State ───────────────────────────────────────────────────────────────────

async function getState() {
  return get('/internal/state');
}

// ── Bot management ─────────────────────────────────────────────────────────

async function getBots() {
  return get('/internal/bots');
}

async function addBot(id, apiKey, label, botNick) {
  return post('/internal/bots', { id, api_key: apiKey, label, bot_nick: botNick });
}

async function removeBot(id) {
  return del(`/internal/bots/${id}`);
}

// ── Room management ───────────────────────────────────────────────────────

async function getRooms() {
  return get('/internal/rooms');
}

async function addRoom(id, label, scoringMode) {
  return post('/internal/rooms', { id, label, scoring_mode: scoringMode });
}

async function updateRoom(id, fields) {
  const res = await fetch(`${REALTIME_URL}/internal/rooms/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  return res.json();
}

async function removeRoom(id) {
  return del(`/internal/rooms/${id}`);
}

async function assignBotToRoom(roomId, botId) {
  return post(`/internal/rooms/${roomId}/assign-bot`, { bot_id: botId });
}

// Room-scoped overseer
async function getRoomOverseerState(roomId) {
  return get(`/internal/rooms/${roomId}/overseer/state`);
}

async function startRoomOverseerPlaylist(roomId, playlistId, intervalMs, startIndex = 0) {
  return post(`/internal/rooms/${roomId}/overseer/start-playlist`, { playlist_id: playlistId, interval_ms: intervalMs, start_index: startIndex });
}

async function startRoomOverseerTags(roomId, tagNames, intervalMs) {
  return post(`/internal/rooms/${roomId}/overseer/start-tags`, { tag_names: tagNames, interval_ms: intervalMs });
}

async function stopRoomOverseer(roomId) {
  return post(`/internal/rooms/${roomId}/overseer/stop`);
}

async function skipRoomOverseer(roomId) {
  return post(`/internal/rooms/${roomId}/overseer/skip`);
}

async function extendRoomOverseer(roomId, ms) {
  return post(`/internal/rooms/${roomId}/overseer/extend`, { ms });
}

async function skipRoomToIndex(roomId, index) {
  return post(`/internal/rooms/${roomId}/overseer/skip-to-index`, { index });
}

async function setRoomSkipVoteEnabled(roomId, enabled) {
  return post(`/internal/rooms/${roomId}/overseer/skip-vote-enabled`, { enabled });
}

async function setRoomExtendVoteEnabled(roomId, enabled) {
  return post(`/internal/rooms/${roomId}/overseer/extend-vote-enabled`, { enabled });
}

// Room-scoped tag vote
async function startRoomTagVote(roomId, tagOptions, durationMs) {
  return post(`/internal/rooms/${roomId}/tag-vote/start`, { tag_options: tagOptions, duration_ms: durationMs });
}

async function cancelRoomTagVote(roomId) {
  return post(`/internal/rooms/${roomId}/tag-vote/cancel`);
}

async function getRoomTagVoteState(roomId) {
  return get(`/internal/rooms/${roomId}/tag-vote/state`);
}

module.exports = {
  sendCommand,
  sendCommandAwait,
  getPluginStatus,
  // Bots
  getBots,
  addBot,
  removeBot,
  setTrack,
  // Overseer
  getOverseerState,
  startOverseerPlaylist,
  startOverseerTags,
  stopOverseer,
  skipOverseer,
  extendOverseer,
  skipToIndex,
  setSkipVoteEnabled,
  setExtendVoteEnabled,
  getPlaylistQueue,
  addToPlaylistQueue,
  removeFromPlaylistQueue,
  reorderPlaylistQueue,
  clearPlaylistQueue,
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
  setUnregKickEnabled,
  // Session
  syncSession,
  destroyRemoteSession,
  // Broadcast
  broadcast,
  getTracksInfo,
  previewTemplate,
  refreshIntervalScheduler,
  getState,
  // Rooms
  getRooms,
  addRoom,
  updateRoom,
  removeRoom,
  assignBotToRoom,
  getRoomOverseerState,
  startRoomOverseerPlaylist,
  startRoomOverseerTags,
  stopRoomOverseer,
  skipRoomOverseer,
  extendRoomOverseer,
  skipRoomToIndex,
  setRoomSkipVoteEnabled,
  setRoomExtendVoteEnabled,
  startRoomTagVote,
  cancelRoomTagVote,
  getRoomTagVoteState,
};
