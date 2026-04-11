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

  // Try admin_users first (by username)
  const adminUser = await db.getUserByUsername(username);
  if (adminUser && verifyPassword(password, adminUser.password_hash)) {
    const sessionToken = createSession(adminUser);
    const session = getSession(sessionToken);
    rt.syncSession(sessionToken, session).catch(() => {});
    res.cookie(COOKIE_NAME, sessionToken, {
      httpOnly: true, sameSite: 'strict', path: '/', maxAge: 24 * 60 * 60 * 1000,
    });
    return res.json({ ok: true, username: adminUser.username });
  }

  // Fallback: try site_users (by email) with a custom role
  const siteUser = await db.getSiteUserWithRole(username);
  if (!siteUser || !verifyPassword(password, siteUser.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  if (!siteUser.role_id) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  if (!siteUser.email_verified) {
    return res.status(403).json({ error: 'Email not verified' });
  }
  const sessionToken = createSession({
    id: siteUser.id,
    email: siteUser.email,
    role: siteUser.role_name,
    source: 'site',
    permissions: siteUser.permissions || [],
  });
  const session = getSession(sessionToken);
  rt.syncSession(sessionToken, session).catch(() => {});
  res.cookie(COOKIE_NAME, sessionToken, {
    httpOnly: true, sameSite: 'strict', path: '/', maxAge: 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true, username: siteUser.email });
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

// ── Permission middleware factory ─────────────────────────────────────────

function requirePermission(module) {
  return async (req, res, next) => {
    if (req.adminUser.role === 'superadmin') return next();
    if (req.adminUser.userId === 0) return next(); // ADMIN_TOKEN bypass
    // Site users: check cached permissions from session
    if (req.adminUser.source === 'site') {
      if ((req.adminUser.permissions || []).includes(module)) return next();
      return res.status(403).json({ error: 'Forbidden — insufficient permissions' });
    }
    // Admin users: check admin_permissions table
    try {
      const allowed = await db.hasPermission(req.adminUser.userId, module);
      if (!allowed) return res.status(403).json({ error: 'Forbidden — insufficient permissions' });
      next();
    } catch (err) {
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

function requireSuperadmin(req, res, next) {
  if (req.adminUser.role === 'superadmin' || req.adminUser.userId === 0) return next();
  return res.status(403).json({ error: 'Superadmin access required' });
}

// ── Current user info ──────────────────────────────────────────────────────

router.get('/me', async (req, res) => {
  let permissions = [];
  if (req.adminUser.role === 'superadmin' || req.adminUser.userId === 0) {
    permissions = ['dashboard','players','tracks','chat','playlists','tags',
      'track_manager','overseer','scoring','competitions','auto_messages','users','idle_kick','bot_remote','bot2_remote'];
  } else if (req.adminUser.source === 'site') {
    permissions = req.adminUser.permissions || [];
  } else {
    permissions = await db.getPermissions(req.adminUser.userId);
  }
  res.json({
    userId: req.adminUser.userId,
    username: req.adminUser.username,
    role: req.adminUser.role,
    source: req.adminUser.source || 'admin',
    permissions,
  });
});

// ── Plugin commands (via realtime) ──────────────────────────────────────────

router.post('/track/next', requirePermission('tracks'), async (req, res) => {
  const sent = await rt.sendCommand({ cmd: 'next_track' });
  if (!sent) return res.status(503).json({ error: 'Plugin not connected' });
  res.json({ ok: true });
});

router.post('/track/set', requirePermission('tracks'), strictLimiter, async (req, res) => {
  const { env = '', track = '', race = '', workshop_id = '' } = req.body;
  if (!env && !track && !workshop_id) {
    return res.status(400).json({ error: 'Provide at least env+track or workshop_id' });
  }
  const sent = await rt.setTrack({ env, track, race, workshop_id });
  if (!sent) return res.status(503).json({ error: 'Plugin not connected' });
  res.json({ ok: true });
});

router.put('/playlist', requirePermission('playlists'), async (req, res) => {
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

router.post('/players/kick', requirePermission('players'), strictLimiter, async (req, res) => {
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

router.post('/chat/send', requirePermission('chat'), async (req, res) => {
  const { message = '' } = req.body;
  const trimmed = message.trim();
  if (!trimmed) return res.status(400).json({ error: 'message is required' });
  if (trimmed.length > 500) return res.status(400).json({ error: 'message too long (max 500 chars)' });
  const sent = await rt.sendCommand({ cmd: 'send_chat', message: trimmed });
  if (!sent) return res.status(503).json({ error: 'Plugin not connected' });
  res.json({ ok: true });
});

// ── User management (direct DB) ─────────────────────────────────────────────

router.get('/users', requirePermission('users'), async (req, res) => {
  res.json(await db.getAllUsersWithPermissions());
});

router.post('/users', requirePermission('users'), strictLimiter, async (req, res) => {
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

router.delete('/users/:id', requirePermission('users'), async (req, res) => {
  const id = Number(req.params.id);
  if (req.adminUser && req.adminUser.userId === id) return res.status(400).json({ error: 'Cannot delete your own account' });
  destroyUserSessions(id);
  await db.deleteUser(id);
  res.json({ ok: true });
});

router.get('/users/:id/permissions', requireSuperadmin, async (req, res) => {
  res.json(await db.getPermissions(Number(req.params.id)));
});

router.put('/users/:id/permissions', requireSuperadmin, async (req, res) => {
  const { permissions } = req.body;
  if (!Array.isArray(permissions)) return res.status(400).json({ error: 'permissions must be an array' });
  await db.setPermissions(Number(req.params.id), permissions);
  res.json({ ok: true });
});

router.put('/users/:id/role', requireSuperadmin, async (req, res) => {
  const { role } = req.body;
  if (!role || !['admin', 'superadmin'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin or superadmin' });
  }
  const id = Number(req.params.id);
  await db.getPool().query('UPDATE admin_users SET role = $1 WHERE id = $2', [role, id]);
  res.json({ ok: true });
});

// ── Admin password change ───────────────────────────────────────────────────

router.put('/me/password', async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password are required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  const user = await db.getUserByUsername(req.adminUser.username);
  if (!user || !verifyPassword(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  await db.getPool().query(
    'UPDATE admin_users SET password_hash = $1 WHERE id = $2',
    [hashPassword(new_password), user.id]
  );
  res.json({ ok: true });
});

// ── Site user management (admin view) ───────────────────────────────────────

router.get('/site-users', requirePermission('users'), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const search = req.query.search || '';
  res.json(await db.getSiteUsers(limit, offset, search));
});

router.delete('/site-users/:id', requirePermission('users'), async (req, res) => {
  await db.deleteSiteUser(Number(req.params.id));
  res.json({ ok: true });
});

router.post('/site-users/:id/verify', requirePermission('users'), async (req, res) => {
  await db.manualVerifyEmail(Number(req.params.id));
  res.json({ ok: true });
});

router.patch('/site-users/:id/nickname', requirePermission('users'), async (req, res) => {
  const { nickname } = req.body;
  if (!nickname || !nickname.trim()) return res.status(400).json({ error: 'nickname is required' });
  const trimmed = nickname.trim();
  const existing = await db.getSiteUserByNickname(trimmed);
  if (existing && existing.id !== Number(req.params.id)) {
    return res.status(409).json({ error: 'nickname already taken' });
  }
  const row = await db.adminSetNickname(Number(req.params.id), trimmed);
  if (!row) return res.status(404).json({ error: 'user not found' });
  res.json(row);
});

router.post('/site-users/:id/verify-nick', requirePermission('users'), async (req, res) => {
  await db.manualVerifyNickname(Number(req.params.id));
  res.json({ ok: true });
});

// ── Site user role assignment ──────────────────────────────────────────────

router.put('/site-users/:id/role', requireSuperadmin, async (req, res) => {
  const { role_id } = req.body;
  const id = Number(req.params.id);
  if (role_id === null || role_id === undefined) {
    await db.removeRoleFromSiteUser(id);
  } else {
    const role = await db.getRoleById(Number(role_id));
    if (!role) return res.status(404).json({ error: 'Role not found' });
    await db.assignRoleToSiteUser(id, role.id);
  }
  res.json({ ok: true });
});

// ── Custom roles CRUD ─────────────────────────────────────────────────────

router.get('/roles', requireSuperadmin, async (req, res) => {
  res.json(await db.getRoles());
});

router.post('/roles', requireSuperadmin, strictLimiter, async (req, res) => {
  const { name = '', permissions = [] } = req.body;
  if (!name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!Array.isArray(permissions)) return res.status(400).json({ error: 'permissions must be an array' });
  try {
    const role = await db.createRole(name.trim(), permissions);
    res.status(201).json(role);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Role name already exists' });
    throw err;
  }
});

router.put('/roles/:id', requireSuperadmin, async (req, res) => {
  const { name = '', permissions = [] } = req.body;
  if (!name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!Array.isArray(permissions)) return res.status(400).json({ error: 'permissions must be an array' });
  const id = Number(req.params.id);
  const existing = await db.getRoleById(id);
  if (!existing) return res.status(404).json({ error: 'Role not found' });
  try {
    await db.updateRole(id, name.trim(), permissions);
    res.json({ ok: true });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Role name already exists' });
    throw err;
  }
});

router.delete('/roles/:id', requireSuperadmin, async (req, res) => {
  await db.deleteRole(Number(req.params.id));
  res.json({ ok: true });
});

// ── Idle Kick (via realtime) ────────────────────────────────────────────────

router.get('/idle-kick/status', requirePermission('idle_kick'), async (req, res) => {
  res.json(await rt.getIdleKickStatus());
});

router.get('/idle-kick/whitelist', requirePermission('idle_kick'), async (req, res) => {
  res.json(await rt.getIdleKickWhitelist());
});

router.post('/idle-kick/whitelist', requirePermission('idle_kick'), async (req, res) => {
  const { nick = '' } = req.body;
  if (!nick.trim()) return res.status(400).json({ error: 'nick is required' });
  res.json(await rt.addToIdleKickWhitelist(nick.trim()));
});

router.delete('/idle-kick/whitelist', requirePermission('idle_kick'), async (req, res) => {
  const { nick = '' } = req.body;
  if (!nick.trim()) return res.status(400).json({ error: 'nick is required' });
  res.json(await rt.removeFromIdleKickWhitelist(nick.trim()));
});

router.post('/idle-kick/unreg-kick', requirePermission('idle_kick'), async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) is required' });
  res.json(await rt.setUnregKickEnabled(enabled));
});

// ── Chat templates (direct DB) ──────────────────────────────────────────────

router.get('/chat/templates', requirePermission('auto_messages'), async (req, res) => {
  res.json(await db.getChatTemplates());
});

router.post('/chat/templates', requirePermission('auto_messages'), async (req, res) => {
  const { trigger, template, enabled = true, delay_ms = 0 } = req.body;
  if (!trigger || !template) return res.status(400).json({ error: 'trigger and template are required' });
  res.status(201).json(await db.createChatTemplate({ trigger, template, enabled, delay_ms }));
});

router.put('/chat/templates/:id', requirePermission('auto_messages'), async (req, res) => {
  const { trigger, template, enabled = true, delay_ms = 0 } = req.body;
  if (!trigger || !template) return res.status(400).json({ error: 'trigger and template are required' });
  const row = await db.updateChatTemplate(Number(req.params.id), { trigger, template, enabled, delay_ms });
  if (!row) return res.status(404).json({ error: 'Template not found' });
  res.json(row);
});

router.delete('/chat/templates/:id', requirePermission('auto_messages'), async (req, res) => {
  await db.deleteChatTemplate(Number(req.params.id));
  res.json({ ok: true });
});

// ── Chat template variables & preview ────────────────────────────────────────

const TEMPLATE_VARIABLES = [
  { key: 'nick', description: 'Player nickname', triggers: ['player_joined', 'player_new', 'player_returned', 'player_unregistered', 'lobby_full'] },
  { key: 'env', description: 'Track environment name', triggers: ['track_change'] },
  { key: 'track', description: 'Track name', triggers: ['track_change'] },
  { key: 'race', description: 'Race mode', triggers: ['track_change'] },
  { key: 'mins', description: 'Minutes until next track (pre-change only)', triggers: ['track_change'] },
  { key: 'race_id', description: 'Race ID (first 8 chars)', triggers: ['race_start'] },
  { key: 'winner', description: 'Race winner display name', triggers: ['race_end', 'race_podium'] },
  { key: 'time', description: "Winner's finish time", triggers: ['race_end', 'race_podium'] },
  { key: 'second', description: '2nd place pilot (race)', triggers: ['race_podium'] },
  { key: 'second_time', description: "2nd place finish time", triggers: ['race_podium'] },
  { key: 'third', description: '3rd place pilot (race)', triggers: ['race_podium'] },
  { key: 'third_time', description: "3rd place finish time", triggers: ['race_podium'] },
  { key: 'pilots', description: 'Total pilots in race', triggers: ['race_podium'] },
  { key: '4th', description: '4th place pilot (race)', triggers: ['race_podium'] },
  { key: '4th_time', description: '4th place finish time', triggers: ['race_podium'] },
  { key: '5th', description: '5th place pilot (race)', triggers: ['race_podium'] },
  { key: '5th_time', description: '5th place finish time', triggers: ['race_podium'] },
  { key: '6th', description: '6th place pilot (race)', triggers: ['race_podium'] },
  { key: '6th_time', description: '6th place finish time', triggers: ['race_podium'] },
  { key: '7th', description: '7th place pilot (race)', triggers: ['race_podium'] },
  { key: '7th_time', description: '7th place finish time', triggers: ['race_podium'] },
  { key: '8th', description: '8th place pilot (race)', triggers: ['race_podium'] },
  { key: '8th_time', description: '8th place finish time', triggers: ['race_podium'] },
  { key: '1st', description: '1st place pilot (weekly standings)', triggers: ['*'] },
  { key: '2nd', description: '2nd place pilot (weekly standings)', triggers: ['*'] },
  { key: '3rd', description: '3rd place pilot (weekly standings)', triggers: ['*'] },
  { key: 'playlist', description: 'Current playlist name', triggers: ['*'] },
  { key: 'players', description: 'Number of players online', triggers: ['*'] },
  { key: 'player_points', description: "Player's weekly competition points", triggers: ['player_joined', 'player_new', 'player_returned', 'player_unregistered'] },
  { key: 'player_position', description: "Player's weekly competition rank (or 'unranked')", triggers: ['player_joined', 'player_new', 'player_returned', 'player_unregistered'] },
  { key: 'count', description: 'Current player count', triggers: ['lobby_full'] },
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

router.get('/playlists', requirePermission('playlists'), async (req, res) => {
  res.json(await db.getPlaylists());
});

router.post('/playlists', requirePermission('playlists'), async (req, res) => {
  const { name = '' } = req.body;
  if (!name.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    res.status(201).json(await db.createPlaylist(name.trim()));
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

router.put('/playlists/:id', requirePermission('playlists'), async (req, res) => {
  const { name = '' } = req.body;
  if (!name.trim()) return res.status(400).json({ error: 'name is required' });
  const row = await db.renamePlaylist(Number(req.params.id), name.trim());
  if (!row) return res.status(404).json({ error: 'Playlist not found' });
  res.json(row);
});

router.delete('/playlists/:id', requirePermission('playlists'), async (req, res) => {
  const id = Number(req.params.id);
  const osState = await rt.getOverseerState();
  if (osState.playlist_id === id && osState.running) {
    await rt.stopOverseer();
  }
  await db.deletePlaylist(id);
  res.json({ ok: true });
});

router.get('/playlists/:id/tracks', requirePermission('playlists'), async (req, res) => {
  res.json(await db.getPlaylistTracks(Number(req.params.id)));
});

router.post('/playlists/:id/tracks', requirePermission('playlists'), async (req, res) => {
  const { env = '', track = '', race = '', workshop_id = '' } = req.body;
  if (!env && !track && !workshop_id) return res.status(400).json({ error: 'Provide env+track or workshop_id' });
  res.status(201).json(await db.addPlaylistTrack(Number(req.params.id), { env, track, race, workshop_id }));
});

router.delete('/playlists/tracks/:tid', requirePermission('playlists'), async (req, res) => {
  await db.removePlaylistTrack(Number(req.params.tid));
  res.json({ ok: true });
});

router.post('/playlists/tracks/:tid/move', requirePermission('playlists'), async (req, res) => {
  const { direction } = req.body;
  if (!['up', 'down'].includes(direction)) return res.status(400).json({ error: 'direction must be up or down' });
  await db.movePlaylistTrack(Number(req.params.tid), direction);
  res.json({ ok: true });
});

router.post('/playlists/:id/start', requirePermission('playlists'), strictLimiter, async (req, res) => {
  const intervalMs = Math.max(5000, Number(req.body.interval_ms) || 15 * 60 * 1000);
  const startIndex = Math.max(0, parseInt(req.body.start_index) || 0);
  try {
    res.json(await rt.startOverseerPlaylist(Number(req.params.id), intervalMs, startIndex));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/playlist/stop', requirePermission('playlists'), async (req, res) => {
  res.json(await rt.stopOverseer());
});

router.post('/playlist/skip', requirePermission('playlists'), async (req, res) => {
  res.json(await rt.skipOverseer());
});

router.get('/playlist/state', requirePermission('playlists'), async (req, res) => {
  res.json(await rt.getOverseerState());
});

// ── Track Overseer (via realtime) ────────────────────────────────────────────

router.get('/overseer/state', requirePermission('overseer'), async (req, res) => {
  res.json(await rt.getOverseerState());
});

router.post('/overseer/start-playlist', requirePermission('overseer'), strictLimiter, async (req, res) => {
  const { playlist_id, interval_ms, start_index = 0 } = req.body;
  if (!playlist_id) return res.status(400).json({ error: 'playlist_id is required' });
  const intervalMs = Math.max(5000, Number(interval_ms) || 15 * 60 * 1000);
  try {
    res.json(await rt.startOverseerPlaylist(Number(playlist_id), intervalMs, Math.max(0, Number(start_index) || 0)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/overseer/start-tags', requirePermission('overseer'), strictLimiter, async (req, res) => {
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

router.post('/overseer/stop', requirePermission('overseer'), async (req, res) => {
  res.json(await rt.stopOverseer());
});

router.post('/overseer/skip', requirePermission('overseer'), async (req, res) => {
  res.json(await rt.skipOverseer());
});

router.post('/overseer/extend', requirePermission('overseer'), async (req, res) => {
  const ms = Math.max(10000, Number(req.body.ms) || 300000);
  res.json(await rt.extendOverseer(ms));
});

router.post('/overseer/skip-to-index', requirePermission('overseer'), async (req, res) => {
  const { index } = req.body;
  if (index === undefined) return res.status(400).json({ error: 'index is required' });
  res.json(await rt.skipToIndex(Number(index)));
});

router.post('/overseer/skip-vote-enabled', requirePermission('overseer'), async (req, res) => {
  const { enabled } = req.body;
  res.json(await rt.setSkipVoteEnabled(!!enabled));
});

router.post('/overseer/extend-vote-enabled', requirePermission('overseer'), async (req, res) => {
  const { enabled } = req.body;
  res.json(await rt.setExtendVoteEnabled(!!enabled));
});

// ── Playlist Queue ──────────────────────────────────────────────────────────

router.get('/overseer/playlist-queue', requirePermission('overseer'), async (req, res) => {
  res.json(await rt.getPlaylistQueue());
});

router.post('/overseer/playlist-queue', requirePermission('overseer'), async (req, res) => {
  const { playlist_id, interval_ms, shuffle = false, start_after = 'track' } = req.body;
  if (!playlist_id) return res.status(400).json({ error: 'playlist_id is required' });
  if (!['track', 'wrap'].includes(start_after)) return res.status(400).json({ error: 'start_after must be track or wrap' });
  const intervalMs = Math.max(5000, Number(interval_ms) || 15 * 60 * 1000);
  try {
    res.status(201).json(await rt.addToPlaylistQueue(Number(playlist_id), intervalMs, !!shuffle, start_after));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/overseer/playlist-queue/:id', requirePermission('overseer'), async (req, res) => {
  res.json(await rt.removeFromPlaylistQueue(Number(req.params.id)));
});

router.post('/overseer/playlist-queue/:id/move', requirePermission('overseer'), async (req, res) => {
  const { direction } = req.body;
  if (!['up', 'down'].includes(direction)) return res.status(400).json({ error: 'direction must be up or down' });
  res.json(await rt.reorderPlaylistQueue(Number(req.params.id), direction));
});

router.delete('/overseer/playlist-queue', requirePermission('overseer'), async (req, res) => {
  res.json(await rt.clearPlaylistQueue());
});

// ── Queue (via realtime) ──────────────────────────────────────────────────────

router.get('/queue', async (req, res) => {
  res.json(await rt.getQueue());
});

router.post('/queue', requirePermission('overseer'), async (req, res) => {
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

router.delete('/queue/:id', requirePermission('overseer'), async (req, res) => {
  res.json(await rt.removeFromQueue(Number(req.params.id)));
});

router.post('/queue/:id/move', requirePermission('overseer'), async (req, res) => {
  const { direction } = req.body;
  if (!['up', 'down'].includes(direction)) return res.status(400).json({ error: 'direction must be up or down' });
  res.json(await rt.reorderQueue(Number(req.params.id), direction));
});

router.delete('/queue', requirePermission('overseer'), async (req, res) => {
  res.json(await rt.clearQueue());
});

// ── Tracks upcoming & history (via realtime) ─────────────────────────────────

router.get('/tracks/upcoming', requirePermission('tracks'), async (req, res) => {
  const count = parseInt(req.query.count || '10', 10);
  res.json(await rt.getUpcomingTracks(count));
});

router.get('/tracks/history', requirePermission('tracks'), async (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  const offset = parseInt(req.query.offset || '0', 10);
  res.json(await rt.getTrackHistory(limit, offset));
});

// ── Scoring (recalculate) ───────────────────────────────────────────────────

router.post('/scoring/recalculate/:weekId', requirePermission('scoring'), strictLimiter, async (req, res) => {
  try {
    res.json(await recalculateWeek(Number(req.params.weekId)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/scoring/current-week', requirePermission('scoring'), async (req, res) => {
  const week = await getOrCreateCurrentWeek();
  if (!week) return res.status(404).json({ error: 'No active scoring period' });
  const standings = await db.getWeeklyStandings(week.id);
  res.json({ week, standings });
});

// ── Competitions (direct DB) ────────────────────────────────────────────────

router.post('/competition', requirePermission('competitions'), async (req, res) => {
  const { name = '' } = req.body;
  if (!name.trim()) return res.status(400).json({ error: 'name is required' });
  res.status(201).json(await db.createCompetition(name.trim()));
});

router.get('/competitions', requirePermission('competitions'), async (req, res) => {
  res.json(await db.getCompetitions());
});

router.post('/competition/:id/archive', requirePermission('competitions'), async (req, res) => {
  await db.archiveCompetition(Number(req.params.id));
  res.json({ ok: true });
});

router.post('/competition/:id/activate', requirePermission('competitions'), async (req, res) => {
  await db.activateCompetition(Number(req.params.id));
  res.json({ ok: true });
});

router.delete('/competition/:id', requirePermission('competitions'), async (req, res) => {
  const id = Number(req.params.id);
  if (id === 0) return res.status(400).json({ error: 'Cannot delete Auto Season' });
  await db.deleteCompetition(id);
  res.json({ ok: true });
});

router.post('/competition/:id/weeks', requirePermission('competitions'), async (req, res) => {
  const { count = 4, start_date } = req.body;
  if (!start_date) return res.status(400).json({ error: 'start_date is required (ISO format)' });
  const weeks = await db.generateWeeks(Number(req.params.id), Number(count), start_date);
  res.status(201).json(weeks);
});

router.get('/competition/:id/weeks', requirePermission('competitions'), async (req, res) => {
  res.json(await db.getWeeks(Number(req.params.id)));
});

router.put('/competition/week/:id', requirePermission('competitions'), async (req, res) => {
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

router.delete('/competition/week/:id', requirePermission('competitions'), async (req, res) => {
  await db.deleteWeek(Number(req.params.id));
  res.json({ ok: true });
});

router.post('/competition/recalculate/:weekId', requirePermission('competitions'), strictLimiter, async (req, res) => {
  try {
    const result = await recalculateWeek(Number(req.params.weekId));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/competition/week/:id/standings', requirePermission('competitions'), async (req, res) => {
  const standings = await db.getWeeklyStandings(Number(req.params.id));
  res.json(standings);
});

router.get('/competition/:id/season-standings', requirePermission('competitions'), async (req, res) => {
  const standings = await db.getSeasonStandings(Number(req.params.id));
  res.json(standings);
});

// ── Tags (direct DB) ────────────────────────────────────────────────────────

router.get('/tags', requirePermission('tags'), async (req, res) => {
  res.json(await db.getTags());
});

router.post('/tags', requirePermission('tags'), async (req, res) => {
  const { name = '' } = req.body;
  if (!name.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    res.status(201).json(await db.createTag(name.trim()));
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Tag already exists' });
    throw err;
  }
});

router.put('/tags/:id', requirePermission('tags'), async (req, res) => {
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

router.delete('/tags/:id', requirePermission('tags'), async (req, res) => {
  await db.deleteTag(Number(req.params.id));
  res.json({ ok: true });
});

// ── Tracks (direct DB — catalog-discovered only) ─────────────────────────────

router.get('/tracks', requirePermission('tracks'), async (req, res) => {
  res.json(await db.getTracks());
});

router.get('/tracks/:id/tags', requirePermission('tags'), async (req, res) => {
  res.json(await db.getTagsForTrack(Number(req.params.id)));
});

router.put('/tracks/:id/tags', requirePermission('tags'), async (req, res) => {
  const { tag_ids } = req.body;
  if (!Array.isArray(tag_ids)) return res.status(400).json({ error: 'tag_ids must be an array' });
  await db.setTrackTags(Number(req.params.id), tag_ids.map(Number));
  res.json(await db.getTagsForTrack(Number(req.params.id)));
});

router.post('/tracks/:id/tags', requirePermission('tags'), async (req, res) => {
  const { tag_id } = req.body;
  if (!tag_id) return res.status(400).json({ error: 'tag_id is required' });
  await db.addTagToTrack(Number(req.params.id), Number(tag_id));
  res.json({ ok: true });
});

router.delete('/tracks/:id/tags/:tagId', requirePermission('tags'), async (req, res) => {
  await db.removeTagFromTrack(Number(req.params.id), Number(req.params.tagId));
  res.json({ ok: true });
});

router.put('/tracks/:id/steam-id', requirePermission('tracks'), async (req, res) => {
  const { steam_id } = req.body;
  if (steam_id === undefined) return res.status(400).json({ error: 'steam_id is required' });
  const row = await db.updateTrackSteamId(Number(req.params.id), steam_id);
  if (!row) return res.status(404).json({ error: 'Track not found' });
  res.json(row);
});

router.post('/tracks/:id/steam-fetch', requirePermission('tracks'), strictLimiter, async (req, res) => {
  const track = await db.getTrackById(Number(req.params.id));
  if (!track) return res.status(404).json({ error: 'Track not found' });
  if (!track.steam_id) return res.status(400).json({ error: 'Track has no steam_id set' });

  const item = await fetchWorkshopItem(track.steam_id);
  if (!item) return res.status(404).json({ error: 'Workshop item not found on Steam' });

  item.authorName = await resolveAuthorName(item.authorId);

  const row = await db.updateTrackSteamData(track.id, item);
  res.json(row);
});

router.post('/tracks/steam-fetch-all', requirePermission('tracks'), strictLimiter, async (req, res) => {
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

router.put('/tracks/:id/duration', requirePermission('tracks'), async (req, res) => {
  const { duration_ms } = req.body;
  const value = duration_ms === null || duration_ms === undefined ? null : Number(duration_ms);
  if (value !== null && (isNaN(value) || value < 0)) return res.status(400).json({ error: 'duration_ms must be a positive number or null' });
  const row = await db.updateTrackDuration(Number(req.params.id), value);
  if (!row) return res.status(404).json({ error: 'Track not found' });
  res.json(row);
});

router.get('/tracks/by-tag/:tagId', requirePermission('tags'), async (req, res) => {
  res.json(await db.getTracksForTag(Number(req.params.tagId)));
});

// ── Tag runner (backward compat — routes through overseer) ──────────────────

router.post('/tag-runner/start', requirePermission('tags'), strictLimiter, async (req, res) => {
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

router.post('/tag-runner/stop', requirePermission('tags'), async (req, res) => {
  res.json(await rt.stopOverseer());
});

router.post('/tag-runner/skip', requirePermission('tags'), async (req, res) => {
  res.json(await rt.skipOverseer());
});

router.get('/tag-runner/state', requirePermission('tags'), async (req, res) => {
  res.json(await rt.getOverseerState());
});

// ── Tag vote (via realtime) ──────────────────────────────────────────────────

router.post('/tag-vote/start', requirePermission('tags'), strictLimiter, async (req, res) => {
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

router.post('/tag-vote/cancel', requirePermission('tags'), async (req, res) => {
  res.json(await rt.cancelTagVote());
});

router.get('/tag-vote/state', requirePermission('tags'), async (req, res) => {
  res.json(await rt.getTagVoteState());
});

// ── Track comment moderation ────────────────────────────────────────────────

router.delete('/track-comments/:commentId', requirePermission('track_manager'), async (req, res) => {
  await db.deleteTrackComment(Number(req.params.commentId));
  res.json({ ok: true });
});

// ── Track Manager ─────────────────────────────────────────────────────────────

router.get('/track-manager', requirePermission('track_manager'), async (req, res) => {
  const search = req.query.search || '';
  const env = req.query.env || '';
  const sort = req.query.sort || 'name';
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  res.json(await db.getAdminTrackList({ search, env, sort, limit, offset }));
});

router.get('/track-manager/envs', requirePermission('track_manager'), async (req, res) => {
  const { rows } = await db.getPool().query('SELECT DISTINCT env FROM tracks ORDER BY env');
  res.json(rows.map(r => r.env));
});

router.get('/track-manager/:id/playlists', requirePermission('track_manager'), async (req, res) => {
  res.json(await db.getTrackPlaylistMemberships(Number(req.params.id)));
});

router.get('/track-manager/:id/comments', requirePermission('track_manager'), async (req, res) => {
  res.json(await db.getAdminTrackComments(Number(req.params.id)));
});

router.get('/track-manager/:id/user-tags', requirePermission('track_manager'), async (req, res) => {
  res.json(await db.getTrackUserTags(Number(req.params.id)));
});

router.delete('/track-manager/:id/user-tags/:label', requirePermission('track_manager'), async (req, res) => {
  await db.deleteUserTagLabel(Number(req.params.id), req.params.label);
  res.json({ ok: true });
});

// ── Bot management ─────────────────────────────────────────────────────────

router.get('/bots', requirePermission('tracks'), async (req, res) => {
  res.json(await rt.getBots());
});

router.post('/bots', requirePermission('tracks'), strictLimiter, async (req, res) => {
  const { id, api_key, label, bot_nick } = req.body;
  if (!id || !api_key) return res.status(400).json({ error: 'id and api_key are required' });
  try {
    const result = await rt.addBot(id, api_key, label, bot_nick);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/bots/:id', requirePermission('tracks'), strictLimiter, async (req, res) => {
  const result = await rt.removeBot(req.params.id);
  res.json(result);
});

// ── Room management ─────────────────────────────────────────────────────────

router.get('/rooms', requirePermission('tracks'), async (req, res) => {
  res.json(await rt.getRooms());
});

router.post('/rooms', requirePermission('tracks'), strictLimiter, async (req, res) => {
  const { id, label, scoring_mode } = req.body;
  if (!id) return res.status(400).json({ error: 'id is required' });
  try {
    res.json(await rt.addRoom(id, label, scoring_mode));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/rooms/:id', requirePermission('tracks'), strictLimiter, async (req, res) => {
  try {
    res.json(await rt.updateRoom(req.params.id, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/rooms/:id', requirePermission('tracks'), strictLimiter, async (req, res) => {
  try {
    res.json(await rt.removeRoom(req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/rooms/:id/assign-bot', requirePermission('tracks'), strictLimiter, async (req, res) => {
  const { bot_id } = req.body;
  if (!bot_id) return res.status(400).json({ error: 'bot_id is required' });
  try {
    res.json(await rt.assignBotToRoom(req.params.id, bot_id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Room-scoped overseer ──────────────────────────────────────────────────

router.get('/rooms/:id/overseer/state', requirePermission('overseer'), async (req, res) => {
  res.json(await rt.getRoomOverseerState(req.params.id));
});

router.post('/rooms/:id/overseer/start-playlist', requirePermission('overseer'), async (req, res) => {
  const { playlist_id, interval_ms, start_index = 0 } = req.body;
  res.json(await rt.startRoomOverseerPlaylist(req.params.id, playlist_id, interval_ms, start_index));
});

router.post('/rooms/:id/overseer/start-tags', requirePermission('overseer'), async (req, res) => {
  const { tag_names, interval_ms } = req.body;
  res.json(await rt.startRoomOverseerTags(req.params.id, tag_names, interval_ms));
});

router.post('/rooms/:id/overseer/stop', requirePermission('overseer'), async (req, res) => {
  res.json(await rt.stopRoomOverseer(req.params.id));
});

router.post('/rooms/:id/overseer/skip', requirePermission('overseer'), async (req, res) => {
  res.json(await rt.skipRoomOverseer(req.params.id));
});

router.post('/rooms/:id/overseer/extend', requirePermission('overseer'), async (req, res) => {
  const { ms } = req.body;
  res.json(await rt.extendRoomOverseer(req.params.id, ms || 300000));
});

// ── Room-scoped tag vote ──────────────────────────────────────────────────

router.post('/rooms/:id/tag-vote/start', requirePermission('overseer'), async (req, res) => {
  const { tag_options, duration_ms } = req.body;
  res.json(await rt.startRoomTagVote(req.params.id, tag_options, duration_ms));
});

router.post('/rooms/:id/tag-vote/cancel', requirePermission('overseer'), async (req, res) => {
  res.json(await rt.cancelRoomTagVote(req.params.id));
});

// ── Per-user data export (CSV) ────────────────────────────────────────────

router.get('/site-users/:id/export/:type', requirePermission('users'), async (req, res) => {
  const { type } = req.params;
  if (type !== 'laps' && type !== 'races') {
    return res.status(400).json({ error: 'Type must be "laps" or "races"' });
  }
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: '"from" and "to" query params required (YYYY-MM-DD)' });
  }
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date format — use YYYY-MM-DD' });
  }
  const user = await db.getSiteUserById(Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.nickname) return res.status(400).json({ error: 'User has no nickname — no data to export' });

  const safeName = user.nickname.replace(/[^a-zA-Z0-9_-]/g, '_');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}-${type}-${from}-to-${to}.csv"`);

  if (type === 'laps') {
    await db.streamLapsCsvFiltered(user.nickname, fromDate.toISOString(), toDate.toISOString(), res);
  } else {
    await db.streamRacesCsvFiltered(user.nickname, fromDate.toISOString(), toDate.toISOString(), res);
  }
});

module.exports = router;
