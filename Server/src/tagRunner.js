/**
 * Tag Runner
 *
 * Manages a server-side timer that randomly selects tracks matching one or
 * more tags, sending set_track commands to the plugin at a configured interval.
 *
 * Operates as a standalone mode — mutually exclusive with the playlist runner.
 * Race mode is always InfiniteRace.
 *
 * State is persisted to kv_store so the runner auto-resumes after a reboot.
 */

const db = require('./database');
const { sendCommand, setCurrentTrack, fireTemplates } = require('./pluginSocket');
const broadcast = require('./broadcast');

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const RECENT_HISTORY_SIZE = 5;
const KV_KEY = 'tag_runner_config';
const RACE_MODE = 'InfiniteRace';

// ── State ────────────────────────────────────────────────────────────────────

const state = {
  running: false,
  tagNames: [],
  defaultIntervalMs: DEFAULT_INTERVAL_MS,
  currentTrack: null,     // { id, env, track, workshop_id, duration_ms }
  currentIntervalMs: 0,   // actual interval for current track (may differ from default)
  nextChangeAt: null,     // Date
  recentHistory: [],      // last N { env, track } pairs
};

let _timer = null;
let _preTimers = [];
let _onStopCallback = null;

// ── Public API ───────────────────────────────────────────────────────────────

function getState() {
  return {
    running: state.running,
    tag_names: state.tagNames,
    default_interval_ms: state.defaultIntervalMs,
    current_track: state.currentTrack ? {
      env: state.currentTrack.env,
      track: state.currentTrack.track,
      workshop_id: state.currentTrack.workshop_id,
      duration_ms: state.currentTrack.duration_ms,
    } : null,
    current_interval_ms: state.currentIntervalMs,
    next_change_at: state.nextChangeAt ? state.nextChangeAt.toISOString() : null,
  };
}

async function startTagRunner(tagNames, intervalMs = DEFAULT_INTERVAL_MS) {
  if (!tagNames || tagNames.length === 0) {
    throw new Error('At least one tag name is required');
  }

  // Check competition runner is not auto-managed
  const competitionRunner = require('./competitionRunner');
  const compState = competitionRunner.getState();
  if (compState.auto_managed) {
    throw new Error('Cannot start tag runner while competition is auto-managed');
  }

  // Mutual exclusion: stop playlist runner
  const playlistRunner = require('./playlistRunner');
  playlistRunner.stopPlaylist();

  stopTagRunner();

  state.running = true;
  state.tagNames = tagNames;
  state.defaultIntervalMs = Math.max(5000, intervalMs);
  state.recentHistory = [];

  // Pick and apply a random track
  const picked = await _pickAndApplyTrack();
  if (!picked) {
    stopTagRunner();
    throw new Error('No tracks found matching the selected tags');
  }

  _scheduleNext();
  _persistConfig();

  console.log(`[tag-runner] Started with tags [${tagNames.join(', ')}] (default interval=${state.defaultIntervalMs}ms)`);
  _broadcastState();
}

function stopTagRunner() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  _clearPreTimers();
  const wasRunning = state.running;
  state.running = false;
  state.nextChangeAt = null;
  state.currentTrack = null;
  state.currentIntervalMs = 0;
  if (wasRunning) {
    console.log('[tag-runner] Stopped');
    if (_onStopCallback) _onStopCallback();
    _persistConfig();
    _broadcastState();
  }
}

function onStop(callback) {
  _onStopCallback = callback;
}

async function skipToNext() {
  if (!state.running) return;
  if (_timer) { clearTimeout(_timer); _timer = null; }
  _clearPreTimers();

  const picked = await _pickAndApplyTrack();
  if (!picked) {
    console.warn('[tag-runner] No tracks available on skip — staying on current track');
    sendCommand({ cmd: 'send_chat', message: '<color=#FF0000>TAG RUNNER</color> <color=#FFFF00>No matching tracks available.</color>' });
  }

  _scheduleNext();
  _broadcastState();
}

async function extendTimer(ms) {
  if (!state.running || !state.nextChangeAt) return;
  if (_timer) { clearTimeout(_timer); _timer = null; }
  _clearPreTimers();

  state.nextChangeAt = new Date(state.nextChangeAt.getTime() + ms);
  const remaining = state.nextChangeAt.getTime() - Date.now();

  _timer = setTimeout(async () => {
    await _pickAndApplyTrack();
    _scheduleNext();
    _broadcastState();
  }, Math.max(1000, remaining));

  console.log(`[tag-runner] Extended timer by ${ms / 1000}s — next change at ${state.nextChangeAt.toISOString()}`);
  _broadcastState();
}

/**
 * Resume tag runner from persisted config after server restart.
 */
async function tryResume() {
  try {
    const raw = await db.getKvValue(KV_KEY);
    if (!raw) return;
    const config = JSON.parse(raw);
    if (!config.running || !config.tagNames || config.tagNames.length === 0) return;

    // Check competition isn't auto-managed
    const competitionRunner = require('./competitionRunner');
    const compState = competitionRunner.getState();
    if (compState.auto_managed) {
      console.log('[tag-runner] Not resuming — competition is auto-managed');
      return;
    }

    // Stop playlist runner just in case
    const playlistRunner = require('./playlistRunner');
    playlistRunner.stopPlaylist();

    state.running = true;
    state.tagNames = config.tagNames;
    state.defaultIntervalMs = config.defaultIntervalMs || DEFAULT_INTERVAL_MS;
    state.recentHistory = [];

    const picked = await _pickAndApplyTrack();
    if (!picked) {
      console.warn('[tag-runner] Resume failed — no tracks found for tags:', config.tagNames);
      state.running = false;
      return;
    }

    _scheduleNext();
    console.log(`[tag-runner] Resumed with tags [${state.tagNames.join(', ')}]`);
    _broadcastState();
  } catch (err) {
    console.error('[tag-runner] Resume error:', err.message);
  }
}

// ── Internals ────────────────────────────────────────────────────────────────

function _clearPreTimers() {
  for (const t of _preTimers) clearTimeout(t);
  _preTimers = [];
}

async function _pickAndApplyTrack() {
  // Get catalog env/track pairs for filtering
  let catalogEnvTracks = null;
  try {
    const catalogRow = await db.getPool().query(
      'SELECT catalog_json FROM track_catalog ORDER BY id DESC LIMIT 1'
    );
    if (catalogRow.rows.length > 0) {
      const catalog = JSON.parse(catalogRow.rows[0].catalog_json);
      catalogEnvTracks = [];
      for (const env of (catalog.environments || [])) {
        for (const t of (env.tracks || [])) {
          catalogEnvTracks.push({ env: env.name, track: t.name });
        }
      }
    }
  } catch {}

  const track = await db.getRandomTrackByTags(state.tagNames, state.recentHistory, catalogEnvTracks);
  if (!track) return false;

  // Update recent history
  state.recentHistory.push({ env: track.env, track: track.track });
  if (state.recentHistory.length > RECENT_HISTORY_SIZE) {
    state.recentHistory.shift();
  }

  state.currentTrack = track;
  state.currentIntervalMs = track.duration_ms || state.defaultIntervalMs;

  // Send command to plugin
  sendCommand({
    cmd: 'set_track',
    env: track.env,
    track: track.track,
    race: RACE_MODE,
    workshop_id: track.workshop_id || '',
  });
  setCurrentTrack({ env: track.env, track: track.track, race: RACE_MODE });

  broadcast.broadcastAll({
    event_type: 'track_changed',
    env: track.env,
    track: track.track,
    race: RACE_MODE,
  });

  fireTemplates('track_change', { env: track.env, track: track.track, race: RACE_MODE });

  console.log(`[tag-runner] Track: ${track.env} / ${track.track} (interval=${state.currentIntervalMs}ms)`);
  return true;
}

async function _scheduleNext() {
  const interval = state.currentIntervalMs || state.defaultIntervalMs;
  state.nextChangeAt = new Date(Date.now() + interval);
  _clearPreTimers();

  // Pre-change messages (negative delay track_change templates)
  try {
    const preTemplates = (await db.getChatTemplatesByTrigger('track_change')).filter(t => t.delay_ms < 0);
    if (preTemplates.length > 0) {
      for (const tmpl of preTemplates) {
        const fireAt = interval + tmpl.delay_ms;
        if (fireAt <= 0) continue;
        let message = tmpl.template;
        const vars = { env: '?', track: '?', race: RACE_MODE,
                       mins: Math.round(Math.abs(tmpl.delay_ms) / 60000) };
        for (const [k, v] of Object.entries(vars)) message = message.replaceAll(`{${k}}`, v ?? '');
        message = message.trim();
        if (!message) continue;
        _preTimers.push(setTimeout(() => sendCommand({ cmd: 'send_chat', message }), fireAt));
      }
    }
  } catch {}

  _timer = setTimeout(async () => {
    try {
      await _pickAndApplyTrack();
    } catch (err) {
      console.error('[tag-runner] Error picking track during auto-advance:', err.message);
    }
    _scheduleNext();
    _broadcastState();
  }, interval);
}

function _broadcastState() {
  broadcast.broadcastAll({ event_type: 'tag_runner_state', ...getState() });
}

async function _persistConfig() {
  try {
    await db.setKvValue(KV_KEY, JSON.stringify({
      running: state.running,
      tagNames: state.tagNames,
      defaultIntervalMs: state.defaultIntervalMs,
      startedAt: new Date().toISOString(),
    }));
  } catch (err) {
    console.error('[tag-runner] Failed to persist config:', err.message);
  }
}

module.exports = {
  getState,
  startTagRunner,
  stopTagRunner,
  skipToNext,
  extendTimer,
  onStop,
  tryResume,
};
