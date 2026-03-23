/**
 * Admin routes for the API server.
 *
 * Database operations are called directly. Plugin commands, playlist control,
 * competition runner, idle kick, and broadcasting go through realtimeClient.
 */

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const rt = require('../realtimeClient');
const db = require('../../database');
const { recalculateWeek } = require('../../competitionScoring');
const { hashPassword, verifyPassword, createSession, getSession, destroySession, destroyUserSessions } = require('../../auth');

const router = Router();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const COOKIE_NAME = 'liftoff_admin';

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) cookies[k] = v.join('=');
  }
  return cookies;
}

function extractToken(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  const cookies = parseCookies(req.headers.cookie);
  return cookies[COOKIE_NAME] || '';
}

// ── Login endpoint (before auth middleware) ─────────────────────────────────

router.post('/login', async (req, res) => {
  const { username, password, token } = req.body || {};

  if (token) {
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true, sameSite: 'strict', path: '/', maxAge: 24 * 60 * 60 * 1000,
    });
    return res.json({ ok: true });
  }

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const user = await db.getUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const sessionToken = createSession(user);
  // Sync session to realtime server so admin WebSocket auth works
  const session = getSession(sessionToken);
  rt.syncSession(sessionToken, session).catch(() => {});
  res.cookie(COOKIE_NAME, sessionToken, {
    httpOnly: true, sameSite: 'strict', path: '/', maxAge: 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true, username: user.username });
});

router.post('/logout', (req, res) => {
  const token = extractToken(req);
  destroySession(token);
  rt.destroyRemoteSession(token).catch(() => {});
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

// ── Auth middleware ─────────────────────────────────────────────────────────

router.use((req, res, next) => {
  const token = extractToken(req);
  const session = getSession(token);
  if (session) { req.adminUser = session; return next(); }
  if (ADMIN_TOKEN && token === ADMIN_TOKEN) {
    req.adminUser = { userId: 0, username: '_api_', role: 'admin' };
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
});

// ── Rate limiting ───────────────────────────────────────────────────────────

const generalLimiter = rateLimit({
  windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests — try again in a minute' },
});

const strictLimiter = rateLimit({
  windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests — try again in a minute' },
});

router.use(generalLimiter);

// ── Plugin commands (via realtime) ──────────────────────────────────────────

router.post('/track/next', async (req, res) => {
  const sent = await rt.sendCommand({ cmd: 'next_track' });
  if (!sent) return res.status(503).json({ error: 'Plugin not connected' });
  res.json({ ok: true });
});

router.post('/track/set', strictLimiter, async (req, res) => {
  const { env = '', track = '', race = '', workshop_id = '' } = req.body;
  if (!env && !track && !workshop_id) {
    return res.status(400).json({ error: 'Provide at least env+track or workshop_id' });
  }
  const sent = await rt.setTrack({ env, track, race, workshop_id });
  if (!sent) return res.status(503).json({ error: 'Plugin not connected' });
  res.json({ ok: true });
});

router.put('/playlist', async (req, res) => {
  const { sequence, apply_immediately = false } = req.body;
  if (!sequence || typeof sequence !== 'string') {
    return res.status(400).json({ error: 'sequence is required (pipe/semicolon format)' });
  }
  const sent = await rt.sendCommand({ cmd: 'update_playlist', sequence, apply_immediately });
  if (!sent) return res.status(503).json({ error: 'Plugin not connected' });
  res.json({ ok: true });
});

router.post('/catalog/refresh', async (req, res) => {
  const sent = await rt.sendCommand({ cmd: 'request_catalog' });
  if (!sent) return res.status(503).json({ error: 'Plugin not connected' });
  res.json({ ok: true });
});

router.post('/players/kick', strictLimiter, async (req, res) => {
  const actor = parseInt(req.body.actor);
  if (!actor || isNaN(actor)) return res.status(400).json({ error: 'actor (number) is required' });
  try {
    const ack = await rt.sendCommandAwait({ cmd: 'kick_player', actor });
    if (ack.status === 'timeout') return res.json({ ok: true, ack: 'timeout' });
    if (ack.status === 'error') return res.status(502).json({ error: ack.message || 'Plugin error' });
    res.json({ ok: true, ack: ack.status });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

router.get('/status', async (req, res) => {
  res.json(await rt.getPluginStatus());
});

// ── Chat (send via realtime) ────────────────────────────────────────────────

router.post('/chat/send', async (req, res) => {
  const { message = '' } = req.body;
  const trimmed = message.trim();
  if (!trimmed) return res.status(400).json({ error: 'message is required' });
  if (trimmed.length > 500) return res.status(400).json({ error: 'message too long (max 500 chars)' });
  const sent = await rt.sendCommand({ cmd: 'send_chat', message: trimmed });
  if (!sent) return res.status(503).json({ error: 'Plugin not connected' });
  res.json({ ok: true });
});

// ── User management (direct DB) ─────────────────────────────────────────────

router.get('/users', async (req, res) => {
  res.json(await db.getUsers());
});

router.post('/users', strictLimiter, async (req, res) => {
  const { username = '', password = '' } = req.body;
  if (!username.trim() || !password) return res.status(400).json({ error: 'username and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const user = await db.createUser(username.trim(), hashPassword(password));
    res.status(201).json(user);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    throw err;
  }
});

router.delete('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (req.adminUser && req.adminUser.userId === id) return res.status(400).json({ error: 'Cannot delete your own account' });
  destroyUserSessions(id);
  await db.deleteUser(id);
  res.json({ ok: true });
});

// ── Idle Kick (via realtime) ────────────────────────────────────────────────

router.get('/idle-kick/status', async (req, res) => {
  res.json(await rt.getIdleKickStatus());
});

router.get('/idle-kick/whitelist', async (req, res) => {
  res.json(await rt.getIdleKickWhitelist());
});

router.post('/idle-kick/whitelist', async (req, res) => {
  const { nick = '' } = req.body;
  if (!nick.trim()) return res.status(400).json({ error: 'nick is required' });
  res.json(await rt.addToIdleKickWhitelist(nick.trim()));
});

router.delete('/idle-kick/whitelist', async (req, res) => {
  const { nick = '' } = req.body;
  if (!nick.trim()) return res.status(400).json({ error: 'nick is required' });
  res.json(await rt.removeFromIdleKickWhitelist(nick.trim()));
});

// ── Chat templates (direct DB) ──────────────────────────────────────────────

router.get('/chat/templates', async (req, res) => {
  res.json(await db.getChatTemplates());
});

router.post('/chat/templates', async (req, res) => {
  const { trigger, template, enabled = true, delay_ms = 0 } = req.body;
  if (!trigger || !template) return res.status(400).json({ error: 'trigger and template are required' });
  res.status(201).json(await db.createChatTemplate({ trigger, template, enabled, delay_ms }));
});

router.put('/chat/templates/:id', async (req, res) => {
  const { trigger, template, enabled = true, delay_ms = 0 } = req.body;
  if (!trigger || !template) return res.status(400).json({ error: 'trigger and template are required' });
  const row = await db.updateChatTemplate(Number(req.params.id), { trigger, template, enabled, delay_ms });
  if (!row) return res.status(404).json({ error: 'Template not found' });
  res.json(row);
});

router.delete('/chat/templates/:id', async (req, res) => {
  await db.deleteChatTemplate(Number(req.params.id));
  res.json({ ok: true });
});

// ── Playlists (direct DB + realtime for start/stop/skip) ────────────────────

router.get('/playlists', async (req, res) => {
  res.json(await db.getPlaylists());
});

router.post('/playlists', async (req, res) => {
  const { name = '' } = req.body;
  if (!name.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    res.status(201).json(await db.createPlaylist(name.trim()));
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

router.put('/playlists/:id', async (req, res) => {
  const { name = '' } = req.body;
  if (!name.trim()) return res.status(400).json({ error: 'name is required' });
  const row = await db.renamePlaylist(Number(req.params.id), name.trim());
  if (!row) return res.status(404).json({ error: 'Playlist not found' });
  res.json(row);
});

router.delete('/playlists/:id', async (req, res) => {
  const id = Number(req.params.id);
  const plState = await rt.getPlaylistState();
  if (plState.playlist_id === id && plState.running) {
    await rt.stopPlaylist();
  }
  await db.deletePlaylist(id);
  res.json({ ok: true });
});

router.get('/playlists/:id/tracks', async (req, res) => {
  res.json(await db.getPlaylistTracks(Number(req.params.id)));
});

router.post('/playlists/:id/tracks', async (req, res) => {
  const { env = '', track = '', race = '', workshop_id = '' } = req.body;
  if (!env && !track && !workshop_id) return res.status(400).json({ error: 'Provide env+track or workshop_id' });
  res.status(201).json(await db.addPlaylistTrack(Number(req.params.id), { env, track, race, workshop_id }));
});

router.delete('/playlists/tracks/:tid', async (req, res) => {
  await db.removePlaylistTrack(Number(req.params.tid));
  res.json({ ok: true });
});

router.post('/playlists/tracks/:tid/move', async (req, res) => {
  const { direction } = req.body;
  if (!['up', 'down'].includes(direction)) return res.status(400).json({ error: 'direction must be up or down' });
  await db.movePlaylistTrack(Number(req.params.tid), direction);
  res.json({ ok: true });
});

router.post('/playlists/:id/start', strictLimiter, async (req, res) => {
  const intervalMs = Math.max(5000, Number(req.body.interval_ms) || 15 * 60 * 1000);
  const startIndex = Math.max(0, parseInt(req.body.start_index) || 0);
  try {
    res.json(await rt.startPlaylist(Number(req.params.id), intervalMs, startIndex));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/playlist/stop', async (req, res) => {
  res.json(await rt.stopPlaylist());
});

router.post('/playlist/skip', async (req, res) => {
  res.json(await rt.skipPlaylist());
});

router.get('/playlist/state', async (req, res) => {
  res.json(await rt.getPlaylistState());
});

// ── Competition (direct DB + realtime for runner) ───────────────────────────

router.post('/competition', async (req, res) => {
  const { name = '' } = req.body;
  if (!name.trim()) return res.status(400).json({ error: 'name is required' });
  res.status(201).json(await db.createCompetition(name.trim()));
});

router.get('/competitions', async (req, res) => {
  res.json(await db.getCompetitions());
});

router.post('/competition/:id/archive', async (req, res) => {
  await db.archiveCompetition(Number(req.params.id));
  res.json({ ok: true });
});

router.post('/competition/:id/weeks', async (req, res) => {
  const { count = 4, start_date } = req.body;
  if (!start_date) return res.status(400).json({ error: 'start_date is required (ISO format)' });
  res.status(201).json(await db.generateWeeks(Number(req.params.id), Number(count), start_date));
});

router.get('/competition/:id/weeks', async (req, res) => {
  res.json(await db.getWeeks(Number(req.params.id)));
});

router.put('/competition/week/:id', async (req, res) => {
  const { status, starts_at, ends_at, week_number } = req.body;
  if (status && !['scheduled', 'active', 'finalised'].includes(status)) {
    return res.status(400).json({ error: 'status must be scheduled, active, or finalised' });
  }
  const fields = {};
  if (status) fields.status = status;
  if (starts_at) fields.starts_at = starts_at;
  if (ends_at) fields.ends_at = ends_at;
  if (week_number !== undefined) fields.week_number = Number(week_number);
  await db.updateWeek(Number(req.params.id), fields);
  res.json({ ok: true });
});

router.delete('/competition/week/:id', async (req, res) => {
  await db.deleteWeek(Number(req.params.id));
  res.json({ ok: true });
});

router.get('/competition/week/:id/playlists', async (req, res) => {
  res.json(await db.getWeekPlaylists(Number(req.params.id)));
});

router.post('/competition/week/:id/playlists', async (req, res) => {
  const { playlist_id, interval_ms = 900000 } = req.body;
  if (!playlist_id) return res.status(400).json({ error: 'playlist_id is required' });
  res.status(201).json(await db.addWeekPlaylist(Number(req.params.id), Number(playlist_id), Number(interval_ms)));
});

router.delete('/competition/week/:weekId/playlists/:wpId', async (req, res) => {
  await db.removeWeekPlaylist(Number(req.params.wpId));
  res.json({ ok: true });
});

router.post('/competition/week/:weekId/playlists/:wpId/move', async (req, res) => {
  const { direction } = req.body;
  if (!['up', 'down'].includes(direction)) return res.status(400).json({ error: 'direction must be up or down' });
  await db.moveWeekPlaylist(Number(req.params.wpId), direction);
  res.json({ ok: true });
});

router.post('/competition/recalculate/:weekId', strictLimiter, async (req, res) => {
  try {
    res.json(await recalculateWeek(Number(req.params.weekId)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/competition/runner/state', async (req, res) => {
  res.json(await rt.getCompetitionRunnerState());
});

router.post('/competition/runner/auto', async (req, res) => {
  res.json(await rt.setCompetitionAutoManaged(!!req.body.enabled));
});

// ── Tags (direct DB) ────────────────────────────────────────────────────────

router.get('/tags', async (req, res) => {
  res.json(await db.getTags());
});

router.post('/tags', async (req, res) => {
  const { name = '' } = req.body;
  if (!name.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    res.status(201).json(await db.createTag(name.trim()));
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Tag already exists' });
    throw err;
  }
});

router.put('/tags/:id', async (req, res) => {
  const { name = '' } = req.body;
  if (!name.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const row = await db.renameTag(Number(req.params.id), name.trim());
    if (!row) return res.status(404).json({ error: 'Tag not found' });
    res.json(row);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Tag name already exists' });
    throw err;
  }
});

router.delete('/tags/:id', async (req, res) => {
  await db.deleteTag(Number(req.params.id));
  res.json({ ok: true });
});

// ── Tracks (direct DB — catalog-discovered only) ─────────────────────────────

router.get('/tracks', async (req, res) => {
  res.json(await db.getTracks());
});

router.get('/tracks/:id/tags', async (req, res) => {
  res.json(await db.getTagsForTrack(Number(req.params.id)));
});

router.put('/tracks/:id/tags', async (req, res) => {
  const { tag_ids } = req.body;
  if (!Array.isArray(tag_ids)) return res.status(400).json({ error: 'tag_ids must be an array' });
  await db.setTrackTags(Number(req.params.id), tag_ids.map(Number));
  res.json(await db.getTagsForTrack(Number(req.params.id)));
});

router.post('/tracks/:id/tags', async (req, res) => {
  const { tag_id } = req.body;
  if (!tag_id) return res.status(400).json({ error: 'tag_id is required' });
  await db.addTagToTrack(Number(req.params.id), Number(tag_id));
  res.json({ ok: true });
});

router.delete('/tracks/:id/tags/:tagId', async (req, res) => {
  await db.removeTagFromTrack(Number(req.params.id), Number(req.params.tagId));
  res.json({ ok: true });
});

router.put('/tracks/:id/steam-id', async (req, res) => {
  const { steam_id } = req.body;
  if (steam_id === undefined) return res.status(400).json({ error: 'steam_id is required' });
  const row = await db.updateTrackSteamId(Number(req.params.id), steam_id);
  if (!row) return res.status(404).json({ error: 'Track not found' });
  res.json(row);
});

router.put('/tracks/:id/duration', async (req, res) => {
  const { duration_ms } = req.body;
  const value = duration_ms === null || duration_ms === undefined ? null : Number(duration_ms);
  if (value !== null && (isNaN(value) || value < 0)) return res.status(400).json({ error: 'duration_ms must be a positive number or null' });
  const row = await db.updateTrackDuration(Number(req.params.id), value);
  if (!row) return res.status(404).json({ error: 'Track not found' });
  res.json(row);
});

router.get('/tracks/by-tag/:tagId', async (req, res) => {
  res.json(await db.getTracksForTag(Number(req.params.tagId)));
});

// ── Tag runner (via realtime) ────────────────────────────────────────────────

router.post('/tag-runner/start', strictLimiter, async (req, res) => {
  const { tag_names, interval_ms } = req.body;
  if (!Array.isArray(tag_names) || tag_names.length === 0) {
    return res.status(400).json({ error: 'tag_names must be a non-empty array' });
  }
  const intervalMs = Math.max(5000, Number(interval_ms) || 10 * 60 * 1000);
  try {
    res.json(await rt.startTagRunner(tag_names, intervalMs));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/tag-runner/stop', async (req, res) => {
  res.json(await rt.stopTagRunner());
});

router.post('/tag-runner/skip', async (req, res) => {
  res.json(await rt.skipTagRunner());
});

router.get('/tag-runner/state', async (req, res) => {
  res.json(await rt.getTagRunnerState());
});

// ── Tag vote (via realtime) ──────────────────────────────────────────────────

router.post('/tag-vote/start', strictLimiter, async (req, res) => {
  const { tag_options, duration_ms } = req.body;
  if (!Array.isArray(tag_options) || tag_options.length < 2) {
    return res.status(400).json({ error: 'tag_options must be an array with at least 2 tags' });
  }
  if (tag_options.length > 4) {
    return res.status(400).json({ error: 'Maximum 4 tag options allowed' });
  }
  const durationMs = Math.max(10000, Number(duration_ms) || 120000);
  try {
    res.json(await rt.startTagVote(tag_options, durationMs));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/tag-vote/cancel', async (req, res) => {
  res.json(await rt.cancelTagVote());
});

router.get('/tag-vote/state', async (req, res) => {
  res.json(await rt.getTagVoteState());
});

module.exports = router;
