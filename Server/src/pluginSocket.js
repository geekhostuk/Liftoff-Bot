const { WebSocketServer } = require('ws');
const db = require('./database');
const state = require('./state');
const E = require('./eventTypes');
const broadcast = require('./broadcast');
const skipVote = require('./skipVote');
const extendVote = require('./extendVote');
const idleKick = require('./idleKick');
const tagVote = require('./tagVote');
const { validateEvent } = require('./contracts');

const PLUGIN_API_KEY = process.env.PLUGIN_API_KEY || '';

// Event types that should NOT reset the idle-kick timer (lifecycle/system events).
// Everything else with an actor is treated as player activity.
const IDLE_KICK_IGNORE = new Set([
  E.PLAYER_ENTERED, E.PLAYER_LEFT, E.PLAYER_LIST,
  E.COMMAND_ACK, E.SESSION_STARTED,
]);

/**
 * Creates the /ws/plugin WebSocket server.
 * Multiple plugin connections are supported — one per bot.
 * Each bot is identified by its API key (mapped to a botId via the bots table).
 */

// botId → WebSocket
const pluginSockets = new Map();

// botId → Map(message → clearTimeout handle)  — echo suppression per bot
const _recentlySentPerBot = new Map();

// botId → Map(commandId → { resolve, timer })  — pending acks per bot
const _pendingCommandsPerBot = new Map();

// botId → bool — lobby-full tracking per bot
const _lobbyWasFullPerBot = new Map();

// botId → nick string — in-game bot nickname (for idle-kick immunity)
const _botNicks = new Map();

// apiKey → { botId, botNick } — loaded from DB at startup
let _apiKeyMap = new Map();

// Handles for delayed template timers (fireTemplates with delay_ms > 0)
let _pendingTemplateTimers = [];

// Race-start deduplication (multi-bot fires same event per bot)
let _lastRaceStartAt = 0;
const RACE_START_DEDUP_WINDOW_MS = 5_000;

function _isDuplicateRaceStart() {
  if (!_lastRaceStartAt) return false;
  return (Date.now() - _lastRaceStartAt) < RACE_START_DEDUP_WINDOW_MS;
}

// Combined podium: collect race IDs from all rooms, then announce top 3
let _podiumRaceIds = [];
let _podiumTimer = null;
const PODIUM_COLLECT_MS = 10_000;

function _collectForPodium(raceIds) {
  for (const id of raceIds) {
    if (!_podiumRaceIds.includes(id)) _podiumRaceIds.push(id);
  }
  if (!_podiumTimer) {
    _podiumTimer = setTimeout(() => _firePodium(), PODIUM_COLLECT_MS);
    _pendingTemplateTimers.push(_podiumTimer);
  }
}

async function _firePodium() {
  _podiumTimer = null;
  const raceIds = [..._podiumRaceIds];
  _podiumRaceIds = [];
  if (raceIds.length === 0) return;

  const results = await db.getCombinedRacePodium(raceIds);
  if (results.length === 0) return;

  fireTemplates('race_podium', {
    winner:      results[0]?.nick ?? '',
    time:        fmtMs(results[0]?.best_lap_ms),
    second:      results[1]?.nick ?? '',
    second_time: fmtMs(results[1]?.best_lap_ms),
    third:       results[2]?.nick ?? '',
    third_time:  fmtMs(results[2]?.best_lap_ms),
    '4th':       results[3]?.nick ?? '',
    '4th_time':  fmtMs(results[3]?.best_lap_ms),
    '5th':       results[4]?.nick ?? '',
    '5th_time':  fmtMs(results[4]?.best_lap_ms),
    '6th':       results[5]?.nick ?? '',
    '6th_time':  fmtMs(results[5]?.best_lap_ms),
    '7th':       results[6]?.nick ?? '',
    '7th_time':  fmtMs(results[6]?.best_lap_ms),
    '8th':       results[7]?.nick ?? '',
    '8th_time':  fmtMs(results[7]?.best_lap_ms),
    pilots:      String(results.length),
  });
}

function clearPendingTemplates() {
  for (const t of _pendingTemplateTimers) clearTimeout(t);
  _pendingTemplateTimers = [];
  if (_podiumTimer) { clearTimeout(_podiumTimer); _podiumTimer = null; }
  _podiumRaceIds = [];
}

let _commandCounter = 0;
const COMMAND_ACK_TIMEOUT_MS = 10_000;

function getConnectedBotIds() { return [...pluginSockets.keys()]; }
function getConnectedBotCount() { return pluginSockets.size; }
function getBotNick(botId) { return _botNicks.get(botId) || 'JMT_Bot'; }

/**
 * Load bot registry from database into memory.
 * Called at startup and when bots are added/removed.
 */
async function refreshBotRegistry() {
  try {
    const bots = await db.getAllBots();
    _apiKeyMap = new Map();
    _botNicks.clear();
    for (const bot of bots) {
      _apiKeyMap.set(bot.api_key || '', { botId: bot.id, botNick: bot.bot_nick || 'JMT_Bot' });
      _botNicks.set(bot.id, bot.bot_nick || 'JMT_Bot');
    }
  } catch (err) {
    console.error('[plugin-ws] Failed to load bot registry:', err.message);
  }
}

/**
 * Resolve an API key to a botId.
 * Checks the DB-loaded registry first, then falls back to the PLUGIN_API_KEY env var.
 */
function _resolveBotId(token) {
  const entry = _apiKeyMap.get(token);
  if (entry) return entry.botId;
  // Fallback: legacy single-key env var
  if (PLUGIN_API_KEY && token === PLUGIN_API_KEY) return 'default';
  return null;
}

function _getRecentlySent(botId) {
  let map = _recentlySentPerBot.get(botId);
  if (!map) { map = new Map(); _recentlySentPerBot.set(botId, map); }
  return map;
}

function _getPendingCommands(botId) {
  let map = _pendingCommandsPerBot.get(botId);
  if (!map) { map = new Map(); _pendingCommandsPerBot.set(botId, map); }
  return map;
}

function _trackRecentlySent(botId, message) {
  const recentlySent = _getRecentlySent(botId);
  const key = message.toLowerCase().trim();
  const existing = recentlySent.get(key);
  if (existing) clearTimeout(existing);
  recentlySent.set(key, setTimeout(() => recentlySent.delete(key), 10_000));
}

function setCurrentTrack(info) {
  clearPendingTemplates();
  _lastRaceEndAnnounced = null;
  _lastRaceStartAt = 0;
  state.setCurrentTrack(info);
  // Block chat commands for a window after each track change.
  // Liftoff replays the entire chat history when the scene reloads, which causes
  // a burst of chat_message events with fresh timestamps — including old /next and
  // /next messages that would otherwise re-trigger the vote system.
  state.applyChatCooldown();
  // Cancel any active votes — they no longer apply to the new track
  if (skipVote.isActive()) {
    skipVote.cancelSkipVote();
  }
  if (extendVote.isActive()) {
    extendVote.cancelExtendVote();
  }
}

// ── Command sending ─────────────────────────────────────────────────────────

/**
 * Broadcast a command to ALL connected bots.
 * Returns true if sent to at least one bot.
 */
function sendCommand(command) {
  let sent = false;
  const isTrackChange = command.cmd === 'set_track';
  for (const [botId, ws] of pluginSockets) {
    if (ws.readyState !== 1 /* OPEN */) continue;
    if (command.cmd === 'send_chat' && command.message) {
      _trackRecentlySent(botId, command.message);
    }
    if (isTrackChange) {
      console.log(`[timing] set_track SENT to bot="${botId}" at ${Date.now()}`);
    }
    ws.send(JSON.stringify(command));
    sent = true;
  }
  return sent;
}

/**
 * Send a command to a specific bot.
 * Returns true if sent, false if that bot is not connected.
 */
function sendCommandToBot(botId, command) {
  const ws = pluginSockets.get(botId);
  if (!ws || ws.readyState !== 1 /* OPEN */) return false;
  if (command.cmd === 'send_chat' && command.message) {
    _trackRecentlySent(botId, command.message);
  }
  ws.send(JSON.stringify(command));
  return true;
}

/**
 * Send a command to a specific bot and wait for acknowledgment.
 * Resolves with { status, message } on ack, rejects on timeout or error.
 */
function sendCommandAwaitToBot(botId, command, timeoutMs = COMMAND_ACK_TIMEOUT_MS) {
  const ws = pluginSockets.get(botId);
  if (!ws || ws.readyState !== 1 /* OPEN */) {
    return Promise.reject(new Error(`Bot "${botId}" not connected`));
  }

  const commandId = `cmd-${++_commandCounter}-${Date.now()}`;
  command.command_id = commandId;

  return new Promise((resolve) => {
    const pending = _getPendingCommands(botId);
    const timer = setTimeout(() => {
      pending.delete(commandId);
      resolve({ status: 'timeout', message: `Plugin did not acknowledge within ${Math.round(timeoutMs / 1000)} seconds` });
    }, timeoutMs);

    pending.set(commandId, { resolve, timer });

    if (command.cmd === 'send_chat' && command.message) {
      _trackRecentlySent(botId, command.message);
    }
    ws.send(JSON.stringify(command));
  });
}

/**
 * Backward-compat wrapper: await ack from any single connected bot.
 * If bot_id is in the command, targets that bot; otherwise picks the first connected.
 */
function sendCommandAwait(command) {
  const botId = command.bot_id || getConnectedBotIds()[0];
  if (!botId) return Promise.reject(new Error('No bots connected'));
  return sendCommandAwaitToBot(botId, command);
}

function handleCommandAck(event, botId) {
  const commandId = event.command_id;
  if (!commandId) return;
  const pending = _getPendingCommands(botId);
  const entry = pending.get(commandId);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(commandId);
  entry.resolve({ status: event.status || 'ok', message: event.message || '' });
}

// ── Server setup ────────────────────────────────────────────────────────────

async function createPluginSocketServer(httpServer) {
  // Load bot registry from DB
  await refreshBotRegistry();

  // Initialise the vote modules with access to sendCommand (broadcasts)
  skipVote.init(sendCommand);
  extendVote.init(sendCommand);
  tagVote.init(sendCommand);
  await idleKick.init(sendCommand, sendCommandAwait, sendCommandToBot);

  // Cancel any active votes when the overseer stops so orphaned votes
  // don't cause "No runner is running" on the next attempt.
  const overseer = require('./trackOverseer');
  overseer.onStop(() => {
    clearPendingTemplates();
    skipVote.cancelSkipVote();
    extendVote.cancelExtendVote();
    tagVote.cancelVote();
    idleKick.resetAllTimers();
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws/plugin') {
      // Authenticate before upgrading
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

      const botId = _resolveBotId(token);
      if (!botId) {
        console.warn('[plugin-ws] Rejected connection: invalid API key');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      req._botId = botId;
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', (ws, req) => {
    const botId = req._botId;

    // Replace existing socket for the same bot (reconnect)
    const existing = pluginSockets.get(botId);
    if (existing) {
      console.warn(`[plugin-ws] Replacing existing connection for bot "${botId}"`);
      existing.close(1000, 'Replaced by new connection');
    }

    pluginSockets.set(botId, ws);
    ws._botId = botId;
    console.log(`[plugin-ws] Bot "${botId}" connected from ${req.socket.remoteAddress}`);

    ws.on('message', (raw) => {
      const text = raw.toString('utf8').trim();
      if (!text) return;

      // Events arrive as JSONL — one JSON object per line
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        handlePluginEvent(trimmed, botId);
      }
    });

    ws.on('close', () => {
      console.log(`[plugin-ws] Bot "${botId}" disconnected`);
      if (pluginSockets.get(botId) === ws) {
        pluginSockets.delete(botId);
        state.clearOnlinePlayersForBot(botId);
        _lobbyWasFullPerBot.delete(botId);
      }
    });

    ws.on('error', (err) => {
      console.error(`[plugin-ws] Bot "${botId}" socket error:`, err.message);
    });
  });

  return { wss, sendCommand, sendCommandToBot, sendCommandAwait, sendCommandAwaitToBot, getConnectedBotIds, getConnectedBotCount, refreshBotRegistry };
}

// ── Chat template auto-trigger ─────────────────────────────────────────────

function fmtMs(ms) {
  if (ms == null) return '?';
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = (totalSec % 60).toFixed(3).padStart(6, '0');
  return m > 0 ? `${m}:${s}` : `${s}s`;
}

async function buildTemplateVars(baseVars = {}) {
  const enriched = { ...baseVars };
  try {
    const os = require('./trackOverseer').getState();
    enriched.playlist ??= os.playlist_name || '';
  } catch {}
  enriched.players ??= String(state.getOnlinePlayerCount());
  try {
    const week = await db.getActiveWeek() || await db.getOrCreateCurrentWeek();
    if (week) {
      const standings = await db.getWeeklyStandings(week.id);
      enriched['1st'] ??= standings[0]?.display_name ?? '';
      enriched['2nd'] ??= standings[1]?.display_name ?? '';
      enriched['3rd'] ??= standings[2]?.display_name ?? '';

      // Player-specific standings (when nick is available)
      if (enriched.nick) {
        const nickLower = enriched.nick.toLowerCase();
        const player = standings.find(r => r.display_name.toLowerCase() === nickLower);
        enriched.player_points ??= player ? String(player.total_points) : '0';
        enriched.player_position ??= player ? String(player.rank) : 'unranked';
      }
    }
  } catch {}
  return enriched;
}

/**
 * Fire chat templates for a trigger event.
 * @param {string} trigger - template trigger name
 * @param {object} vars - template variables
 * @param {string|null} botId - if provided, send only to that bot; otherwise broadcast
 */
async function fireTemplates(trigger, vars = {}, botId = null) {
  let templates;
  try {
    templates = await db.getChatTemplatesByTrigger(trigger);
  } catch (err) {
    console.error(`[templates] DB error fetching templates for "${trigger}":`, err.message);
    return;
  }
  if (templates.length === 0) return;
  console.log(`[templates] Firing ${templates.length} template(s) for "${trigger}"`);
  const enriched = await buildTemplateVars(vars);
  for (const tmpl of templates) {
    if (tmpl.delay_ms < 0) continue; // negative = pre-scheduled by playlist runner
    let message = tmpl.template;
    for (const [key, val] of Object.entries(enriched)) {
      message = message.replaceAll(`{${key}}`, val ?? '');
    }
    message = message.trim();
    if (!message) {
      console.warn(`[templates] Template id=${tmpl.id} for "${trigger}" resolved to empty — skipped`);
      continue;
    }
    const sendFn = botId
      ? () => sendCommandToBot(botId, { cmd: 'send_chat', message })
      : () => sendCommand({ cmd: 'send_chat', message });
    const send = () => {
      if (!sendFn()) {
        console.warn(`[templates] Plugin not connected — could not send "${trigger}" template id=${tmpl.id}`);
      }
    };
    if (tmpl.delay_ms > 0) {
      _pendingTemplateTimers.push(setTimeout(send, tmpl.delay_ms));
    } else {
      send();
    }
  }
}

// Event types safe for public broadcast (no admin-only or sensitive data)
const PUBLIC_EVENT_TYPES = new Set([
  'lap_recorded', 'race_reset', 'race_end',
  'player_entered', 'player_left', 'player_list',
  'track_changed', 'state_snapshot', 'overseer_state',
  'checkpoint', 'pilot_complete', 'pilot_reset', 'keepalive',
  'competition_standings_update', 'competition_points_awarded',
  'tag_vote_state',
]);

// Fields to strip from events before public broadcast
const SENSITIVE_FIELDS = ['user_id', 'steam_id', 'pilot_guid'];

function stripSensitiveFields(jsonLine, event) {
  // Only parse/rebuild if the event might contain sensitive fields
  const hasSensitive = SENSITIVE_FIELDS.some(f => jsonLine.includes(f));
  if (!hasSensitive) return jsonLine;

  const cleaned = { ...event };
  for (const f of SENSITIVE_FIELDS) delete cleaned[f];
  // Strip from nested player arrays (player_list)
  if (Array.isArray(cleaned.players)) {
    cleaned.players = cleaned.players.map(p => {
      const { user_id, steam_id, pilot_guid, ...safe } = p;
      return safe;
    });
  }
  return JSON.stringify(cleaned);
}

async function handlePluginEvent(jsonLine, botId) {
  let event;
  try {
    event = JSON.parse(jsonLine);
  } catch {
    console.warn('[plugin-ws] Received non-JSON line:', jsonLine.slice(0, 120));
    return;
  }

  // Inject bot_id so downstream handlers and broadcast consumers know the source
  event.bot_id = botId;

  const eventType = event.event_type;
  validateEvent(event);

  // Persist to database
  let closedRaces;
  try {
    switch (eventType) {
      case E.SESSION_STARTED:  await db.handleSessionStarted(event);  break;
      case E.RACE_RESET:       closedRaces = await db.handleRaceReset(event, state.getCurrentTrack()); idleKick.resetAllTimers(); break;
      case E.LAP_RECORDED:     await db.handleLapRecorded(event, state.getCurrentTrack()); break;
      case E.RACE_END:         await db.handleRaceEnd(event);         break;
      case E.TRACK_CATALOG:
        await db.handleTrackCatalog(event);
        require('./trackOverseer').setCatalogCache(event);
        break;
      case E.PLAYER_ENTERED:
        state.setOnlinePlayer(event.actor, { actor: event.actor, nick: event.nick, user_id: event.user_id || null, botId });
        break;
      case E.PLAYER_LEFT:
        state.removeOnlinePlayer(event.actor, botId);
        if (_lobbyWasFullPerBot.get(botId) && state.getOnlinePlayerCountForBot(botId) < idleKick.MAX_LOBBY_SIZE) {
          _lobbyWasFullPerBot.set(botId, false);
        }
        break;
      case E.PLAYER_LIST:
        state.clearOnlinePlayersForBot(botId);
        for (const p of (event.players || [])) {
          state.setOnlinePlayer(p.actor, { actor: p.actor, nick: p.nick, user_id: p.user_id || null, botId });
        }
        break;
      default:
        // checkpoint, pilot_complete, pilot_reset etc — no dedicated table, still broadcast
        break;
    }
  } catch (err) {
    console.error(`[plugin-ws] DB error for event "${eventType}":`, err.message);
  }

  // ── Idle-kick activity tracking ───────────────────────────────────────────
  // Any event carrying an actor indicates that pilot is active,
  // except lifecycle/system events handled separately below.
  if (event.actor != null && !IDLE_KICK_IGNORE.has(eventType)) {
    idleKick.recordActivity(event.actor, botId);
  }
  if (eventType === E.PLAYER_ENTERED) idleKick.handlePlayerEntered(event.actor, botId);
  if (eventType === E.PLAYER_LEFT) idleKick.handlePlayerLeft(event.actor, botId);
  if (eventType === E.PLAYER_LIST) {
    idleKick.handlePlayerListSync((event.players || []).map(p => p.actor), botId);
  }

  // Handle command acknowledgments from the plugin
  if (eventType === E.COMMAND_ACK) {
    handleCommandAck(event, botId);
  }

  // Handle chat commands — replies go to the bot the player is on
  if (eventType === E.CHAT_MESSAGE) {
    const msg = (event.message || '').trim().toLowerCase();
    // Ignore echoes of messages the server itself sent to this bot
    const recentlySent = _getRecentlySent(botId);
    if (recentlySent.has(msg)) return;
    // Ignore all commands during the post-track-change cooldown window.
    if (!state.areChatCommandsAllowed(botId)) return;
    if (msg === '/info') {
      const overseer = require('./trackOverseer');
      const os = overseer.getState();
      let timeLeft = 'N/A';
      if (os.next_change_at) {
        const remainMs = new Date(os.next_change_at).getTime() - Date.now();
        if (remainMs > 0) {
          const m = Math.floor(remainMs / 60000);
          const s = Math.floor((remainMs % 60000) / 1000);
          timeLeft = `${m}m ${s}s`;
        } else {
          timeLeft = '0m 0s';
        }
      }
      const upcoming = overseer.getUpcoming(1);
      const nextTrack = upcoming.length > 0 ? upcoming[0].track : '';
      const nextStr = nextTrack ? ` | <color=#00BFFF>Next:</color> ${nextTrack}` : '';
      sendCommandToBot(botId, { cmd: 'send_chat', message: `<color=#00BFFF>Cmds:</color> <color=#00FF00>/next</color> skip <color=#00FF00>/extend</color> +5m | <color=#00BFFF>Time:</color> <color=#FFFF00>${timeLeft}</color>${nextStr}` });
    } else if (msg === '/next') {
      skipVote.handleSkipVoteCommand(event.user_id || event.nick);
    } else if (msg === '/extend') {
      extendVote.handleExtendVoteCommand(event.user_id || event.nick);
    } else if (msg.startsWith('/verify ')) {
      const code = msg.slice(8).trim().toUpperCase();
      if (code.length === 6) {
        const nick = event.nick || '';
        if (!nick) {
          sendCommandToBot(botId, { cmd: 'send_chat', message: '<color=#FF0000>Could not detect your in-game name.</color>' });
        } else {
          db.verifyNicknameByCode(code, nick).then(result => {
            if (!result) {
              sendCommandToBot(botId, { cmd: 'send_chat', message: `<color=#FF0000>Invalid or expired code.</color> <color=#FFFF00>Check your profile page for a valid code.</color>` });
            } else if (result.error === 'nickname_taken') {
              sendCommandToBot(botId, { cmd: 'send_chat', message: `<color=#FF0000>That name is already linked to another account.</color> <color=#FFFF00>Contact an admin for help.</color>` });
            } else {
              sendCommandToBot(botId, { cmd: 'send_chat', message: `<color=#00FF00>VERIFIED</color> <color=#FFFF00>${nick}, your account has been linked!</color>` });
              idleKick.refreshRegisteredNicks();
            }
          }).catch(() => {
            sendCommandToBot(botId, { cmd: 'send_chat', message: '<color=#FF0000>Verification error. Try again later.</color>' });
          });
        }
      }
    } else if (msg === '/tagvote') {
      tagVote.handleTagVoteCommand(event.user_id || event.nick);
    } else if (msg === '/tags') {
      tagVote.handleTagsInfoCommand();
    } else if (/^\/[1-4]$/.test(msg)) {
      const optionIndex = parseInt(msg[1]) - 1;
      tagVote.handleNumberedVote(optionIndex, event.user_id || event.nick);
    }
  }

  // Auto-trigger chat templates for game events — player-specific go to their bot
  if (eventType === E.PLAYER_ENTERED) {
    const nick = event.nick || '';
    fireTemplates('player_joined', { nick }, botId);
    db.isKnownPilot(nick).then(known => {
      fireTemplates(known ? 'player_returned' : 'player_new', { nick }, botId);
    }).catch(() => {});
    if (!idleKick.isNickVerified(nick)) {
      fireTemplates('player_unregistered', { nick }, botId);
    }
    const count = state.getOnlinePlayerCountForBot(botId);
    if (count >= idleKick.MAX_LOBBY_SIZE && !_lobbyWasFullPerBot.get(botId)) {
      _lobbyWasFullPerBot.set(botId, true);
      fireTemplates('lobby_full', { nick, count: String(count) }, botId);
    }
  } else if (eventType === E.RACE_RESET) {
    // Collect closed race IDs for combined podium announcement across all rooms
    if (closedRaces?.length) {
      const raceIds = closedRaces.filter(r => r.winner_nick).map(r => r.race_id);
      if (raceIds.length) _collectForPodium(raceIds);
    }
    if (!_isDuplicateRaceStart()) {
      _lastRaceStartAt = Date.now();
      fireTemplates('race_start', { race_id: (event.race_id || '').slice(0, 8) });
    }
  } else if (eventType === E.RACE_END) {
    // Collect for combined podium (race_end fires before race_reset)
    if (event.race_id) _collectForPodium([event.race_id]);
  }

  // Broadcast to browser clients — admin gets everything, public gets whitelist only
  // Re-serialize since we injected bot_id
  const enrichedJson = JSON.stringify(event);
  broadcast.broadcastAdmin(enrichedJson);
  if (PUBLIC_EVENT_TYPES.has(eventType)) {
    broadcast.broadcastPublic(stripSensitiveFields(enrichedJson, event));
  }
}

module.exports = {
  createPluginSocketServer,
  sendCommand,
  sendCommandToBot,
  sendCommandAwait,
  sendCommandAwaitToBot,
  getConnectedBotIds,
  getConnectedBotCount,
  getBotNick,
  refreshBotRegistry,
  setCurrentTrack,
  fireTemplates,
  buildTemplateVars,
  stripSensitiveFields,
  clearPendingTemplates,
};
