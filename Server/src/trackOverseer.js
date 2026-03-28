/**
 * Track Overseer
 *
 * Unified track management replacing playlistRunner, competitionRunner, and
 * tagRunner. Two modes:
 *   - playlist: cycles through a DB playlist
 *   - tag: picks random tracks matching selected tags
 *
 * Features:
 *   - Admin-only track queue (queued tracks play next before normal rotation)
 *   - Track history recording
 *   - Reboot-resilient (state persisted to kv_store, queue in DB)
 *   - Timer bug fixes: persistence awaited before timer arm, remaining time
 *     clamped on resume to prevent clock-skew skips
 */

const db = require('./database');
const { sendCommand, setCurrentTrack, fireTemplates } = require('./pluginSocket');
const broadcast = require('./broadcast');

const DEFAULT_PLAYLIST_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_TAG_INTERVAL_MS = 10 * 60 * 1000;      // 10 minutes
const RECENT_HISTORY_SIZE = 5;
const TAG_RACE_MODE = 'InfiniteRace';

// ── State ────────────────────────────────────────────────────────────────────

const state = {
  mode: 'idle',              // 'idle' | 'playlist' | 'tag'
  running: false,
  // Playlist mode
  playlistId: null,
  playlistName: null,
  currentIndex: 0,
  tracks: [],                // loaded snapshot of playlist_tracks at start
  // Tag mode
  tagNames: [],
  defaultIntervalMs: DEFAULT_TAG_INTERVAL_MS,
  recentHistory: [],         // last N { env, track } pairs
  // Next playlist (queued to auto-start when current playlist wraps)
  nextPlaylist: null,        // { playlistId, intervalMs } or null
  // Shared
  intervalMs: DEFAULT_PLAYLIST_INTERVAL_MS,
  currentTrack: null,        // { env, track, race, workshop_id }
  nextChangeAt: null,        // Date
  // History tracking
  currentHistoryId: null,
  skipCount: 0,
  extendCount: 0,
};

let _timer = null;
let _preTimers = [];
let _onStopCallback = null;

// ── Public API ───────────────────────────────────────────────────────────────

function init(_broadcastFn) {
  // Retained for call-site compatibility — broadcast module used directly.
}

function getState() {
  return {
    mode: state.mode,
    running: state.running,
    // Playlist info
    playlist_id: state.playlistId,
    playlist_name: state.playlistName,
    current_index: state.currentIndex,
    track_count: state.tracks.length,
    tracks: state.tracks,
    // Tag info
    tag_names: state.tagNames,
    default_interval_ms: state.defaultIntervalMs,
    // Next playlist
    next_playlist: state.nextPlaylist,
    // Shared
    interval_ms: state.intervalMs,
    current_track: state.currentTrack,
    next_change_at: state.nextChangeAt ? state.nextChangeAt.toISOString() : null,
  };
}

async function startPlaylist(playlistId, intervalMs, startIndex = 0) {
  const playlist = await db.getPlaylistById(playlistId);
  if (!playlist) throw new Error(`Playlist ${playlistId} not found`);

  const tracks = await db.getPlaylistTracks(playlistId);
  if (tracks.length === 0) throw new Error('Playlist is empty — add tracks first');

  const idx = Math.max(0, Math.min(startIndex, tracks.length - 1));

  stop();

  state.mode = 'playlist';
  state.running = true;
  state.playlistId = playlistId;
  state.playlistName = playlist.name;
  state.currentIndex = idx;
  state.intervalMs = intervalMs || DEFAULT_PLAYLIST_INTERVAL_MS;
  state.tracks = tracks;
  state.tagNames = [];
  state.recentHistory = [];
  state.nextPlaylist = null;

  await _applyTrack(_getPlaylistTrack(idx), 'playlist');
  await _persistState();
  _armTimer(state.intervalMs);

  console.log(`[overseer] Playlist "${playlist.name}" started at track ${idx + 1}/${tracks.length} (interval=${state.intervalMs}ms)`);
  _broadcastState();
}

async function startTagMode(tagNames, intervalMs = DEFAULT_TAG_INTERVAL_MS) {
  if (!tagNames || tagNames.length === 0) {
    throw new Error('At least one tag name is required');
  }

  stop();

  state.mode = 'tag';
  state.running = true;
  state.tagNames = tagNames;
  state.defaultIntervalMs = Math.max(5000, intervalMs);
  state.intervalMs = state.defaultIntervalMs;
  state.playlistId = null;
  state.playlistName = null;
  state.tracks = [];
  state.currentIndex = 0;
  state.recentHistory = [];

  const picked = await _pickTagTrack();
  if (!picked) {
    stop();
    throw new Error('No tracks found matching the selected tags');
  }

  await _applyTrack(picked, 'tag');
  state.intervalMs = picked.duration_ms || state.defaultIntervalMs;
  await _persistState();
  _armTimer(state.intervalMs);

  console.log(`[overseer] Tag mode started [${tagNames.join(', ')}] (interval=${state.intervalMs}ms)`);
  _broadcastState();
}

function stop() {
  _clearTimers();
  const wasRunning = state.running;
  _closeHistory();
  state.mode = 'idle';
  state.running = false;
  state.nextChangeAt = null;
  state.currentTrack = null;
  state.playlistId = null;
  state.playlistName = null;
  state.tracks = [];
  state.currentIndex = 0;
  state.tagNames = [];
  state.recentHistory = [];
  state.nextPlaylist = null;
  if (wasRunning) {
    console.log('[overseer] Stopped');
    _clearPersistedState();
    if (_onStopCallback) _onStopCallback();
    _broadcastState();
  }
}

function onStop(callback) {
  _onStopCallback = callback;
}

async function skipToNext() {
  if (!state.running) return;
  _clearTimers();
  state.skipCount++;
  await _advance();
  _broadcastState();
}

async function extendTimer(ms) {
  if (!state.running || !state.nextChangeAt) return;
  _clearTimers();

  state.extendCount++;
  state.nextChangeAt = new Date(state.nextChangeAt.getTime() + ms);
  const remaining = state.nextChangeAt.getTime() - Date.now();

  // Re-schedule pre-change templates
  await _schedulePreTimers(Math.max(1000, remaining));

  // Re-arm main timer
  _timer = setTimeout(() => _advance().then(() => _broadcastState()), Math.max(1000, remaining));

  await _persistState();
  console.log(`[overseer] Extended timer by ${ms / 1000}s — next change at ${state.nextChangeAt.toISOString()}`);
  _broadcastState();
}

async function setNextPlaylist(playlistId, intervalMs) {
  if (!playlistId) {
    state.nextPlaylist = null;
    console.log('[overseer] Next playlist cleared');
    _broadcastState();
    return { ok: true, next_playlist: null };
  }
  const playlist = await db.getPlaylistById(playlistId);
  if (!playlist) throw new Error(`Playlist ${playlistId} not found`);
  const tracks = await db.getPlaylistTracks(playlistId);
  if (tracks.length === 0) throw new Error('Playlist is empty');
  state.nextPlaylist = {
    playlistId,
    playlistName: playlist.name,
    intervalMs: intervalMs || DEFAULT_PLAYLIST_INTERVAL_MS,
    trackCount: tracks.length,
  };
  console.log(`[overseer] Next playlist queued: "${playlist.name}" (${tracks.length} tracks)`);
  _broadcastState();
  return { ok: true, next_playlist: state.nextPlaylist };
}

function skipToIndex(index) {
  if (!state.running || state.mode !== 'playlist') return;
  if (index < 0 || index >= state.tracks.length) return;
  _clearTimers();
  _closeHistory();
  state.currentIndex = index;
  const t = _getPlaylistTrack(index);
  _applyTrack(t, 'playlist').then(async () => {
    await _persistState();
    _armTimer(state.intervalMs);
    _broadcastState();
  });
}

async function enqueueTrack(trackInfo) {
  const item = await db.addToQueue({
    env: trackInfo.env || '',
    track: trackInfo.track || '',
    race: trackInfo.race || '',
    workshop_id: trackInfo.workshop_id || trackInfo.local_id || '',
  });
  _broadcastState();
  return item;
}

function getUpcoming(count = 10) {
  const upcoming = [];

  // Queue items first
  // Note: this is sync — we read from the last known queue state
  // For accuracy, caller should use the async getQueue endpoint
  if (state.mode === 'playlist' && state.tracks.length > 0) {
    let idx = state.currentIndex;
    for (let i = 0; i < Math.min(count, state.tracks.length); i++) {
      idx = (idx + 1) % state.tracks.length;
      const t = state.tracks[idx];
      upcoming.push({ env: t.env, track: t.track, race: t.race, source: 'playlist' });
    }
  } else if (state.mode === 'tag') {
    // Can't predict random picks — just indicate mode
    for (let i = 0; i < count; i++) {
      upcoming.push({ env: '?', track: '(random from tags)', race: TAG_RACE_MODE, source: 'tag' });
    }
  }

  return upcoming;
}

async function tryResume() {
  if (state.running) return;
  try {
    const saved = await db.loadOverseerState();
    if (saved.mode === 'idle' || !saved.mode) return;

    if (saved.mode === 'playlist') {
      if (!saved.playlistId) return;
      const playlist = await db.getPlaylistById(saved.playlistId);
      if (!playlist) return;
      const tracks = await db.getPlaylistTracks(saved.playlistId);
      if (tracks.length === 0) return;

      const idx = Math.max(0, Math.min(saved.currentIndex, tracks.length - 1));
      let remainingMs = saved.nextChangeAt
        ? new Date(saved.nextChangeAt).getTime() - Date.now()
        : null;

      // Clamp remaining time to prevent clock-skew induced skips
      if (remainingMs !== null) {
        if (remainingMs < 5000) {
          // Timer expired — advance to next track
          const nextIdx = (idx + 1) % tracks.length;
          state.mode = 'playlist';
          state.running = true;
          state.playlistId = saved.playlistId;
          state.playlistName = playlist.name;
          state.currentIndex = nextIdx;
          state.intervalMs = saved.intervalMs;
          state.tracks = tracks;

          await _applyTrack(_getPlaylistTrack(nextIdx), 'playlist');
          await _persistState();
          _armTimer(state.intervalMs);
          console.log(`[overseer] Resumed playlist "${playlist.name}" — timer expired, advanced to track ${nextIdx + 1}/${tracks.length}`);
          _broadcastState();
          return;
        }
        remainingMs = Math.min(remainingMs, saved.intervalMs);
      }

      state.mode = 'playlist';
      state.running = true;
      state.playlistId = saved.playlistId;
      state.playlistName = playlist.name;
      state.currentIndex = idx;
      state.intervalMs = saved.intervalMs;
      state.tracks = tracks;

      const t = _getPlaylistTrack(idx);
      if (t) {
        setCurrentTrack({ env: t.env, track: t.track, race: t.race });
        state.currentTrack = { env: t.env, track: t.track, race: t.race, workshop_id: t.workshop_id || '' };
      }

      const delay = remainingMs || saved.intervalMs;
      await _persistState();
      state.nextChangeAt = new Date(Date.now() + delay);
      await _schedulePreTimers(delay);
      _timer = setTimeout(() => _advance().then(() => _broadcastState()), delay);

      console.log(`[overseer] Resumed playlist "${playlist.name}" at track ${idx + 1}/${tracks.length} (next change in ${Math.round(delay / 1000)}s)`);
      _broadcastState();

    } else if (saved.mode === 'tag') {
      if (!saved.tagNames || saved.tagNames.length === 0) return;

      state.mode = 'tag';
      state.running = true;
      state.tagNames = saved.tagNames;
      state.defaultIntervalMs = saved.defaultIntervalMs || DEFAULT_TAG_INTERVAL_MS;
      state.intervalMs = state.defaultIntervalMs;
      state.recentHistory = [];

      const picked = await _pickTagTrack();
      if (!picked) {
        console.warn('[overseer] Tag resume failed — no tracks for tags:', saved.tagNames);
        state.mode = 'idle';
        state.running = false;
        return;
      }

      await _applyTrack(picked, 'tag');
      state.intervalMs = picked.duration_ms || state.defaultIntervalMs;
      await _persistState();
      _armTimer(state.intervalMs);

      console.log(`[overseer] Resumed tag mode [${saved.tagNames.join(', ')}]`);
      _broadcastState();
    }
  } catch (err) {
    console.error('[overseer] Resume error:', err.message);
  }
}

// ── Internals ────────────────────────────────────────────────────────────────

function _clearTimers() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  for (const t of _preTimers) clearTimeout(t);
  _preTimers = [];
}

function _getPlaylistTrack(index) {
  const t = state.tracks[index];
  if (!t) return null;
  return { env: t.env, track: t.track, race: t.race, workshop_id: t.workshop_id || '' };
}

async function _advance() {
  _closeHistory();

  // 1. Check queue first
  const queued = await db.popQueue();
  if (queued) {
    const trackInfo = { env: queued.env, track: queued.track, race: queued.race, workshop_id: queued.workshop_id };
    await _applyTrack(trackInfo, 'queue');
    await _persistState();
    _armTimer(state.intervalMs);
    return;
  }

  // 2. Normal rotation
  if (state.mode === 'playlist') {
    if (state.tracks.length === 0) return;
    const prevIndex = state.currentIndex;
    const nextIndex = (state.currentIndex + 1) % state.tracks.length;
    const wrapped = nextIndex === 0 && prevIndex !== 0;

    // If wrapping and a next playlist is queued, switch to it
    if (wrapped && state.nextPlaylist) {
      const np = state.nextPlaylist;
      console.log(`[overseer] Playlist complete — switching to queued playlist "${np.playlistName}"`);
      await startPlaylist(np.playlistId, np.intervalMs, 0);
      return;
    }

    state.currentIndex = nextIndex;
    if (wrapped) {
      console.log(`[overseer] Wrapped from last track (${prevIndex + 1}/${state.tracks.length}) back to track 1`);
    }
    const t = _getPlaylistTrack(state.currentIndex);
    await _applyTrack(t, 'playlist');
    await _persistState();
    _armTimer(state.intervalMs);

  } else if (state.mode === 'tag') {
    const picked = await _pickTagTrack();
    if (!picked) {
      console.warn('[overseer] No tracks available — staying on current track');
      sendCommand({ cmd: 'send_chat', message: '<color=#FF0000>OVERSEER</color> <color=#FFFF00>No matching tracks available.</color>' });
      _armTimer(state.intervalMs);
      return;
    }
    await _applyTrack(picked, 'tag');
    state.intervalMs = picked.duration_ms || state.defaultIntervalMs;
    await _persistState();
    _armTimer(state.intervalMs);
  }
}

async function _applyTrack(trackInfo, source) {
  if (!trackInfo) return;

  const { env, track, race, workshop_id } = trackInfo;

  sendCommand({ cmd: 'set_track', env, track, race, workshop_id: workshop_id || '' });
  setCurrentTrack({ env, track, race });

  broadcast.broadcastAll({ event_type: 'track_changed', env, track, race });
  fireTemplates('track_change', { env, track, race });

  state.currentTrack = { env, track, race, workshop_id: workshop_id || '' };
  state.skipCount = 0;
  state.extendCount = 0;

  // Record in history
  try {
    state.currentHistoryId = await db.recordTrackStart(env, track, race, source);
  } catch (err) {
    console.error('[overseer] Failed to record track history:', err.message);
    state.currentHistoryId = null;
  }

  const modeInfo = state.mode === 'playlist'
    ? `Track ${state.currentIndex + 1}/${state.tracks.length}: ${env} / ${track}`
    : `Track: ${env} / ${track}`;
  console.log(`[overseer] ${modeInfo}`);
}

function _closeHistory() {
  if (state.currentHistoryId) {
    db.recordTrackEnd(state.currentHistoryId, state.skipCount, state.extendCount)
      .catch(err => console.error('[overseer] Failed to close track history:', err.message));
    state.currentHistoryId = null;
  }
}

function _armTimer(delayMs) {
  _clearTimers();
  state.nextChangeAt = new Date(Date.now() + delayMs);

  _schedulePreTimers(delayMs);

  _timer = setTimeout(() => _advance().then(() => _broadcastState()), delayMs);
}

async function _schedulePreTimers(delayMs) {
  // Pre-change messages: track_change templates with negative delay_ms
  let preTemplates = [];
  try {
    preTemplates = (await db.getChatTemplatesByTrigger('track_change')).filter(t => t.delay_ms < 0);
  } catch { return; }

  if (preTemplates.length === 0) return;

  // Determine what the next track will be for template variable substitution
  let nextTrackInfo = { env: '?', track: '?', race: '' };
  if (state.mode === 'playlist' && state.tracks.length > 0) {
    const nextIdx = (state.currentIndex + 1) % state.tracks.length;
    const t = state.tracks[nextIdx];
    if (t) nextTrackInfo = { env: t.env, track: t.track, race: t.race };
  }

  for (const tmpl of preTemplates) {
    const fireAt = delayMs + tmpl.delay_ms; // delayMs + negative value
    if (fireAt <= 0) continue;
    let message = tmpl.template;
    const vars = {
      env: nextTrackInfo.env,
      track: nextTrackInfo.track,
      race: nextTrackInfo.race,
      mins: Math.round(Math.abs(tmpl.delay_ms) / 60000),
    };
    for (const [k, v] of Object.entries(vars)) message = message.replaceAll(`{${k}}`, v ?? '');
    message = message.trim();
    if (!message) continue;
    _preTimers.push(setTimeout(() => sendCommand({ cmd: 'send_chat', message }), fireAt));
  }
}

async function _pickTagTrack() {
  // Get catalog env/track pairs for filtering
  let catalogEnvTracks = null;
  try {
    const pool = db.getPool();
    const catalogRow = await pool.query(
      'SELECT catalog_json FROM track_catalog ORDER BY id DESC LIMIT 1'
    );
    if (catalogRow.rows.length > 0) {
      const catalog = JSON.parse(catalogRow.rows[0].catalog_json);
      catalogEnvTracks = [];
      for (const env of (catalog.environments || [])) {
        for (const t of (env.tracks || [])) {
          catalogEnvTracks.push({ env: env.internal_name || env.name, track: t.name });
        }
      }
    }
  } catch {}

  const track = await db.getRandomTrackByTags(state.tagNames, state.recentHistory, catalogEnvTracks);
  if (!track) return null;

  // Update recent history
  state.recentHistory.push({ env: track.env, track: track.track });
  if (state.recentHistory.length > RECENT_HISTORY_SIZE) {
    state.recentHistory.shift();
  }

  return {
    env: track.env,
    track: track.track,
    race: TAG_RACE_MODE,
    workshop_id: track.local_id || '',
    duration_ms: track.duration_ms,
  };
}

async function _persistState() {
  try {
    await db.saveOverseerState({
      mode: state.mode,
      playlistId: state.playlistId,
      currentIndex: state.currentIndex,
      intervalMs: state.intervalMs,
      nextChangeAt: state.nextChangeAt,
      tagNames: state.tagNames,
      defaultIntervalMs: state.defaultIntervalMs,
    });
  } catch (err) {
    console.error('[overseer] Failed to persist state:', err.message);
  }
}

async function _clearPersistedState() {
  try {
    await db.clearOverseerState();
  } catch (err) {
    console.error('[overseer] Failed to clear persisted state:', err.message);
  }
}

function _broadcastState() {
  broadcast.broadcastAll({ event_type: 'overseer_state', ...getState() });
}

module.exports = {
  init,
  getState,
  startPlaylist,
  startTagMode,
  stop,
  onStop,
  skipToNext,
  skipToIndex,
  extendTimer,
  enqueueTrack,
  setNextPlaylist,
  getUpcoming,
  tryResume,
};
