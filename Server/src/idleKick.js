/**
 * Idle-kick module.
 *
 * Automatically warns and kicks pilots who have been inactive for too long.
 * Activity is tracked per Photon actor number; any gameplay event (lap, checkpoint,
 * chat message, etc.) resets the timer.
 *
 * JMT-Bot (the host) and whitelisted nicks are always immune.
 *
 * Dependencies are injected via init() so this module stays decoupled
 * from the WebSocket transport layer.
 */

const state = require('./state');
const db = require('./db');

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;       // 5 minutes before warning (registered)
const WARN_BEFORE_KICK_MS = 1 * 60 * 1000;   // 1 minute grace after warning (registered)
const UNREG_IDLE_TIMEOUT_MS = 30 * 1000;     // 30 seconds before warning (unregistered)
const UNREG_WARN_BEFORE_KICK_MS = 10 * 1000; // 10 second grace after warning (unregistered)
const CHECK_INTERVAL_MS = 30 * 1000;          // sweep every 30 seconds
const NICK_REFRESH_MS = 60 * 1000;            // refresh registered nicks every 60 seconds
const MAX_LOBBY_SIZE = 8;                     // 7 players + bot — lobby is full at this count
const BOT_NICK = 'JMT_Bot';

// actor → epoch ms of last activity
const _lastActivity = new Map();
// actors that have already been warned (prevents repeat warnings each sweep)
const _warned = new Set();
// lowercased nicks immune to idle kick
const _whitelist = new Set();
// lowercased nicks of verified registered users
const _verifiedNicks = new Set();

let _checkInterval = null;
let _nickRefreshInterval = null;
let _sendCommand = null;
let _sendCommandAwait = null;
let _unregKickEnabled = true; // toggle for aggressive unregistered kick

/**
 * Initialise the module.
 * @param {Function} sendCommandFn      fire-and-forget command sender
 * @param {Function} sendCommandAwaitFn command sender that returns a Promise
 */
async function init(sendCommandFn, sendCommandAwaitFn) {
  _sendCommand = sendCommandFn;
  _sendCommandAwait = sendCommandAwaitFn;

  // Load whitelist from database
  try {
    const nicks = await db.getWhitelistDB();
    for (const nick of nicks) _whitelist.add(nick.toLowerCase());

    // One-time migration: seed DB from env var if set, then ignore it
    const envList = process.env.IDLE_KICK_WHITELIST || '';
    for (const raw of envList.split(',')) {
      const trimmed = raw.trim();
      if (trimmed && !_whitelist.has(trimmed.toLowerCase())) {
        await db.addToWhitelistDB(trimmed);
        _whitelist.add(trimmed.toLowerCase());
      }
    }
    if (envList.trim()) {
      console.log('[idle-kick] IDLE_KICK_WHITELIST env var is deprecated — whitelist is now managed via the database. You can remove this env var.');
    }
  } catch (err) {
    console.error('[idle-kick] Failed to load whitelist from database:', err.message);
  }

  // Load verified nicknames for registration-aware idle kick
  await refreshRegisteredNicks();
  if (_nickRefreshInterval) clearInterval(_nickRefreshInterval);
  _nickRefreshInterval = setInterval(refreshRegisteredNicks, NICK_REFRESH_MS);

  // Start the periodic sweep
  if (_checkInterval) clearInterval(_checkInterval);
  _checkInterval = setInterval(_runIdleCheck, CHECK_INTERVAL_MS);
}

/**
 * Refresh the in-memory set of verified registered nicknames from the database.
 */
async function refreshRegisteredNicks() {
  try {
    const nicks = await db.getVerifiedNicknames();
    _verifiedNicks.clear();
    for (const nick of nicks) _verifiedNicks.add(nick.toLowerCase());
  } catch (err) {
    console.error('[idle-kick] Failed to refresh registered nicks:', err.message);
  }
}

// ── Activity tracking ────────────────────────────────────────────────────────

function recordActivity(actor) {
  _lastActivity.set(actor, Date.now());
  _warned.delete(actor);
}

function handlePlayerEntered(actor) {
  recordActivity(actor);
}

function handlePlayerLeft(actor) {
  _lastActivity.delete(actor);
  _warned.delete(actor);
}

/**
 * Sync with a full player_list event.
 * Removes stale entries and adds fresh timestamps for new actors.
 */
function handlePlayerListSync(actors) {
  const actorSet = new Set(actors);
  // Remove actors no longer present
  for (const actor of _lastActivity.keys()) {
    if (!actorSet.has(actor)) {
      _lastActivity.delete(actor);
      _warned.delete(actor);
    }
  }
  // Add new actors with a fresh timestamp
  for (const actor of actors) {
    if (!_lastActivity.has(actor)) {
      _lastActivity.set(actor, Date.now());
    }
  }
}

/**
 * Reset all idle timers to now and clear warned state.
 * Called on RACE_RESET (global event) and when the playlist stops.
 */
function resetAllTimers() {
  const now = Date.now();
  for (const actor of _lastActivity.keys()) {
    _lastActivity.set(actor, now);
  }
  _warned.clear();
}

// ── Whitelist management ─────────────────────────────────────────────────────

function getWhitelist() {
  return [..._whitelist];
}

async function addToWhitelist(nick) {
  _whitelist.add(nick.toLowerCase());
  try { await db.addToWhitelistDB(nick); } catch (err) {
    console.error('[idle-kick] Failed to persist whitelist add:', err.message);
  }
}

async function removeFromWhitelist(nick) {
  _whitelist.delete(nick.toLowerCase());
  try { await db.removeFromWhitelistDB(nick); } catch (err) {
    console.error('[idle-kick] Failed to persist whitelist remove:', err.message);
  }
}

/**
 * Returns idle info for all tracked players.
 * Used by the admin API to display idle times in the dashboard.
 * Returns: { idleTimes: { actor: ms, ... }, warned: [actor, ...], whitelist: [nick, ...] }
 */
function getIdleInfo() {
  const now = Date.now();
  const onlinePlayers = state.getOnlinePlayers();
  const playerByActor = new Map();
  for (const p of onlinePlayers) playerByActor.set(p.actor, p);

  const idleTimes = {};
  const registrationStatus = {};
  for (const [actor, lastTs] of _lastActivity) {
    idleTimes[actor] = now - lastTs;
    const player = playerByActor.get(actor);
    if (player) {
      registrationStatus[actor] = _verifiedNicks.has((player.nick || '').toLowerCase());
    }
  }
  return {
    idleTimes,
    warned: [..._warned],
    whitelist: [..._whitelist],
    registrationStatus,
    unregKickEnabled: _unregKickEnabled,
  };
}

// ── Core idle check ──────────────────────────────────────────────────────────

function _runIdleCheck() {
  // Only kick when the overseer is running
  const { getState: getOverseerState } = require('./trackOverseer');
  if (!getOverseerState().running) return;
  if (!_sendCommand) return;

  const onlinePlayers = state.getOnlinePlayers();

  // Only kick when the lobby is full
  if (onlinePlayers.length < MAX_LOBBY_SIZE) return;

  // Build actor → player lookup
  const playerByActor = new Map();
  for (const p of onlinePlayers) {
    playerByActor.set(p.actor, p);
  }

  const now = Date.now();

  for (const [actor, lastTs] of _lastActivity) {
    const player = playerByActor.get(actor);

    // Player no longer online — clean up
    if (!player) {
      _lastActivity.delete(actor);
      _warned.delete(actor);
      continue;
    }

    const nick = player.nick || '';

    // Bot is always immune
    if (nick.toLowerCase() === BOT_NICK.toLowerCase()) continue;

    // Whitelisted players are immune
    if (_whitelist.has(nick.toLowerCase())) continue;

    const isRegistered = _verifiedNicks.has(nick.toLowerCase());
    const useUnregTimers = _unregKickEnabled && !isRegistered;
    const idleTimeout = useUnregTimers ? UNREG_IDLE_TIMEOUT_MS : IDLE_TIMEOUT_MS;
    const graceTimeout = useUnregTimers ? UNREG_WARN_BEFORE_KICK_MS : WARN_BEFORE_KICK_MS;
    const idleMs = now - lastTs;

    // Phase 2: kick (warned and grace period expired)
    if (idleMs >= idleTimeout + graceTimeout && _warned.has(actor)) {
      _sendCommand({
        cmd: 'send_chat',
        message: `<color=#FF0000>KICKED</color> <color=#FFFF00>${nick} was removed for being idle (lobby full).</color>`,
      });
      _sendCommandAwait({ cmd: 'kick_player', actor }).catch(() => {});
      _lastActivity.delete(actor);
      _warned.delete(actor);
      continue;
    }

    // Phase 1: warn (idle threshold reached, not yet warned)
    if (idleMs >= idleTimeout && !_warned.has(actor)) {
      if (!useUnregTimers) {
        _sendCommand({
          cmd: 'send_chat',
          message: `<color=#FF0000>WARNING</color> <color=#FFFF00>${nick}, lobby is full! You will be kicked for being idle in 1 minute.</color>`,
        });
      } else {
        const siteUrl = process.env.SITE_URL || '';
        const regHint = siteUrl ? ` Register at ${siteUrl} for longer idle time.` : '';
        _sendCommand({
          cmd: 'send_chat',
          message: `<color=#FF0000>WARNING</color> <color=#FFFF00>${nick}, you will be kicked in 10 seconds!${regHint}</color>`,
        });
      }
      _warned.add(actor);
    }
  }
}

// ── Unregistered kick toggle ────────────────────────────────────────────────

function getUnregKickEnabled() {
  return _unregKickEnabled;
}

function setUnregKickEnabled(enabled) {
  _unregKickEnabled = !!enabled;
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

function destroy() {
  if (_checkInterval) {
    clearInterval(_checkInterval);
    _checkInterval = null;
  }
  if (_nickRefreshInterval) {
    clearInterval(_nickRefreshInterval);
    _nickRefreshInterval = null;
  }
  _lastActivity.clear();
  _warned.clear();
  _whitelist.clear();
  _verifiedNicks.clear();
  _sendCommand = null;
  _sendCommandAwait = null;
}

function isNickVerified(nick) {
  return _verifiedNicks.has((nick || '').toLowerCase());
}

module.exports = {
  init,
  recordActivity,
  handlePlayerEntered,
  handlePlayerLeft,
  handlePlayerListSync,
  resetAllTimers,
  getWhitelist,
  addToWhitelist,
  removeFromWhitelist,
  getIdleInfo,
  refreshRegisteredNicks,
  getUnregKickEnabled,
  setUnregKickEnabled,
  isNickVerified,
  MAX_LOBBY_SIZE,
  destroy,
};
