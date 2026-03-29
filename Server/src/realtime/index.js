/**
 * Realtime Server
 *
 * Owns all WebSocket connections (plugin, public live, admin live),
 * in-memory state, domain services (track overseer, idle kick,
 * skip/extend vote), event ingestion, and broadcasting.
 *
 * Exposes an internal HTTP API (port 3001) for the API server to send
 * commands and query domain service state.
 */

require('dotenv').config();

const http = require('http');
const express = require('express');
const { initDatabase } = require('../database');
const { createPluginSocketServer, sendCommand, sendCommandAwait, getPluginSocket, setCurrentTrack, fireTemplates, buildTemplateVars } = require('../pluginSocket');
const { createLiveSocketServer } = require('../liveSocket');
const broadcast = require('../broadcast');
const state = require('../state');
const trackOverseer = require('../trackOverseer');
const idleKick = require('../idleKick');
const tagVote = require('../tagVote');
const db = require('../database');
const scoring = require('../competitionScoring');

async function checkWeekTransition() {
  // Finalise any expired week with full batch scoring + broadcast
  const expired = await db.getOverdueActiveWeek();
  if (expired) {
    console.log(`[realtime] Finalising expired week ${expired.id} (week ${expired.week_number})`);
    await scoring.finaliseWeek(expired.id);
  }

  // Promote a scheduled week to active if its start time has arrived
  const scheduled = await db.getNextScheduledWeek();
  if (scheduled) {
    console.log(`[realtime] Activating scheduled week ${scheduled.id} (week ${scheduled.week_number})`);
    await db.updateWeekStatus(scheduled.id, 'active');
    broadcast.broadcastAll({
      event_type: 'competition_week_started',
      week_id: scheduled.id,
      week_number: scheduled.week_number,
      starts_at: scheduled.starts_at,
      ends_at: scheduled.ends_at,
    });
    return;
  }

  // Fallback: auto-create current week if none exists; broadcast if newly created
  const before = await db.getActiveWeek();
  const week = await db.getOrCreateCurrentWeek();
  if (week && !before) {
    console.log(`[realtime] New competition week ${week.id} started (week ${week.week_number})`);
    broadcast.broadcastAll({
      event_type: 'competition_week_started',
      week_id: week.id,
      week_number: week.week_number,
      starts_at: week.starts_at,
      ends_at: week.ends_at,
    });
  }
}

async function main() {
  // ── Database ──────────────────────────────────────────────────────────────
  await initDatabase();

  // ── WebSocket HTTP server (port 3000) ─────────────────────────────────────
  const wsApp = express();
  const wsServer = http.createServer(wsApp);

  const { broadcastPublic, broadcastAdmin } = createLiveSocketServer(wsServer);
  broadcast.init(broadcastPublic, broadcastAdmin);
  await createPluginSocketServer(wsServer);

  // Initialise track overseer
  trackOverseer.init(broadcast.broadcastAll);

  // Try resuming overseer from persisted state
  await trackOverseer.tryResume();

  // Scoring tick: auto-finalise expired weeks (with batch scoring) and ensure current period exists
  setInterval(async () => {
    try {
      await checkWeekTransition();
    } catch (err) {
      console.error('[realtime] Scoring tick error:', err.message);
    }
  }, 60 * 60 * 1000); // hourly

  // Run once on startup
  checkWeekTransition().catch(err => {
    console.error('[realtime] Startup week transition error:', err.message);
  });

  const WS_PORT = process.env.WS_PORT || 3000;
  wsServer.listen(WS_PORT, () => {
    console.log(`[realtime] WebSocket server on port ${WS_PORT}`);
  });

  // ── Internal HTTP API (port 3001) ─────────────────────────────────────────
  const internal = express();
  internal.use(express.json());

  // ── Plugin commands ───────────────────────────────────────────────────────
  internal.post('/internal/command', (req, res) => {
    const sent = sendCommand(req.body);
    res.json({ ok: sent });
  });

  internal.post('/internal/command-await', async (req, res) => {
    try {
      const ack = await sendCommandAwait(req.body);
      res.json(ack);
    } catch (err) {
      res.status(503).json({ error: err.message });
    }
  });

  internal.get('/internal/plugin-status', (req, res) => {
    const socket = getPluginSocket();
    res.json({ plugin_connected: socket !== null && socket.readyState === 1 });
  });

  // ── Track ─────────────────────────────────────────────────────────────────
  internal.post('/internal/track/set', (req, res) => {
    const { env = '', track = '', race = '' } = req.body;
    setCurrentTrack({ env, track, race });
    const sent = sendCommand({ cmd: 'set_track', env, track, race, workshop_id: req.body.workshop_id || '' });
    if (sent) {
      broadcast.broadcastAll({ event_type: 'track_changed', env, track, race });
      fireTemplates('track_change', { env, track, race });
    }
    res.json({ ok: sent });
  });

  // ── Track Overseer ────────────────────────────────────────────────────────
  internal.get('/internal/overseer/state', (req, res) => {
    res.json(trackOverseer.getState());
  });

  internal.post('/internal/overseer/start-playlist', async (req, res) => {
    try {
      const { playlist_id, interval_ms, start_index = 0 } = req.body;
      await trackOverseer.startPlaylist(playlist_id, interval_ms, start_index);
      res.json(trackOverseer.getState());
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  internal.post('/internal/overseer/start-tags', async (req, res) => {
    try {
      const { tag_names, interval_ms } = req.body;
      await trackOverseer.startTagMode(tag_names, interval_ms);
      res.json(trackOverseer.getState());
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  internal.post('/internal/overseer/stop', (req, res) => {
    trackOverseer.stop();
    res.json({ ok: true });
  });

  internal.post('/internal/overseer/skip', async (req, res) => {
    await trackOverseer.skipToNext();
    res.json(trackOverseer.getState());
  });

  internal.post('/internal/overseer/extend', async (req, res) => {
    const { ms } = req.body;
    await trackOverseer.extendTimer(ms || 300000);
    res.json(trackOverseer.getState());
  });

  internal.post('/internal/overseer/skip-to-index', (req, res) => {
    const { index } = req.body;
    trackOverseer.skipToIndex(index);
    res.json(trackOverseer.getState());
  });

  // ── Playlist Queue ────────────────────────────────────────────────────────
  internal.get('/internal/overseer/playlist-queue', async (req, res) => {
    res.json(await db.getPlaylistQueue());
  });

  internal.post('/internal/overseer/playlist-queue', async (req, res) => {
    const { playlist_id, interval_ms, shuffle, start_after } = req.body;
    try {
      res.json(await trackOverseer.addToPlaylistQueue(playlist_id, interval_ms, shuffle, start_after));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  internal.delete('/internal/overseer/playlist-queue/:id', async (req, res) => {
    await trackOverseer.removeFromPlaylistQueue(Number(req.params.id));
    res.json({ ok: true });
  });

  internal.post('/internal/overseer/playlist-queue/:id/move', async (req, res) => {
    await trackOverseer.reorderPlaylistQueue(Number(req.params.id), req.body.direction);
    res.json({ ok: true });
  });

  internal.delete('/internal/overseer/playlist-queue', async (req, res) => {
    await trackOverseer.clearPlaylistQueue();
    res.json({ ok: true });
  });

  // ── Queue ─────────────────────────────────────────────────────────────────
  internal.get('/internal/queue', async (req, res) => {
    const queue = await db.getQueue();
    res.json(queue);
  });

  internal.post('/internal/queue', async (req, res) => {
    try {
      const item = await db.addToQueue(req.body);
      res.json(item);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  internal.delete('/internal/queue/:id', async (req, res) => {
    await db.removeFromQueue(parseInt(req.params.id, 10));
    res.json({ ok: true });
  });

  internal.post('/internal/queue/:id/move', async (req, res) => {
    await db.reorderQueue(parseInt(req.params.id, 10), req.body.direction);
    res.json({ ok: true });
  });

  internal.delete('/internal/queue', async (req, res) => {
    await db.clearQueue();
    res.json({ ok: true });
  });

  // ── Tracks info ───────────────────────────────────────────────────────────
  internal.get('/internal/tracks/upcoming', (req, res) => {
    const count = parseInt(req.query.count || '10', 10);
    res.json(trackOverseer.getUpcoming(count));
  });

  internal.get('/internal/tracks/history', async (req, res) => {
    const limit = parseInt(req.query.limit || '50', 10);
    const offset = parseInt(req.query.offset || '0', 10);
    const history = await db.getTrackHistory(limit, offset);
    res.json(history);
  });

  // ── Tag vote ──────────────────────────────────────────────────────────────
  internal.post('/internal/tag-vote/start', (req, res) => {
    try {
      const { tag_options, duration_ms } = req.body;
      tagVote.startVote(tag_options, duration_ms, 'admin');
      res.json(tagVote.getState());
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  internal.post('/internal/tag-vote/cancel', (req, res) => {
    tagVote.cancelVote();
    res.json({ ok: true });
  });

  internal.get('/internal/tag-vote/state', (req, res) => {
    res.json(tagVote.getState());
  });

  // ── Idle kick ─────────────────────────────────────────────────────────────
  internal.get('/internal/idle-kick/status', (req, res) => {
    res.json(idleKick.getIdleInfo());
  });

  internal.get('/internal/idle-kick/whitelist', (req, res) => {
    res.json({ whitelist: idleKick.getWhitelist() });
  });

  internal.post('/internal/idle-kick/whitelist', async (req, res) => {
    await idleKick.addToWhitelist(req.body.nick);
    res.json({ ok: true, whitelist: idleKick.getWhitelist() });
  });

  internal.delete('/internal/idle-kick/whitelist', async (req, res) => {
    await idleKick.removeFromWhitelist(req.body.nick);
    res.json({ ok: true, whitelist: idleKick.getWhitelist() });
  });

  internal.post('/internal/idle-kick/unreg-kick', (req, res) => {
    const { enabled } = req.body;
    idleKick.setUnregKickEnabled(enabled);
    res.json({ ok: true, unregKickEnabled: idleKick.getUnregKickEnabled() });
  });

  // ── Session sync (from API server) ───────────────────────────────────────
  const { registerSession, destroySession: removeSession } = require('../auth');

  internal.post('/internal/session/register', (req, res) => {
    const { token, session } = req.body;
    if (!token || !session) return res.status(400).json({ error: 'token and session required' });
    registerSession(token, session);
    res.json({ ok: true });
  });

  internal.post('/internal/session/destroy', (req, res) => {
    const { token } = req.body;
    if (token) removeSession(token);
    res.json({ ok: true });
  });

  // ── Broadcast ─────────────────────────────────────────────────────────────
  internal.post('/internal/broadcast', (req, res) => {
    broadcast.broadcastAll(req.body);
    res.json({ ok: true });
  });

  // ── Tracks info (public tracks page) ─────────────────────────────────────
  internal.get('/internal/tracks/info', (req, res) => {
    res.json({
      overseer: trackOverseer.getState(),
    });
  });

  // ── Chat template preview ────────────────────────────────────────────────
  internal.post('/internal/chat/template-preview', async (req, res) => {
    const { template = '' } = req.body;
    if (!template.trim()) return res.status(400).json({ error: 'template is required' });
    const vars = await buildTemplateVars();
    let resolved = template;
    for (const [key, val] of Object.entries(vars)) {
      resolved = resolved.replaceAll(`{${key}}`, val ?? '');
    }
    resolved = resolved.trim();
    res.json({ resolved, length: resolved.length });
  });

  // ── State ─────────────────────────────────────────────────────────────────
  internal.get('/internal/state', (req, res) => {
    res.json({
      current_track: state.getCurrentTrack(),
      track_since: state.getCurrentTrackSince(),
      online_players: state.getOnlinePlayers(),
      overseer: trackOverseer.getState(),
      tag_vote: tagVote.getState(),
    });
  });

  const INTERNAL_PORT = process.env.INTERNAL_PORT || 3001;
  internal.listen(INTERNAL_PORT, () => {
    console.log(`[realtime] Internal API on port ${INTERNAL_PORT}`);
  });
}

main().catch(err => {
  console.error('[realtime] Fatal error during startup:', err);
  process.exit(1);
});
