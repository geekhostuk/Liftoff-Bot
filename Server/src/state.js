/**
 * Centralized in-memory state store.
 * Single source of truth for runtime state shared across modules.
 *
 * Players are keyed by "botId:actor" to avoid actor-number collisions
 * across multiple bot lobbies.
 */

// Last known track info, set when admin sends set_track or playlist advances
const currentTrack = { env: null, track: null, race: null };

// ISO timestamp of the last track change — used to filter laps in snapshots
// so that only laps from the current track are shown in "Race in Progress".
let currentTrackSince = null;

// "botId:actor" → { actor, nick, user_id, botId } for players currently online
const onlinePlayers = new Map();

// ── Chat command cooldown ────────────────────────────────────────────────────
// Epoch ms after which chat commands are accepted again.
// Set to now + TRACK_CHANGE_CHAT_COOLDOWN_MS on every track change to swallow
// the burst of replayed chat_message events that Liftoff emits when the scene
// reloads.  AppendRaceEvent stamps replayed messages with the *current* time,
// so timestamp-based filtering is not reliable — a cooldown window is the only
// option.
let _chatCommandsAllowedFrom = 0;
const _chatCooldownPerBot = new Map(); // botId → epoch ms
const TRACK_CHANGE_CHAT_COOLDOWN_MS = 30_000;

function _key(botId, actor) {
  return `${botId}:${actor}`;
}

function getCurrentTrack() {
  return currentTrack;
}

function setCurrentTrack(info) {
  Object.assign(currentTrack, info);
  currentTrackSince = new Date().toISOString();
}

function getCurrentTrackSince() {
  return currentTrackSince;
}

function getOnlinePlayers() {
  return [...onlinePlayers.values()];
}

function setOnlinePlayer(actor, data) {
  const botId = data.botId || 'default';
  onlinePlayers.set(_key(botId, actor), { ...data, botId });
}

function removeOnlinePlayer(actor, botId = 'default') {
  onlinePlayers.delete(_key(botId, actor));
}

function clearOnlinePlayers() {
  onlinePlayers.clear();
}

function clearOnlinePlayersForBot(botId) {
  for (const key of [...onlinePlayers.keys()]) {
    if (key.startsWith(`${botId}:`)) {
      onlinePlayers.delete(key);
    }
  }
}

function getOnlinePlayerCount() {
  return onlinePlayers.size;
}

function getOnlinePlayerCountForBot(botId) {
  let count = 0;
  for (const key of onlinePlayers.keys()) {
    if (key.startsWith(`${botId}:`)) count++;
  }
  return count;
}

// ── Chat cooldown helpers ────────────────────────────────────────────────────

function areChatCommandsAllowed(botId) {
  const now = Date.now();
  if (now < _chatCommandsAllowedFrom) return false;
  if (botId) {
    const perBot = _chatCooldownPerBot.get(botId) || 0;
    if (now < perBot) return false;
  }
  return true;
}

function applyChatCooldown() {
  const until = Date.now() + TRACK_CHANGE_CHAT_COOLDOWN_MS;
  _chatCommandsAllowedFrom = until;
  // Also set per-bot so late-loading bots stay cooldown-protected
  for (const [botId] of _chatCooldownPerBot) {
    _chatCooldownPerBot.set(botId, until);
  }
}

function applyChatCooldownForBot(botId) {
  _chatCooldownPerBot.set(botId, Date.now() + TRACK_CHANGE_CHAT_COOLDOWN_MS);
}

// ── Per-bot track state ─────────────────────────────────────────────────────
// Tracks whether each bot has confirmed the current track change.
// botId → { target: {env,track,race}, status: 'transitioning'|'acked'|'confirmed', since: ISO }
const TRANSITION_STALE_MS = 90_000;
const _botTrackState = new Map();

function setBotTransitioning(botId, target) {
  _botTrackState.set(botId, {
    target,
    status: 'transitioning',
    since: new Date().toISOString(),
    _epoch: Date.now()
  });
}

function setBotAcked(botId, track) {
  _botTrackState.set(botId, {
    target: track,
    status: 'acked',
    since: new Date().toISOString(),
    _epoch: Date.now()
  });
}

function setBotConfirmedViaReset(botId) {
  const entry = _botTrackState.get(botId);
  if (!entry || entry.status !== 'acked') return false;
  entry.status = 'confirmed';
  entry.since = new Date().toISOString();
  return true;
}

function isBotTransitioning(botId) {
  const entry = _botTrackState.get(botId);
  if (!entry || entry.status === 'confirmed') return false;
  // Both 'transitioning' and 'acked' block laps
  // Auto-expire stale transitions
  if (Date.now() - entry._epoch > TRANSITION_STALE_MS) {
    entry.status = 'confirmed';
    entry.since = new Date().toISOString();
    console.warn(`[state] Bot "${botId}" transition auto-expired after ${TRANSITION_STALE_MS}ms`);
    return false;
  }
  return true;
}

function getBotTrackState(botId) {
  return _botTrackState.get(botId) || null;
}

function getAllBotTrackStates() {
  const result = {};
  for (const [botId, entry] of _botTrackState) {
    // Check staleness on read
    if ((entry.status === 'transitioning' || entry.status === 'acked') && Date.now() - entry._epoch > TRANSITION_STALE_MS) {
      entry.status = 'confirmed';
      entry.since = new Date().toISOString();
    }
    result[botId] = { target: entry.target, status: entry.status, since: entry.since };
  }
  return result;
}

function clearBotTrackState(botId) {
  _botTrackState.delete(botId);
}

module.exports = {
  getCurrentTrack,
  setCurrentTrack,
  getCurrentTrackSince,
  getOnlinePlayers,
  setOnlinePlayer,
  removeOnlinePlayer,
  clearOnlinePlayers,
  clearOnlinePlayersForBot,
  getOnlinePlayerCount,
  getOnlinePlayerCountForBot,
  areChatCommandsAllowed,
  applyChatCooldown,
  applyChatCooldownForBot,
  setBotTransitioning,
  setBotAcked,
  setBotConfirmedViaReset,
  isBotTransitioning,
  getBotTrackState,
  getAllBotTrackStates,
  clearBotTrackState,
};
