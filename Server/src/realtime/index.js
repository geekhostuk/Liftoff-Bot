/**
 * Realtime Server
 *
 * Owns all WebSocket connections (plugin, public live, admin live),
 * in-memory state, domain services (playlist, competition, idle kick,
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
const playlistRunner = require('../playlistRunner');
const competitionRunner = require('../competitionRunner');
const idleKick = require('../idleKick');
const tagRunner = require('../tagRunner');
const tagVote = require('../tagVote');

async function main() {
  // ── Database ──────────────────────────────────────────────────────────────
  await initDatabase();

  // ── WebSocket HTTP server (port 3000) ─────────────────────────────────────
  const wsApp = express();
  const wsServer = http.createServer(wsApp);

  const { broadcastPublic, broadcastAdmin } = createLiveSocketServer(wsServer);
  broadcast.init(broadcastPublic, broadcastAdmin);
  await createPluginSocketServer(wsServer);

  // Initialise playlist runner
  playlistRunner.init(broadcast.broadcastAll);

  // Start competition runner (week lifecycle + playlist calendar)
  await competitionRunner.start();
  broadcast.onBroadcast((msg) => {
    if (msg.event_type === 'playlist_state') competitionRunner.onPlaylistStateChange(msg);
  });

  // Try resuming playlist runner from persisted state (skipped if competition runner already started one)
  await playlistRunner.tryResume();

  // Try resuming tag runner from persisted config (only if competition isn't managing playlists)
  await tagRunner.tryResume();

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

  // ── Playlist ──────────────────────────────────────────────────────────────
  internal.post('/internal/playlist/start', async (req, res) => {
    try {
      const { playlist_id, interval_ms, start_index = 0 } = req.body;
      await playlistRunner.startPlaylist(playlist_id, interval_ms, start_index);
      res.json(playlistRunner.getState());
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  internal.post('/internal/playlist/stop', (req, res) => {
    playlistRunner.stopPlaylist();
    res.json({ ok: true });
  });

  internal.post('/internal/playlist/skip', (req, res) => {
    playlistRunner.skipToNext();
    res.json(playlistRunner.getState());
  });

  internal.get('/internal/playlist/state', (req, res) => {
    res.json(playlistRunner.getState());
  });

  // ── Tag runner ──────────────────────────────────────────────────────────
  internal.post('/internal/tag-runner/start', async (req, res) => {
    try {
      const { tag_names, interval_ms } = req.body;
      await tagRunner.startTagRunner(tag_names, interval_ms);
      res.json(tagRunner.getState());
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  internal.post('/internal/tag-runner/stop', (req, res) => {
    tagRunner.stopTagRunner();
    res.json({ ok: true });
  });

  internal.post('/internal/tag-runner/skip', async (req, res) => {
    await tagRunner.skipToNext();
    res.json(tagRunner.getState());
  });

  internal.get('/internal/tag-runner/state', (req, res) => {
    res.json(tagRunner.getState());
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

  // ── Competition runner ────────────────────────────────────────────────────
  internal.get('/internal/competition/runner/state', (req, res) => {
    res.json(competitionRunner.getState());
  });

  internal.post('/internal/competition/runner/auto', async (req, res) => {
    await competitionRunner.setAutoManaged(!!req.body.enabled);
    res.json(competitionRunner.getState());
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
      playlist: playlistRunner.getState(),
      competition: competitionRunner.getState(),
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
      playlist: playlistRunner.getState(),
      tag_runner: tagRunner.getState(),
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
