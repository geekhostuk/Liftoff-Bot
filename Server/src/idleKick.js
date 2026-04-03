/**
 * Idle-kick module.
 *
 * Automatically warns and kicks pilots who have been inactive for too long.
 * Activity is tracked per "botId:actor" composite key; any gameplay event
 * (lap, checkpoint, chat message, etc.) resets the timer.
 *
 * Each bot's host nick (loaded from the bots table) and whitelisted nicks
 * are always immune.
 *
 * Idle kick only activates when ALL connected bots have full lobbies —
 * if any server has a free slot, there's no need to kick.
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

function _key(botId, actor) {
  return `${botId}:${actor}`;
}

function _parseKey(compositeKey) {
  const idx = compositeKey.indexOf(':');
  return { botId: compositeKey.slice(0, idx), actor: Number(compositeKey.slice(idx + 1)) };
}

// "botId:actor" → epoch ms of last activity
const _lastActivity = new Map();
// composite keys that have already been warned (prevents repeat warnings each sweep)
const _warned = new Set();
// lowercased nicks immune to idle kick
const _whitelist = new Set();
// lowercased nicks of verified registered users
const _verifiedNicks = new Set();

let _checkInterval = null;
let _nickRefreshInterval = null;
let _sendCommand = null;       // broadcast to all bots
let _sendCommandAwait = null;  // await ack from a bot
let _sendCommandToBot = null;  // send to a specific bot
let _unregKickEnabled = true;  // toggle for aggressive unregistered kick

/**
 * Initialise the module.
 * @param {Function} sendCommandFn        broadcast command sender
 * @param {Function} sendCommandAwaitFn   command sender that returns a Promise
 * @param {Function} sendCommandToBotFn   targeted command sender (botId, cmd)
 */
async function init(sendCommandFn, sendCommandAwaitFn, sendCommandToBotFn) {
  _sendCommand = sendCommandFn;
  _sendCommandAwait = sendCommandAwaitFn;
  _sendCommandToBot = sendCommandToBotFn || null;

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

function recordActivity(actor, botId = 'default') {
  const k = _key(botId, actor);
  _lastActivity.set(k, Date.now());
  _warned.delete(k);
}

function handlePlayerEntered(actor, botId = 'default') {
  recordActivity(actor, botId);
}

function handlePlayerLeft(actor, botId = 'default') {
  const k = _key(botId, actor);
  _lastActivity.delete(k);
  _warned.delete(k);
}

/**
 * Sync with a full player_list event for a specific bot.
 * Removes stale entries for that bot and adds fresh timestamps for new actors.
 */
function handlePlayerListSync(actors, botId = 'default') {
  const actorSet = new Set(actors);
  // Remove actors for this bot that are no longer present
  for (const compositeKey of _lastActivity.keys()) {
    const parsed = _parseKey(compositeKey);
    if (parsed.botId === botId && !actorSet.has(parsed.actor)) {
      _lastActivity.delete(compositeKey);
      _warned.delete(compositeKey);
    }
  }
  // Add new actors with a fresh timestamp
  for (const actor of actors) {
    const k = _key(botId, actor);
    if (!_lastActivity.has(k)) {
      _lastActivity.set(k, Date.now());
    }
  }
}

/**
 * Reset all idle timers to now and clear warned state.
 * Called on RACE_RESET (global event) and when the playlist stops.
 */
function resetAllTimers() {
  const now = Date.now();
  for (const k of _lastActivity.keys()) {
    _lastActivity.set(k, now);
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
 */
function getIdleInfo() {
  const now = Date.now();
  const onlinePlayers = state.getOnlinePlayers();

  // Build a lookup by composite key "botId:actor"
  const playerByKey = new Map();
  for (const p of onlinePlayers) {
    playerByKey.set(_key(p.botId || 'default', p.actor), p);
  }

  const idleTimes = {};
  const registrationStatus = {};
  for (const [compositeKey, lastTs] of _lastActivity) {
    idleTimes[compositeKey] = now - lastTs;
    const player = playerByKey.get(compositeKey);
    if (player) {
      registrationStatus[compositeKey] = _verifiedNicks.has((player.nick || '').toLowerCase());
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

  // Lazy-load to avoid circular dependency at module level
  const { getConnectedBotIds, getBotNick } = require('./pluginSocket');
  const connectedBotIds = getConnectedBotIds();
  if (connectedBotIds.length === 0) return;

  // Only kick when ALL connected bots have full lobbies.
  // If any server has a free slot, players can join there instead.
  for (const botId of connectedBotIds) {
    if (state.getOnlinePlayerCountForBot(botId) < MAX_LOBBY_SIZE) return;
  }

  // Build composite key → player lookup
  const onlinePlayers = state.getOnlinePlayers();
  const playerByKey = new Map();
  for (const p of onlinePlayers) {
    playerByKey.set(_key(p.botId || 'default', p.actor), p);
  }

  const now = Date.now();
  const sendToBot = _sendCommandToBot || _sendCommand;

  for (const [compositeKey, lastTs] of _lastActivity) {
    const player = playerByKey.get(compositeKey);

    // Player no longer online — clean up
    if (!player) {
      _lastActivity.delete(compositeKey);
      _warned.delete(compositeKey);
      continue;
    }

    const { botId, actor } = _parseKey(compositeKey);
    const nick = player.nick || '';

    // Bot host nick is always immune (per-bot)
    const botNick = getBotNick(botId);
    if (nick.toLowerCase() === botNick.toLowerCase()) continue;

    // Whitelisted players are immune
    if (_whitelist.has(nick.toLowerCase())) continue;

    const isRegistered = _verifiedNicks.has(nick.toLowerCase());
    const useUnregTimers = _unregKickEnabled && !isRegistered;
    const idleTimeout = useUnregTimers ? UNREG_IDLE_TIMEOUT_MS : IDLE_TIMEOUT_MS;
    const graceTimeout = useUnregTimers ? UNREG_WARN_BEFORE_KICK_MS : WARN_BEFORE_KICK_MS;
    const idleMs = now - lastTs;

    // Phase 2: kick (warned and grace period expired)
    if (idleMs >= idleTimeout + graceTimeout && _warned.has(compositeKey)) {
      // Broadcast kick announcement to all lobbies
      _sendCommand({
        cmd: 'send_chat',
        message: `<color=#FF0000>KICKED</color> <color=#FFFF00>${nick} was removed for being idle (all lobbies full).</color>`,
      });
      // Send kick command to the specific bot this player is on
      if (_sendCommandToBot) {
        _sendCommandToBot(botId, { cmd: 'kick_player', actor });
      } else {
        _sendCommandAwait({ cmd: 'kick_player', actor }).catch(() => {});
      }
      _lastActivity.delete(compositeKey);
      _warned.delete(compositeKey);
      continue;
    }

    // Phase 1: warn (idle threshold reached, not yet warned)
    if (idleMs >= idleTimeout && !_warned.has(compositeKey)) {
      if (!useUnregTimers) {
        sendToBot(botId, {
          cmd: 'send_chat',
          message: `<color=#FF0000>WARNING</color> <color=#FFFF00>${nick}, all lobbies are full! You will be kicked for being idle in 1 minute.</color>`,
        });
      } else {
        const siteUrl = process.env.SITE_URL || '';
        const regHint = siteUrl ? ` Register at ${siteUrl} for longer idle time.` : '';
        sendToBot(botId, {
          cmd: 'send_chat',
          message: `<color=#FF0000>WARNING</color> <color=#FFFF00>${nick}, you will be kicked in 10 seconds!${regHint}</color>`,
        });
      }
      _warned.add(compositeKey);
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
  _sendCommandToBot = null;
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
