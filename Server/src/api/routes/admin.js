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
const { fetchWorkshopItem, resolveAuthorName } = require('../../steamWorkshop');
const { getOrCreateCurrentWeek } = require('../../db/trackOverseer');
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

// ── Chat template variables & preview ────────────────────────────────────────

const TEMPLATE_VARIABLES = [
  { key: 'nick', description: 'Player nickname', triggers: ['player_joined', 'player_new', 'player_returned'] },
  { key: 'env', description: 'Track environment name', triggers: ['track_change'] },
  { key: 'track', description: 'Track name', triggers: ['track_change'] },
  { key: 'race', description: 'Race mode', triggers: ['track_change'] },
  { key: 'mins', description: 'Minutes until next track (pre-change only)', triggers: ['track_change'] },
  { key: 'race_id', description: 'Race ID (first 8 chars)', triggers: ['race_start'] },
  { key: 'winner', description: 'Race winner display name', triggers: ['race_end'] },
  { key: 'time', description: "Winner's finish time", triggers: ['race_end'] },
  { key: '1st', description: '1st place pilot (weekly standings)', triggers: ['*'] },
  { key: '2nd', description: '2nd place pilot (weekly standings)', triggers: ['*'] },
  { key: '3rd', description: '3rd place pilot (weekly standings)', triggers: ['*'] },
  { key: 'playlist', description: 'Current playlist name', triggers: ['*'] },
  { key: 'player_points', description: "Player's weekly competition points", triggers: ['player_joined', 'player_new', 'player_returned'] },
  { key: 'player_position', description: "Player's weekly competition rank (or 'unranked')", triggers: ['player_joined', 'player_new', 'player_returned'] },
];

router.get('/chat/template-variables', (req, res) => {
  res.json(TEMPLATE_VARIABLES);
});

router.post('/chat/template-preview', async (req, res) => {
  const { template = '' } = req.body;
  if (!template.trim()) return res.status(400).json({ error: 'template is required' });
  try {
    const result = await rt.previewTemplate(template);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to preview template' });
  }
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
  const osState = await rt.getOverseerState();
  if (osState.playlist_id === id && osState.running) {
    await rt.stopOverseer();
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
    res.json(await rt.startOverseerPlaylist(Number(req.params.id), intervalMs, startIndex));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/playlist/stop', async (req, res) => {
  res.json(await rt.stopOverseer());
});

router.post('/playlist/skip', async (req, res) => {
  res.json(await rt.skipOverseer());
});

router.get('/playlist/state', async (req, res) => {
  res.json(await rt.getOverseerState());
});

// ── Track Overseer (via realtime) ────────────────────────────────────────────

router.get('/overseer/state', async (req, res) => {
  res.json(await rt.getOverseerState());
});

router.post('/overseer/start-playlist', strictLimiter, async (req, res) => {
  const { playlist_id, interval_ms, start_index = 0 } = req.body;
  if (!playlist_id) return res.status(400).json({ error: 'playlist_id is required' });
  const intervalMs = Math.max(5000, Number(interval_ms) || 15 * 60 * 1000);
  try {
    res.json(await rt.startOverseerPlaylist(Number(playlist_id), intervalMs, Math.max(0, Number(start_index) || 0)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/overseer/start-tags', strictLimiter, async (req, res) => {
  const { tag_names, interval_ms } = req.body;
  if (!Array.isArray(tag_names) || tag_names.length === 0) {
    return res.status(400).json({ error: 'tag_names must be a non-empty array' });
  }
  const intervalMs = Math.max(5000, Number(interval_ms) || 10 * 60 * 1000);
  try {
    res.json(await rt.startOverseerTags(tag_names, intervalMs));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/overseer/stop', async (req, res) => {
  res.json(await rt.stopOverseer());
});

router.post('/overseer/skip', async (req, res) => {
  res.json(await rt.skipOverseer());
});

router.post('/overseer/extend', async (req, res) => {
  const ms = Math.max(10000, Number(req.body.ms) || 300000);
  res.json(await rt.extendOverseer(ms));
});

router.post('/overseer/skip-to-index', async (req, res) => {
  const { index } = req.body;
  if (index === undefined) return res.status(400).json({ error: 'index is required' });
  res.json(await rt.skipToIndex(Number(index)));
});

router.post('/overseer/next-playlist', async (req, res) => {
  const { playlist_id, interval_ms } = req.body;
  if (!playlist_id) return res.status(400).json({ error: 'playlist_id is required' });
  const intervalMs = Math.max(5000, Number(interval_ms) || 15 * 60 * 1000);
  try {
    res.json(await rt.setNextPlaylist(Number(playlist_id), intervalMs));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/overseer/next-playlist', async (req, res) => {
  res.json(await rt.clearNextPlaylist());
});

// ── Queue (via realtime) ──────────────────────────────────────────────────────

router.get('/queue', async (req, res) => {
  res.json(await rt.getQueue());
});

router.post('/queue', async (req, res) => {
  const { env = '', track = '', race = '', workshop_id = '' } = req.body;
  if (!env && !track && !workshop_id) {
    return res.status(400).json({ error: 'Provide at least env+track or workshop_id' });
  }
  try {
    res.status(201).json(await rt.addToQueue({ env, track, race, workshop_id }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/queue/:id', async (req, res) => {
  res.json(await rt.removeFromQueue(Number(req.params.id)));
});

router.post('/queue/:id/move', async (req, res) => {
  const { direction } = req.body;
  if (!['up', 'down'].includes(direction)) return res.status(400).json({ error: 'direction must be up or down' });
  res.json(await rt.reorderQueue(Number(req.params.id), direction));
});

router.delete('/queue', async (req, res) => {
  res.json(await rt.clearQueue());
});

// ── Tracks upcoming & history (via realtime) ─────────────────────────────────

router.get('/tracks/upcoming', async (req, res) => {
  const count = parseInt(req.query.count || '10', 10);
  res.json(await rt.getUpcomingTracks(count));
});

router.get('/tracks/history', async (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  const offset = parseInt(req.query.offset || '0', 10);
  res.json(await rt.getTrackHistory(limit, offset));
});

// ── Scoring (recalculate) ───────────────────────────────────────────────────

router.post('/scoring/recalculate/:weekId', strictLimiter, async (req, res) => {
  try {
    res.json(await recalculateWeek(Number(req.params.weekId)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/scoring/current-week', async (req, res) => {
  const week = await getOrCreateCurrentWeek();
  if (!week) return res.status(404).json({ error: 'No active scoring period' });
  const standings = await db.getWeeklyStandings(week.id);
  res.json({ week, standings });
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

router.post('/tracks/:id/steam-fetch', strictLimiter, async (req, res) => {
  const track = await db.getTrackById(Number(req.params.id));
  if (!track) return res.status(404).json({ error: 'Track not found' });
  if (!track.steam_id) return res.status(400).json({ error: 'Track has no steam_id set' });

  const item = await fetchWorkshopItem(track.steam_id);
  if (!item) return res.status(404).json({ error: 'Workshop item not found on Steam' });

  item.authorName = await resolveAuthorName(item.authorId);

  const row = await db.updateTrackSteamData(track.id, item);
  res.json(row);
});

router.post('/tracks/steam-fetch-all', strictLimiter, async (req, res) => {
  const tracks = await db.getTracks();
  const withSteamId = tracks.filter(t => t.steam_id && !t.steam_fetched_at);

  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const track of withSteamId) {
    try {
      const item = await fetchWorkshopItem(track.steam_id);
      if (!item) { skipped++; continue; }
      item.authorName = await resolveAuthorName(item.authorId);
      await db.updateTrackSteamData(track.id, item);
      updated++;
    } catch (err) {
      errors.push({ track: `${track.env} / ${track.track}`, error: err.message });
    }
    await new Promise(r => setTimeout(r, 200));
  }

  res.json({ updated, skipped, errors });
});

router.get('/tracks/steam-image-proxy', async (req, res) => {
  const { url } = req.query;
  const allowed = ['https://images.steamusercontent.com/', 'https://steamuserimages-a.akamaihd.net/', 'https://clan.akamai.steamstatic.com/', 'https://clan.cloudflare.steamstatic.com/', 'https://steamcdn-a.akamaihd.net/'];
  if (!url || !allowed.some(prefix => url.startsWith(prefix))) {
    return res.status(400).json({ error: 'Invalid image URL' });
  }
  const upstream = await fetch(url);
  if (!upstream.ok) return res.status(502).json({ error: 'Failed to fetch image' });
  res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=86400');
  const buffer = await upstream.arrayBuffer();
  res.send(Buffer.from(buffer));
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

// ── Tag runner (backward compat — routes through overseer) ──────────────────

router.post('/tag-runner/start', strictLimiter, async (req, res) => {
  const { tag_names, interval_ms } = req.body;
  if (!Array.isArray(tag_names) || tag_names.length === 0) {
    return res.status(400).json({ error: 'tag_names must be a non-empty array' });
  }
  const intervalMs = Math.max(5000, Number(interval_ms) || 10 * 60 * 1000);
  try {
    res.json(await rt.startOverseerTags(tag_names, intervalMs));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/tag-runner/stop', async (req, res) => {
  res.json(await rt.stopOverseer());
});

router.post('/tag-runner/skip', async (req, res) => {
  res.json(await rt.skipOverseer());
});

router.get('/tag-runner/state', async (req, res) => {
  res.json(await rt.getOverseerState());
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

// ── Track comment moderation ────────────────────────────────────────────────

router.delete('/track-comments/:commentId', async (req, res) => {
  await db.deleteTrackComment(Number(req.params.commentId));
  res.json({ ok: true });
});

// ── Track Manager ─────────────────────────────────────────────────────────────

router.get('/track-manager', async (req, res) => {
  const search = req.query.search || '';
  const env = req.query.env || '';
  const sort = req.query.sort || 'name';
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  res.json(await db.getAdminTrackList({ search, env, sort, limit, offset }));
});

router.get('/track-manager/envs', async (req, res) => {
  const { rows } = await db.getPool().query('SELECT DISTINCT env FROM tracks ORDER BY env');
  res.json(rows.map(r => r.env));
});

router.get('/track-manager/:id/playlists', async (req, res) => {
  res.json(await db.getTrackPlaylistMemberships(Number(req.params.id)));
});

router.get('/track-manager/:id/comments', async (req, res) => {
  res.json(await db.getAdminTrackComments(Number(req.params.id)));
});

router.get('/track-manager/:id/user-tags', async (req, res) => {
  res.json(await db.getTrackUserTags(Number(req.params.id)));
});

router.delete('/track-manager/:id/user-tags/:label', async (req, res) => {
  await db.deleteUserTagLabel(Number(req.params.id), req.params.label);
  res.json({ ok: true });
});

module.exports = router;
