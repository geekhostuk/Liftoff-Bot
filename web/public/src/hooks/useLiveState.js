import { useReducer, useCallback, useEffect, useRef } from 'react';
import useWebSocket from './useWebSocket';
import {
  getStatus, getPilotActivity, getStatsOverview,
  getCompetitionCurrent, getCurrentWeekStandings,
  getTrackLeaderboard, getOnlineStats,
} from '../lib/api';

// ── Initial state ────────────────────────────────────────────────────────────

const initial = {
  connected: false,
  pluginConnected: null,

  currentTrack: null,
  trackSince: null,
  trackRecord: null,

  playlist: null,

  players: [],          // [{ actor, nick, status }]
  playerStats: {},      // nick → { best_lap_ms, total_laps, races_entered }

  raceId: null,
  raceStatus: 'waiting',
  pilots: [],           // sorted [{ key, nick, laps, bestMs, lastMs, lastDelta, finished, flash }]
  raceResult: null,

  connectedBots: 1,
  botNicks: [],
  feedEvents: [],       // [{ id, type, message, ts }]

  competition: null,
  currentWeek: null,
  compStandings: [],

  pilotActivity: null,
  statsOverview: null,
  rooms: [],
};

let _feedId = 0;
function feed(type, message, ts) {
  return { id: ++_feedId, type, message, ts: ts || new Date().toISOString() };
}

function appendFeed(events, entry) {
  const next = [entry, ...events];
  return next.length > 100 ? next.slice(0, 100) : next;
}

function updateRoom(rooms, roomId, updater) {
  if (!roomId || rooms.length === 0) return rooms;
  return rooms.map(r => r.room_id === roomId ? updater(r) : r);
}

// ── Pilot helpers ────────────────────────────────────────────────────────────

function upsertPilot(pilots, actor, nick, lapMs, roomId) {
  // Key by nick so the same pilot is tracked across bots
  const key = `nick-${(nick || '').toLowerCase() || actor}`;
  const existing = pilots.find(p => p.key === key);
  if (existing) {
    const laps = [...existing.laps, lapMs];
    const bestMs = Math.min(existing.bestMs ?? Infinity, lapMs);
    const lastDelta = existing.bestMs != null ? lapMs - existing.bestMs : null;
    const updated = { ...existing, nick: nick || existing.nick, laps, bestMs, lastMs: lapMs, lastDelta, flash: true, roomId: roomId || existing.roomId };
    const rest = pilots.filter(p => p.key !== key);
    return sortPilots([...rest, updated]);
  }
  const entry = { key, nick: nick || `Actor ${actor}`, laps: [lapMs], bestMs: lapMs, lastMs: lapMs, lastDelta: null, finished: false, flash: true, roomId: roomId || null };
  return sortPilots([...pilots, entry]);
}

function sortPilots(pilots) {
  return [...pilots].sort((a, b) => (a.bestMs ?? Infinity) - (b.bestMs ?? Infinity));
}

function buildPilotsFromSnapshot(race, trackSince, allLaps) {
  // Prefer allLaps (merged from all bot races) over single-race laps
  const laps = allLaps && allLaps.length > 0 ? allLaps : (race && race.laps ? race.laps : []);
  if (laps.length === 0) return [];
  const map = new Map();
  for (const lap of laps) {
    if (trackSince && lap.recorded_at < trackSince) continue;
    // Key by nick (lowercased) — same pilot can appear across bots with different actor numbers
    const key = `nick-${(lap.nick || '').toLowerCase() || lap.actor}`;
    if (!map.has(key)) map.set(key, { key, nick: lap.nick || `Actor ${lap.actor}`, laps: [], bestMs: null, lastMs: null, lastDelta: null, finished: false, flash: false, roomId: lap.room_id || null });
    const p = map.get(key);
    if (lap.nick) p.nick = lap.nick;
    if (lap.room_id) p.roomId = lap.room_id;
    const prevBest = p.bestMs;
    p.laps.push(lap.lap_ms);
    if (p.bestMs === null || lap.lap_ms < p.bestMs) p.bestMs = lap.lap_ms;
    p.lastMs = lap.lap_ms;
    p.lastDelta = prevBest != null ? lap.lap_ms - prevBest : null;
  }
  return sortPilots([...map.values()]);
}

// ── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {
    // connection
    case 'SET_CONNECTED':
      return { ...state, connected: action.payload };

    // websocket events
    case 'state_snapshot': {
      const e = action.payload;
      const currentTrack = (e.current_track && e.current_track.track) ? e.current_track : state.currentTrack;
      const trackSince = e.track_since || state.trackSince;
      const players = (e.online_players || []).map(p => ({ actor: p.actor, nick: p.nick, botId: p.botId || p.bot_id || 'default', status: 'online' }));
      const pilots = buildPilotsFromSnapshot(e.race, trackSince, e.all_laps);
      const raceId = e.race?.id || state.raceId;
      const raceStatus = pilots.length > 0 ? 'racing' : 'waiting';
      const playlist = e.overseer || e.playlist || state.playlist;
      const connectedBots = e.connected_bots || state.connectedBots;
      const botNicks = e.bot_nicks || state.botNicks;
      const rooms = e.rooms || state.rooms;
      return { ...state, currentTrack, trackSince, players, pilots, raceId, raceStatus, raceResult: null, playlist, connectedBots, botNicks, rooms };
    }

    case 'player_entered': {
      const e = action.payload;
      const eBotId = e.botId || e.bot_id || 'default';
      const exists = state.players.find(p => p.actor === e.actor && (p.botId || 'default') === eBotId);
      const players = exists
        ? state.players.map(p => (p.actor === e.actor && (p.botId || 'default') === eBotId) ? { ...p, nick: e.nick, status: 'joining' } : p)
        : [...state.players, { actor: e.actor, nick: e.nick, botId: eBotId, status: 'joining' }];
      const rooms = updateRoom(state.rooms, e.room_id, r => {
        const rPlayers = r.online_players || [];
        const rExists = rPlayers.find(p => p.actor === e.actor && (p.botId || 'default') === eBotId);
        return { ...r, online_players: rExists ? rPlayers : [...rPlayers, { actor: e.actor, nick: e.nick, botId: eBotId }] };
      });
      return { ...state, players, rooms, feedEvents: appendFeed(state.feedEvents, feed('join', `${e.nick} joined the lobby`, e.timestamp_utc)) };
    }

    case 'player_left': {
      const e = action.payload;
      const eBotId = e.botId || e.bot_id || 'default';
      const nick = state.players.find(p => p.actor === e.actor && (p.botId || 'default') === eBotId)?.nick || `Actor ${e.actor}`;
      const players = state.players.map(p => (p.actor === e.actor && (p.botId || 'default') === eBotId) ? { ...p, status: 'leaving' } : p);
      const rooms = updateRoom(state.rooms, e.room_id, r => ({
        ...r, online_players: (r.online_players || []).filter(p => !(p.actor === e.actor && (p.botId || 'default') === eBotId)),
      }));
      return { ...state, players, rooms, feedEvents: appendFeed(state.feedEvents, feed('leave', `${nick} left the lobby`, e.timestamp_utc)) };
    }

    case 'player_list': {
      const e = action.payload;
      const eBotId = e.bot_id || 'default';
      const incomingPlayers = (e.players || []).map(p => ({ actor: p.actor, nick: p.nick, botId: eBotId, status: 'online' }));
      // Replace only players from this bot, keep others
      const otherBotPlayers = state.players.filter(p => (p.botId || 'default') !== eBotId);
      const rooms = updateRoom(state.rooms, e.room_id, r => ({
        ...r, online_players: incomingPlayers.map(p => ({ actor: p.actor, nick: p.nick, botId: p.botId })),
      }));
      return { ...state, players: [...otherBotPlayers, ...incomingPlayers], rooms };
    }

    case 'lap_recorded': {
      const e = action.payload;
      // Don't clear pilots on race_id change — multiple bots have different race IDs.
      // Pilots are cleared on race_reset (track change) instead.
      const pilots = upsertPilot(state.pilots, e.actor, e.nick, e.lap_ms, e.room_id);
      const msg = `${e.nick} lap ${e.lap_number} — ${fmtMsInline(e.lap_ms)}`;
      return { ...state, pilots, raceStatus: 'racing', raceResult: null, feedEvents: appendFeed(state.feedEvents, feed('lap', msg, e.timestamp_utc)) };
    }

    case 'race_reset': {
      const e = action.payload;
      return {
        ...state,
        pilots: [], raceId: e.race_id, raceStatus: 'waiting', raceResult: null,
        feedEvents: appendFeed(state.feedEvents, feed('race', 'New race started', e.timestamp_utc)),
      };
    }

    case 'race_end': {
      const e = action.payload;
      const raceResult = { winner_nick: e.winner_nick, winner_total_ms: e.winner_total_ms, participants: e.participants, completed: e.completed };
      return { ...state, raceStatus: 'ended', raceResult, feedEvents: appendFeed(state.feedEvents, feed('race', e.winner_nick ? `Race ended — ${e.winner_nick} wins!` : 'Race ended', e.timestamp_utc)) };
    }

    case 'pilot_complete': {
      const e = action.payload;
      const key = `nick-${(e.nick || '').toLowerCase() || e.actor}`;
      const pilots = state.pilots.map(p => p.key === key ? { ...p, finished: true } : p);
      const msg = `${e.nick} finished (${e.laps_logged} laps, ${fmtMsInline(e.total_ms)})`;
      return { ...state, pilots, feedEvents: appendFeed(state.feedEvents, feed('finish', msg, e.timestamp_utc)) };
    }

    case 'pilot_reset': {
      const e = action.payload;
      return { ...state, feedEvents: appendFeed(state.feedEvents, feed('reset', `${e.nick} reset their drone`, e.timestamp_utc)) };
    }

    case 'track_changed': {
      const e = action.payload;
      const currentTrack = { env: e.env, track: e.track, race: e.race };
      const now = new Date().toISOString();
      // Clear only pilots from the affected room (or all if no room_id)
      const pilots = e.room_id
        ? state.pilots.filter(p => p.roomId !== e.room_id)
        : [];
      const rooms = updateRoom(state.rooms, e.room_id, r => ({
        ...r, current_track: currentTrack, track_since: now,
      }));
      return {
        ...state, currentTrack, trackSince: now, trackRecord: null,
        pilots, raceId: null, raceStatus: pilots.length > 0 ? 'racing' : 'waiting', raceResult: null,
        rooms,
        feedEvents: appendFeed(state.feedEvents, feed('track', `Track changed to ${e.env} · ${e.track}`, e.timestamp_utc)),
      };
    }

    case 'overseer_state': {
      const e = action.payload;
      const rooms = updateRoom(state.rooms, e.room_id, r => ({ ...r, overseer: e }));
      return { ...state, playlist: e, rooms };
    }

    case 'competition_standings_update':
      return { ...state, compStandings: action.payload.standings || [] };

    case 'competition_points_awarded': {
      const e = action.payload;
      const msg = e.nick ? `${e.nick} earned competition points` : 'Competition points awarded';
      return { ...state, feedEvents: appendFeed(state.feedEvents, feed('comp', msg, e.timestamp_utc)) };
    }

    // REST data
    case 'SET_STATUS': {
      const d = action.payload;
      const updates = { pluginConnected: d.plugin_connected ?? null };
      // Use REST status as fallback if WS snapshot hasn't provided data yet
      if ((!state.currentTrack || !state.currentTrack.track) && d.current_track?.track) {
        updates.currentTrack = d.current_track;
        updates.trackSince = d.track_since || null;
      }
      if (!state.playlist && d.playlist) {
        updates.playlist = d.playlist;
      }
      return { ...state, ...updates };
    }

    case 'SET_PILOT_ACTIVITY':
      return { ...state, pilotActivity: action.payload };

    case 'SET_STATS_OVERVIEW':
      return { ...state, statsOverview: action.payload };

    case 'SET_COMPETITION': {
      const d = action.payload;
      return { ...state, competition: d.competition || null, currentWeek: d.current_week || null };
    }

    case 'SET_COMP_STANDINGS':
      return { ...state, compStandings: action.payload };

    case 'SET_TRACK_RECORD':
      return { ...state, trackRecord: action.payload };

    case 'SET_PLAYER_STATS':
      return { ...state, playerStats: action.payload };

    case 'CLEAR_FLASH': {
      const pilots = state.pilots.map(p => ({ ...p, flash: false }));
      return { ...state, pilots };
    }

    case 'SETTLE_PLAYER': {
      const actor = action.payload;
      const p = state.players.find(pl => pl.actor === actor);
      if (!p) return state;
      if (p.status === 'leaving') {
        return { ...state, players: state.players.filter(pl => pl.actor !== actor) };
      }
      if (p.status === 'joining') {
        return { ...state, players: state.players.map(pl => pl.actor === actor ? { ...pl, status: 'online' } : pl) };
      }
      return state;
    }

    default:
      return state;
  }
}

function fmtMsInline(ms) {
  if (ms == null) return '—';
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = (totalSec % 60).toFixed(3).padStart(6, '0');
  return m > 0 ? `${m}:${s}` : `${s}s`;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export default function useLiveState() {
  const [state, dispatch] = useReducer(reducer, initial);
  const statsFetchTimer = useRef(null);
  const prevPlayersKey = useRef('');

  // WebSocket
  const { connected } = useWebSocket(useCallback((event) => {
    dispatch({ type: event.event_type, payload: event });
  }, []), true);

  useEffect(() => {
    dispatch({ type: 'SET_CONNECTED', payload: connected });
  }, [connected]);

  // Initial REST fetches
  useEffect(() => {
    getStatus().then(d => dispatch({ type: 'SET_STATUS', payload: d })).catch(() => {});
    getPilotActivity().then(d => dispatch({ type: 'SET_PILOT_ACTIVITY', payload: d })).catch(() => {});
    getStatsOverview().then(d => dispatch({ type: 'SET_STATS_OVERVIEW', payload: d })).catch(() => {});
    getCompetitionCurrent().then(d => {
      dispatch({ type: 'SET_COMPETITION', payload: d });
      // Also fetch current standings for widget
      getCurrentWeekStandings().then(s => dispatch({ type: 'SET_COMP_STANDINGS', payload: s })).catch(() => {});
    }).catch(() => {});
  }, []);

  // Track leaderboard on track change
  useEffect(() => {
    if (!state.currentTrack?.env || !state.currentTrack?.track) return;
    let cancelled = false;
    getTrackLeaderboard(state.currentTrack.env, state.currentTrack.track)
      .then(d => { if (!cancelled) dispatch({ type: 'SET_TRACK_RECORD', payload: d }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [state.currentTrack?.env, state.currentTrack?.track]);

  // Player stats fetch (debounced 500ms)
  useEffect(() => {
    const nicks = state.players.filter(p => p.status !== 'leaving').map(p => p.nick);
    const key = nicks.sort().join(',');
    if (key === prevPlayersKey.current || nicks.length === 0) return;
    prevPlayersKey.current = key;

    if (statsFetchTimer.current) clearTimeout(statsFetchTimer.current);
    statsFetchTimer.current = setTimeout(() => {
      getOnlineStats(nicks)
        .then(d => dispatch({ type: 'SET_PLAYER_STATS', payload: d }))
        .catch(() => {});
    }, 500);
  }, [state.players]);

  // Clear flash after animation
  useEffect(() => {
    if (state.pilots.some(p => p.flash)) {
      const t = setTimeout(() => dispatch({ type: 'CLEAR_FLASH' }), 1100);
      return () => clearTimeout(t);
    }
  }, [state.pilots]);

  // Settle joining/leaving players
  useEffect(() => {
    const transient = state.players.filter(p => p.status === 'joining' || p.status === 'leaving');
    if (transient.length === 0) return;
    const timers = transient.map(p => {
      const ms = p.status === 'joining' ? 1100 : 2000;
      return setTimeout(() => dispatch({ type: 'SETTLE_PLAYER', payload: p.actor }), ms);
    });
    return () => timers.forEach(clearTimeout);
  }, [state.players]);

  return state;
}
