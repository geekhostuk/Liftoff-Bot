/**
 * TrackOverseerInstance — per-room track rotation.
 *
 * Extracted from the former singleton trackOverseer.js.
 * Each room gets its own instance with independent state, timers, and
 * command sender scoped to that room's bots.
 */

const db = require('./database');
const broadcast = require('./broadcast');

const DEFAULT_PLAYLIST_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_TAG_INTERVAL_MS = 10 * 60 * 1000;
const RECENT_HISTORY_SIZE = 5;
const TAG_RACE_MODE = 'InfiniteRace';

// Shared catalog cache (populated from track_catalog events)
let _catalogEnvTracksCache = null;

function setCatalogCache(catalogJson) {
  try {
    const catalog = typeof catalogJson === 'string' ? JSON.parse(catalogJson) : catalogJson;
    _catalogEnvTracksCache = [];
    for (const env of (catalog.environments || [])) {
      for (const t of (env.tracks || [])) {
        _catalogEnvTracksCache.push({ env: env.internal_name || env.name, track: t.name });
      }
    }
  } catch {
    _catalogEnvTracksCache = null;
  }
}

function clearCatalogCache() {
  _catalogEnvTracksCache = null;
}

class TrackOverseerInstance {
  /**
   * @param {string} roomId
   * @param {object} deps - { sendCommandToRoom, sendCommandAwaitToBot, getConnectedBotIdsForRoom, roomState, globalState, fireTemplates }
   */
  constructor(roomId, deps) {
    this.roomId = roomId;
    this._deps = deps;

    this.state = {
      mode: 'idle',
      running: false,
      playlistId: null,
      playlistName: null,
      currentIndex: 0,
      tracks: [],
      tagNames: [],
      defaultIntervalMs: DEFAULT_TAG_INTERVAL_MS,
      recentHistory: [],
      playlistQueue: [],
      intervalMs: DEFAULT_PLAYLIST_INTERVAL_MS,
      currentTrack: null,
      nextChangeAt: null,
      currentHistoryId: null,
      skipCount: 0,
      extendCount: 0,
      skipVoteEnabled: true,
      extendVoteEnabled: true,
    };

    this._timer = null;
    this._preTimers = [];
    this._onStopCallback = null;
  }

  getState() {
    return {
      mode: this.state.mode,
      running: this.state.running,
      playlist_id: this.state.playlistId,
      playlist_name: this.state.playlistName,
      current_index: this.state.currentIndex,
      track_count: this.state.tracks.length,
      tracks: this.state.tracks,
      tag_names: this.state.tagNames,
      default_interval_ms: this.state.defaultIntervalMs,
      playlist_queue: this.state.playlistQueue,
      interval_ms: this.state.intervalMs,
      current_track: this.state.currentTrack,
      next_change_at: this.state.nextChangeAt ? this.state.nextChangeAt.toISOString() : null,
      skip_vote_enabled: this.state.skipVoteEnabled,
      extend_vote_enabled: this.state.extendVoteEnabled,
      room_id: this.roomId,
    };
  }

  async startPlaylist(playlistId, intervalMs, startIndex = 0, shuffle = false) {
    const playlist = await db.getPlaylistById(playlistId);
    if (!playlist) throw new Error(`Playlist ${playlistId} not found`);

    let tracks = await db.getPlaylistTracks(playlistId);
    if (tracks.length === 0) throw new Error('Playlist is empty — add tracks first');

    if (shuffle) {
      for (let i = tracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
      }
    }

    const idx = Math.max(0, Math.min(startIndex, tracks.length - 1));

    this.stop();

    this.state.mode = 'playlist';
    this.state.running = true;
    this.state.playlistId = playlistId;
    this.state.playlistName = playlist.name;
    this.state.currentIndex = idx;
    this.state.intervalMs = intervalMs || DEFAULT_PLAYLIST_INTERVAL_MS;
    this.state.tracks = tracks;
    this.state.tagNames = [];
    this.state.recentHistory = [];

    await this._refreshPlaylistQueue();
    await this._applyTrack(this._getPlaylistTrack(idx), 'playlist');
    this._armTimer(this.state.intervalMs);
    await this._persistState();

    console.log(`[overseer:${this.roomId}] Playlist "${playlist.name}" started at track ${idx + 1}/${tracks.length} (interval=${this.state.intervalMs}ms${shuffle ? ', shuffled' : ''})`);
    this._broadcastState();
  }

  async startTagMode(tagNames, intervalMs = DEFAULT_TAG_INTERVAL_MS) {
    if (!tagNames || tagNames.length === 0) {
      throw new Error('At least one tag name is required');
    }

    this.stop();

    this.state.mode = 'tag';
    this.state.running = true;
    this.state.tagNames = tagNames;
    this.state.defaultIntervalMs = Math.max(5000, intervalMs);
    this.state.intervalMs = this.state.defaultIntervalMs;
    this.state.playlistId = null;
    this.state.playlistName = null;
    this.state.tracks = [];
    this.state.currentIndex = 0;
    this.state.recentHistory = [];

    const picked = await this._pickTagTrack();
    if (!picked) {
      this.stop();
      throw new Error('No tracks found matching the selected tags');
    }

    await this._applyTrack(picked, 'tag');
    this.state.intervalMs = picked.duration_ms || this.state.defaultIntervalMs;
    this._armTimer(this.state.intervalMs);
    await this._persistState();

    console.log(`[overseer:${this.roomId}] Tag mode started [${tagNames.join(', ')}] (interval=${this.state.intervalMs}ms)`);
    this._broadcastState();
  }

  stop() {
    this._clearTimers();
    const wasRunning = this.state.running;
    this._closeHistory();
    this.state.mode = 'idle';
    this.state.running = false;
    this.state.nextChangeAt = null;
    this.state.currentTrack = null;
    this.state.playlistId = null;
    this.state.playlistName = null;
    this.state.tracks = [];
    this.state.currentIndex = 0;
    this.state.tagNames = [];
    this.state.recentHistory = [];
    this.state.playlistQueue = [];
    if (wasRunning) {
      console.log(`[overseer:${this.roomId}] Stopped`);
      this._clearPersistedState();
      if (this._onStopCallback) this._onStopCallback();
      this._broadcastState();
    }
  }

  onStop(callback) {
    this._onStopCallback = callback;
  }

  async skipToNext() {
    if (!this.state.running) return;
    this._clearTimers();
    this.state.skipCount++;
    await this._advance();
    this._broadcastState();
  }

  async extendTimer(ms) {
    if (!this.state.running || !this.state.nextChangeAt) return;
    this._clearTimers();

    this.state.extendCount++;
    this.state.nextChangeAt = new Date(this.state.nextChangeAt.getTime() + ms);
    const remaining = this.state.nextChangeAt.getTime() - Date.now();

    await this._schedulePreTimers(Math.max(1000, remaining));
    this._timer = setTimeout(() => this._advance().then(() => this._broadcastState()), Math.max(1000, remaining));

    await this._persistState();
    console.log(`[overseer:${this.roomId}] Extended timer by ${ms / 1000}s — next change at ${this.state.nextChangeAt.toISOString()}`);
    this._broadcastState();
  }

  async addToPlaylistQueue(playlistId, intervalMs, shuffle = false, startAfter = 'track') {
    const playlist = await db.getPlaylistById(playlistId);
    if (!playlist) throw new Error(`Playlist ${playlistId} not found`);
    const tracks = await db.getPlaylistTracks(playlistId);
    if (tracks.length === 0) throw new Error('Playlist is empty');
    const item = await db.addToPlaylistQueue({
      playlist_id: playlistId,
      interval_ms: intervalMs || DEFAULT_PLAYLIST_INTERVAL_MS,
      shuffle,
      start_after: startAfter,
    });
    await this._refreshPlaylistQueue();
    console.log(`[overseer:${this.roomId}] Playlist queued: "${playlist.name}" (${tracks.length} tracks, start_after=${startAfter}, shuffle=${shuffle})`);
    this._broadcastState();
    return item;
  }

  async removeFromPlaylistQueue(id) {
    await db.removeFromPlaylistQueue(id);
    await this._refreshPlaylistQueue();
    this._broadcastState();
  }

  async reorderPlaylistQueue(id, direction) {
    await db.reorderPlaylistQueue(id, direction);
    await this._refreshPlaylistQueue();
    this._broadcastState();
  }

  async clearPlaylistQueue() {
    await db.clearPlaylistQueue();
    this.state.playlistQueue = [];
    this._broadcastState();
  }

  skipToIndex(index) {
    if (!this.state.running || this.state.mode !== 'playlist') return;
    if (index < 0 || index >= this.state.tracks.length) return;
    this._clearTimers();
    this._closeHistory();
    this.state.currentIndex = index;
    const t = this._getPlaylistTrack(index);
    this._applyTrack(t, 'playlist').then(async () => {
      this._armTimer(this.state.intervalMs);
      this._persistState();
      this._broadcastState();
    });
  }

  async enqueueTrack(trackInfo) {
    const item = await db.addToQueue({
      env: trackInfo.env || '',
      track: trackInfo.track || '',
      race: trackInfo.race || '',
      workshop_id: trackInfo.workshop_id || trackInfo.local_id || '',
    }, this.roomId);
    this._broadcastState();
    return item;
  }

  getUpcoming(count = 10) {
    const upcoming = [];
    if (this.state.mode === 'playlist' && this.state.tracks.length > 0) {
      let idx = this.state.currentIndex;
      for (let i = 0; i < Math.min(count, this.state.tracks.length); i++) {
        idx = (idx + 1) % this.state.tracks.length;
        const t = this.state.tracks[idx];
        upcoming.push({ env: t.env, track: t.track, race: t.race, source: 'playlist' });
      }
    } else if (this.state.mode === 'tag') {
      for (let i = 0; i < count; i++) {
        upcoming.push({ env: '?', track: '(random from tags)', race: TAG_RACE_MODE, source: 'tag' });
      }
    }
    return upcoming;
  }

  async tryResume() {
    if (this.state.running) return;
    try {
      const saved = await db.loadOverseerState(this.roomId);
      this.state.skipVoteEnabled = saved.skipVoteEnabled !== false;
      this.state.extendVoteEnabled = saved.extendVoteEnabled !== false;
      if (saved.mode === 'idle' || !saved.mode) return;

      await this._refreshPlaylistQueue();

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
        if (remainingMs !== null && remainingMs < 5000) remainingMs = saved.intervalMs;
        if (remainingMs !== null) remainingMs = Math.min(remainingMs, saved.intervalMs);

        this.state.mode = 'playlist';
        this.state.running = true;
        this.state.playlistId = saved.playlistId;
        this.state.playlistName = playlist.name;
        this.state.currentIndex = idx;
        this.state.intervalMs = saved.intervalMs;
        this.state.tracks = tracks;

        const t = this._getPlaylistTrack(idx);
        if (t) {
          this._deps.roomState.setCurrentTrack({ env: t.env, track: t.track, race: t.race });
          this._deps.globalState.setCurrentTrack({ env: t.env, track: t.track, race: t.race });
          this.state.currentTrack = { env: t.env, track: t.track, race: t.race, workshop_id: t.workshop_id || '' };
        }

        const delay = remainingMs || saved.intervalMs;
        this.state.nextChangeAt = new Date(Date.now() + delay);
        await this._schedulePreTimers(delay);
        this._timer = setTimeout(() => this._advance().then(() => this._broadcastState()), delay);
        this._persistState();

        console.log(`[overseer:${this.roomId}] Resumed playlist "${playlist.name}" at track ${idx + 1}/${tracks.length} (next change in ${Math.round(delay / 1000)}s)`);
        this._broadcastState();

      } else if (saved.mode === 'tag') {
        if (!saved.tagNames || saved.tagNames.length === 0) return;

        this.state.mode = 'tag';
        this.state.running = true;
        this.state.tagNames = saved.tagNames;
        this.state.defaultIntervalMs = saved.defaultIntervalMs || DEFAULT_TAG_INTERVAL_MS;
        this.state.intervalMs = saved.intervalMs || this.state.defaultIntervalMs;
        this.state.recentHistory = [];

        if (saved.currentTrack) {
          this._deps.roomState.setCurrentTrack({ env: saved.currentTrack.env, track: saved.currentTrack.track, race: saved.currentTrack.race });
          this._deps.globalState.setCurrentTrack({ env: saved.currentTrack.env, track: saved.currentTrack.track, race: saved.currentTrack.race });
          this.state.currentTrack = saved.currentTrack;
        } else {
          const picked = await this._pickTagTrack();
          if (!picked) {
            console.warn(`[overseer:${this.roomId}] Tag resume failed — no tracks for tags:`, saved.tagNames);
            this.state.mode = 'idle';
            this.state.running = false;
            return;
          }
          await this._applyTrack(picked, 'tag');
          this.state.intervalMs = picked.duration_ms || this.state.defaultIntervalMs;
        }

        let remainingMs = saved.nextChangeAt
          ? new Date(saved.nextChangeAt).getTime() - Date.now()
          : null;
        if (remainingMs !== null && remainingMs < 5000) remainingMs = this.state.intervalMs;

        const delay = remainingMs || this.state.intervalMs;
        this._persistState();
        this._armTimer(delay);

        console.log(`[overseer:${this.roomId}] Resumed tag mode [${saved.tagNames.join(', ')}] (next change in ${Math.round(delay / 1000)}s)`);
        this._broadcastState();
      }
    } catch (err) {
      console.error(`[overseer:${this.roomId}] Resume error:`, err.message);
    }
  }

  setSkipVoteEnabled(enabled) {
    this.state.skipVoteEnabled = !!enabled;
    this._persistState();
    this._broadcastState();
  }

  setExtendVoteEnabled(enabled) {
    this.state.extendVoteEnabled = !!enabled;
    this._persistState();
    this._broadcastState();
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  _clearTimers() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    for (const t of this._preTimers) clearTimeout(t);
    this._preTimers = [];
  }

  _getPlaylistTrack(index) {
    const t = this.state.tracks[index];
    if (!t) return null;
    return { env: t.env, track: t.track, race: t.race, workshop_id: t.workshop_id || '' };
  }

  async _advance() {
    this._closeHistory();

    // 1. Check track queue
    const queued = await db.popQueue(this.roomId);
    if (queued) {
      const trackInfo = { env: queued.env, track: queued.track, race: queued.race, workshop_id: queued.workshop_id };
      await this._applyTrack(trackInfo, 'queue');
      this._persistState();
      this._armTimer(this.state.intervalMs);
      return;
    }

    // 2. Check playlist queue
    const peeked = await db.peekPlaylistQueue();
    if (peeked && peeked.start_after === 'track') {
      await db.popPlaylistQueue();
      await this._refreshPlaylistQueue();
      console.log(`[overseer:${this.roomId}] Switching to queued playlist "${peeked.playlist_name}" (after track)`);
      await this.startPlaylist(peeked.playlist_id, peeked.interval_ms, 0, peeked.shuffle);
      return;
    }

    // 3. Normal rotation
    if (this.state.mode === 'playlist') {
      if (this.state.tracks.length === 0) return;
      const prevIndex = this.state.currentIndex;
      const nextIndex = (this.state.currentIndex + 1) % this.state.tracks.length;
      const wrapped = nextIndex === 0 && prevIndex !== 0;

      if (wrapped && peeked && peeked.start_after === 'wrap') {
        await db.popPlaylistQueue();
        await this._refreshPlaylistQueue();
        console.log(`[overseer:${this.roomId}] Playlist complete — switching to queued playlist "${peeked.playlist_name}"`);
        await this.startPlaylist(peeked.playlist_id, peeked.interval_ms, 0, peeked.shuffle);
        return;
      }

      this.state.currentIndex = nextIndex;
      if (wrapped) {
        console.log(`[overseer:${this.roomId}] Wrapped from last track (${prevIndex + 1}/${this.state.tracks.length}) back to track 1`);
      }
      const t = this._getPlaylistTrack(this.state.currentIndex);
      await this._applyTrack(t, 'playlist');
      this._armTimer(this.state.intervalMs);
      this._persistState();

    } else if (this.state.mode === 'tag') {
      const picked = await this._pickTagTrack();
      if (!picked) {
        console.warn(`[overseer:${this.roomId}] No tracks available — staying on current track`);
        this._deps.sendCommandToRoom({ cmd: 'send_chat', message: '<color=#FF0000>OVERSEER</color> <color=#FFFF00>No matching tracks available.</color>' });
        this._armTimer(this.state.intervalMs);
        return;
      }
      await this._applyTrack(picked, 'tag');
      this.state.intervalMs = picked.duration_ms || this.state.defaultIntervalMs;
      this._armTimer(this.state.intervalMs);
      this._persistState();
    }
  }

  async _applyTrack(trackInfo, source) {
    if (!trackInfo) return;

    const { env, track, race, workshop_id } = trackInfo;
    const trackCmd = { cmd: 'set_track', env, track, race, workshop_id: workshop_id || '' };
    const dispatchTime = Date.now();
    const botIds = this._deps.getConnectedBotIdsForRoom();
    const globalState = this._deps.globalState;

    const targetTrack = { env, track, race };
    for (const botId of botIds) {
      globalState.setBotTransitioning(botId, targetTrack);
      console.log(`[timing] set_track -> bot="${botId}" room="${this.roomId}" at ${dispatchTime}`);
      this._deps.sendCommandAwaitToBot(botId, { ...trackCmd }, 60_000)
        .then(result => {
          const elapsed = Date.now() - dispatchTime;
          if (result.status === 'timeout') {
            console.warn(`[timing] set_track TIMEOUT for bot="${botId}" after ${elapsed}ms — staying transitioning`);
            return;
          }
          globalState.setBotConfirmed(botId, targetTrack);
          const diagSuffix = result.diagnostics ? ` diag=[${result.diagnostics}]` : '';
          console.log(`[timing] set_track ACK from bot="${botId}" after ${elapsed}ms (status=${result.status}) [confirmed] plugin=${result.timing_total_ms ?? '?'}ms queue=${result.timing_queue_ms ?? '?'}ms phases=[${result.timing_phases || ''}]${diagSuffix}`);
        })
        .catch(err => {
          const elapsed = Date.now() - dispatchTime;
          console.warn(`[timing] set_track FAILED for bot="${botId}" after ${elapsed}ms: ${err.message}`);
        });
    }

    // Update room-scoped current track + apply chat cooldown to suppress replayed commands
    this._deps.roomState.setCurrentTrack({ env, track, race });
    this._deps.roomState.applyChatCooldown();
    // Also update global state so legacy consumers (live socket snapshot, etc.) stay in sync
    this._deps.globalState.setCurrentTrack({ env, track, race });
    this._deps.globalState.applyChatCooldown();

    broadcast.broadcastAll({ event_type: 'track_changed', env, track, race, room_id: this.roomId });
    this._deps.fireTemplates('track_change', { env, track, race });

    this.state.currentTrack = { env, track, race, workshop_id: workshop_id || '' };
    this.state.skipCount = 0;
    this.state.extendCount = 0;

    this.state.currentHistoryId = null;
    db.recordTrackStart(env, track, race, source, this.roomId)
      .then(id => { this.state.currentHistoryId = id; })
      .catch(err => {
        console.error(`[overseer:${this.roomId}] Failed to record track history:`, err.message);
      });

    const modeInfo = this.state.mode === 'playlist'
      ? `Track ${this.state.currentIndex + 1}/${this.state.tracks.length}: ${env} / ${track}`
      : `Track: ${env} / ${track}`;
    console.log(`[overseer:${this.roomId}] ${modeInfo}`);
  }

  _closeHistory() {
    if (this.state.currentHistoryId) {
      db.recordTrackEnd(this.state.currentHistoryId, this.state.skipCount, this.state.extendCount)
        .catch(err => console.error(`[overseer:${this.roomId}] Failed to close track history:`, err.message));
      this.state.currentHistoryId = null;
    }
  }

  _armTimer(delayMs) {
    this._clearTimers();
    this.state.nextChangeAt = new Date(Date.now() + delayMs);
    this._schedulePreTimers(delayMs);
    this._timer = setTimeout(() => this._advance().then(() => this._broadcastState()), delayMs);
  }

  async _schedulePreTimers(delayMs) {
    let nextTrackInfo = { env: '?', track: '?', race: '', workshop_id: '' };
    if (this.state.mode === 'playlist' && this.state.tracks.length > 0) {
      const nextIdx = (this.state.currentIndex + 1) % this.state.tracks.length;
      const t = this.state.tracks[nextIdx];
      if (t) nextTrackInfo = { env: t.env, track: t.track, race: t.race, workshop_id: t.workshop_id || '' };
    }

    let preTemplates = [];
    try {
      preTemplates = (await db.getChatTemplatesByTrigger('track_change')).filter(t => t.delay_ms < 0);
    } catch { return; }

    if (preTemplates.length === 0) return;

    for (const tmpl of preTemplates) {
      const fireAt = delayMs + tmpl.delay_ms;
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
      this._preTimers.push(setTimeout(() => this._deps.sendCommandToRoom({ cmd: 'send_chat', message }), fireAt));
    }
  }

  async _pickTagTrack() {
    let catalogEnvTracks = _catalogEnvTracksCache;
    if (!catalogEnvTracks) {
      try {
        const pool = db.getPool();
        const catalogRow = await pool.query(
          'SELECT catalog_json FROM track_catalog ORDER BY id DESC LIMIT 1'
        );
        if (catalogRow.rows.length > 0) {
          setCatalogCache(catalogRow.rows[0].catalog_json);
          catalogEnvTracks = _catalogEnvTracksCache;
        }
      } catch {}
    }

    const track = await db.getRandomTrackByTags(this.state.tagNames, this.state.recentHistory, catalogEnvTracks);
    if (!track) return null;

    this.state.recentHistory.push({ env: track.env, track: track.track });
    if (this.state.recentHistory.length > RECENT_HISTORY_SIZE) {
      this.state.recentHistory.shift();
    }

    return {
      env: track.env,
      track: track.track,
      race: TAG_RACE_MODE,
      workshop_id: track.local_id || '',
      duration_ms: track.duration_ms,
    };
  }

  async _refreshPlaylistQueue() {
    try {
      this.state.playlistQueue = await db.getPlaylistQueue();
    } catch (err) {
      console.error(`[overseer:${this.roomId}] Failed to refresh playlist queue:`, err.message);
      this.state.playlistQueue = [];
    }
  }

  async _persistState() {
    try {
      await db.saveOverseerState({
        mode: this.state.mode,
        playlistId: this.state.playlistId,
        currentIndex: this.state.currentIndex,
        intervalMs: this.state.intervalMs,
        nextChangeAt: this.state.nextChangeAt,
        tagNames: this.state.tagNames,
        defaultIntervalMs: this.state.defaultIntervalMs,
        currentTrack: this.state.currentTrack,
        skipVoteEnabled: this.state.skipVoteEnabled,
        extendVoteEnabled: this.state.extendVoteEnabled,
      }, this.roomId);
    } catch (err) {
      console.error(`[overseer:${this.roomId}] Failed to persist state:`, err.message);
    }
  }

  async _clearPersistedState() {
    try {
      await db.clearOverseerState(this.roomId);
    } catch (err) {
      console.error(`[overseer:${this.roomId}] Failed to clear persisted state:`, err.message);
    }
  }

  _broadcastState() {
    broadcast.broadcastAll({ event_type: 'overseer_state', ...this.getState() });
  }
}

module.exports = { TrackOverseerInstance, setCatalogCache, clearCatalogCache };
