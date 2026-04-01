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
 * The plugin connects here to send events and receive commands.
 *
 * Only one plugin connection is expected at a time.
 * A reference to it is kept so admin routes can push commands.
 */

let pluginSocket = null;
let _lobbyWasFull = false;

// Messages recently sent by the server — used to suppress echo-back from the plugin.
// The plugin hooks GenerateUserMessage which fires for every message rendered in chat,
// including ones the server submitted, so they arrive back as chat_message events.
const _recentlySent = new Map(); // message (lowercase) → clearTimeout handle

function getPluginSocket() { return pluginSocket; }

function setCurrentTrack(info) {
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

// Pending command acknowledgments: command_id → { resolve, reject, timer }
const _pendingCommands = new Map();
let _commandCounter = 0;
const COMMAND_ACK_TIMEOUT_MS = 10_000;

/**
 * Send a command object to the connected plugin.
 * Returns true if sent, false if no plugin is connected.
 */
function sendCommand(command) {
  if (!pluginSocket || pluginSocket.readyState !== 1 /* OPEN */) {
    return false;
  }
  if (command.cmd === 'send_chat' && command.message) {
    const key = command.message.toLowerCase().trim();
    const existing = _recentlySent.get(key);
    if (existing) clearTimeout(existing);
    _recentlySent.set(key, setTimeout(() => _recentlySent.delete(key), 10_000));
  }
  pluginSocket.send(JSON.stringify(command));
  return true;
}

/**
 * Send a command and return a Promise that resolves when the plugin acks.
 * Resolves with { status, message } on ack, rejects on timeout or error.
 */
function sendCommandAwait(command) {
  if (!pluginSocket || pluginSocket.readyState !== 1 /* OPEN */) {
    return Promise.reject(new Error('Plugin not connected'));
  }

  const commandId = `cmd-${++_commandCounter}-${Date.now()}`;
  command.command_id = commandId;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pendingCommands.delete(commandId);
      resolve({ status: 'timeout', message: 'Plugin did not acknowledge within 10 seconds' });
    }, COMMAND_ACK_TIMEOUT_MS);

    _pendingCommands.set(commandId, { resolve, timer });

    if (command.cmd === 'send_chat' && command.message) {
      const key = command.message.toLowerCase().trim();
      const existing = _recentlySent.get(key);
      if (existing) clearTimeout(existing);
      _recentlySent.set(key, setTimeout(() => _recentlySent.delete(key), 10_000));
    }
    pluginSocket.send(JSON.stringify(command));
  });
}

function handleCommandAck(event) {
  const commandId = event.command_id;
  if (!commandId) return;
  const pending = _pendingCommands.get(commandId);
  if (!pending) return;
  clearTimeout(pending.timer);
  _pendingCommands.delete(commandId);
  pending.resolve({ status: event.status || 'ok', message: event.message || '' });
}

async function createPluginSocketServer(httpServer) {
  // Initialise the vote modules with access to sendCommand
  skipVote.init(sendCommand);
  extendVote.init(sendCommand);
  tagVote.init(sendCommand);
  await idleKick.init(sendCommand, sendCommandAwait);

  // Cancel any active votes when the overseer stops so orphaned votes
  // don't cause "No runner is running" on the next attempt.
  const overseer = require('./trackOverseer');
  overseer.onStop(() => {
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

      if (!PLUGIN_API_KEY || token !== PLUGIN_API_KEY) {
        console.warn('[plugin-ws] Rejected connection: invalid API key');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', (ws, req) => {
    if (pluginSocket) {
      console.warn('[plugin-ws] Replacing existing plugin connection');
      pluginSocket.close(1000, 'Replaced by new connection');
    }

    pluginSocket = ws;
    console.log('[plugin-ws] Plugin connected from', req.socket.remoteAddress);

    ws.on('message', (raw) => {
      const text = raw.toString('utf8').trim();
      if (!text) return;

      // Events arrive as JSONL — one JSON object per line
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        handlePluginEvent(trimmed);
      }
    });

    ws.on('close', () => {
      console.log('[plugin-ws] Plugin disconnected');
      if (pluginSocket === ws) {
        pluginSocket = null;
        state.clearOnlinePlayers();
      }
    });

    ws.on('error', (err) => {
      console.error('[plugin-ws] Plugin socket error:', err.message);
    });
  });

  return { wss, sendCommand, getPluginSocket };
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

async function fireTemplates(trigger, vars = {}) {
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
    const send = () => {
      if (!sendCommand({ cmd: 'send_chat', message })) {
        console.warn(`[templates] Plugin not connected — could not send "${trigger}" template id=${tmpl.id}`);
      }
    };
    if (tmpl.delay_ms > 0) {
      setTimeout(send, tmpl.delay_ms);
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

async function handlePluginEvent(jsonLine) {
  let event;
  try {
    event = JSON.parse(jsonLine);
  } catch {
    console.warn('[plugin-ws] Received non-JSON line:', jsonLine.slice(0, 120));
    return;
  }

  const eventType = event.event_type;
  validateEvent(event);

  // Persist to database
  try {
    switch (eventType) {
      case E.SESSION_STARTED:  await db.handleSessionStarted(event);  break;
      case E.RACE_RESET:       await db.handleRaceReset(event, state.getCurrentTrack());  break;
      case E.LAP_RECORDED:     await db.handleLapRecorded(event, state.getCurrentTrack()); break;
      case E.RACE_END:         await db.handleRaceEnd(event);         break;
      case E.TRACK_CATALOG:    await db.handleTrackCatalog(event);    break;
      case E.PLAYER_ENTERED:
        state.setOnlinePlayer(event.actor, { actor: event.actor, nick: event.nick, user_id: event.user_id || null });
        break;
      case E.PLAYER_LEFT:
        state.removeOnlinePlayer(event.actor);
        if (_lobbyWasFull && state.getOnlinePlayerCount() < idleKick.MAX_LOBBY_SIZE) {
          _lobbyWasFull = false;
        }
        break;
      case E.PLAYER_LIST:
        state.clearOnlinePlayers();
        for (const p of (event.players || [])) {
          state.setOnlinePlayer(p.actor, { actor: p.actor, nick: p.nick, user_id: p.user_id || null });
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
    idleKick.recordActivity(event.actor);
  }
  if (eventType === E.PLAYER_ENTERED) idleKick.handlePlayerEntered(event.actor);
  if (eventType === E.PLAYER_LEFT) idleKick.handlePlayerLeft(event.actor);
  if (eventType === E.PLAYER_LIST) {
    idleKick.handlePlayerListSync((event.players || []).map(p => p.actor));
  }

  // Handle command acknowledgments from the plugin
  if (eventType === E.COMMAND_ACK) {
    handleCommandAck(event);
  }

  // Handle chat commands
  if (eventType === E.CHAT_MESSAGE) {
    const msg = (event.message || '').trim().toLowerCase();
    // Ignore echoes of messages the server itself sent
    if (_recentlySent.has(msg)) return;
    // Ignore all commands during the post-track-change cooldown window.
    if (!state.areChatCommandsAllowed()) return;
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
      sendCommand({ cmd: 'send_chat', message: `<color=#00BFFF>Cmds:</color> <color=#00FF00>/next</color> skip <color=#00FF00>/extend</color> +5m | <color=#00BFFF>Time:</color> <color=#FFFF00>${timeLeft}</color>${nextStr}` });
    } else if (msg === '/next') {
      // Use user_id (Steam ID) as the voter key — event.actor can be null if the
      // plugin couldn't resolve the Photon actor number, which causes all unresolved
      // players to collide on the same null key in the voters Set.
      skipVote.handleSkipVoteCommand(event.user_id || event.nick);
    } else if (msg === '/extend') {
      extendVote.handleExtendVoteCommand(event.user_id || event.nick);
    } else if (msg.startsWith('/verify ')) {
      const code = msg.slice(8).trim().toUpperCase();
      if (code.length === 6) {
        const nick = event.nick || '';
        if (!nick) {
          sendCommand({ cmd: 'send_chat', message: '<color=#FF0000>Could not detect your in-game name.</color>' });
        } else {
          db.verifyNicknameByCode(code, nick).then(result => {
            if (!result) {
              sendCommand({ cmd: 'send_chat', message: `<color=#FF0000>Invalid or expired code.</color> <color=#FFFF00>Check your profile page for a valid code.</color>` });
            } else if (result.error === 'nickname_taken') {
              sendCommand({ cmd: 'send_chat', message: `<color=#FF0000>That name is already linked to another account.</color> <color=#FFFF00>Contact an admin for help.</color>` });
            } else {
              sendCommand({ cmd: 'send_chat', message: `<color=#00FF00>VERIFIED</color> <color=#FFFF00>${nick}, your account has been linked!</color>` });
              idleKick.refreshRegisteredNicks();
            }
          }).catch(() => {
            sendCommand({ cmd: 'send_chat', message: '<color=#FF0000>Verification error. Try again later.</color>' });
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

  // Auto-trigger chat templates for game events
  if (eventType === E.PLAYER_ENTERED) {
    const nick = event.nick || '';
    fireTemplates('player_joined', { nick });
    db.isKnownPilot(nick).then(known => {
      fireTemplates(known ? 'player_returned' : 'player_new', { nick });
    }).catch(() => {});
    if (!idleKick.isNickVerified(nick)) {
      fireTemplates('player_unregistered', { nick });
    }
    const count = state.getOnlinePlayerCount();
    if (count >= idleKick.MAX_LOBBY_SIZE && !_lobbyWasFull) {
      _lobbyWasFull = true;
      fireTemplates('lobby_full', { nick, count: String(count) });
    }
  } else if (eventType === E.RACE_RESET) {
    fireTemplates('race_start', { race_id: (event.race_id || '').slice(0, 8) });
  } else if (eventType === E.RACE_END) {
    fireTemplates('race_end', {
      winner: event.winner_nick || '',
      time: fmtMs(event.winner_total_ms),
    });
  }

  // Broadcast to browser clients — admin gets everything, public gets whitelist only
  broadcast.broadcastAdmin(jsonLine);
  if (PUBLIC_EVENT_TYPES.has(eventType)) {
    broadcast.broadcastPublic(stripSensitiveFields(jsonLine, event));
  }
}

module.exports = { createPluginSocketServer, sendCommand, sendCommandAwait, getPluginSocket, setCurrentTrack, fireTemplates, buildTemplateVars, stripSensitiveFields };
