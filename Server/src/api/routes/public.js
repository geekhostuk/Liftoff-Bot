/**
 * Public routes for the API server.
 *
 * All database reads go direct. Runtime state (plugin status, online players,
 * current track) comes from the realtime server via internal API.
 */

const { Router } = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../../database');
const rt = require('../realtimeClient');
const { hashPassword, verifyPassword, createSession, getSession, destroySession, extractSiteToken } = require('../../auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../../email');

// ── Helpers ─────────────────────────────────────────────────────────────────

function hashIp(ip) {
  const salt = process.env.IP_HASH_SALT || 'liftoff';
  return crypto.createHash('sha256').update(ip + salt).digest('hex');
}

const commentLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many comments — try again in 10 minutes' },
});

const tagLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many tag votes — try again in 10 minutes' },
});

const router = Router();

router.get('/races', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  res.json(await db.getRaces({ limit, offset }));
});

router.get('/races/:id', async (req, res) => {
  const race = await db.getRaceById(req.params.id);
  if (!race) return res.status(404).json({ error: 'Race not found' });
  res.json(race);
});

router.get('/leaderboard', async (req, res) => {
  res.json(await db.getBestLaps());
});

router.get('/leaderboard/track', async (req, res) => {
  const { env, track } = req.query;
  if (!env || !track) return res.status(400).json({ error: 'env and track query params required' });
  res.json(await db.getBestLapsByTrack(env, track));
});

router.get('/players', async (req, res) => {
  res.json(await db.getPlayerStats());
});

router.get('/status', async (req, res) => {
  const [pluginStatus, rtState, race] = await Promise.all([
    rt.getPluginStatus(),
    rt.getState(),
    db.getLatestRaceWithLaps(),
  ]);
  res.json({
    plugin_connected: pluginStatus.plugin_connected,
    current_track: rtState.current_track,
    track_since: rtState.track_since,
    latest_race: race,
    online_players: rtState.online_players,
    playlist: rtState.playlist || null,
  });
});

router.get('/pilot-activity', async (req, res) => {
  res.json(await db.getPilotActivity());
});

router.get('/catalog', async (req, res) => {
  const catalog = await db.getLatestCatalog();
  if (!catalog) return res.status(404).json({ error: 'No catalog received yet' });
  res.json(catalog);
});

router.get('/players/online-stats', async (req, res) => {
  const raw = req.query.nicks || '';
  const nicks = raw.split(',').map(n => n.trim()).filter(Boolean);
  res.json(await db.getAllTimeStatsByNick(nicks));
});

router.get('/laps/browse', async (req, res) => {
  const { env, track, nick, dateFrom, dateTo } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  res.json(await db.browseLaps({ env, track, nick, dateFrom, dateTo, limit, offset }));
});

router.get('/filters', async (req, res) => {
  res.json(await db.getFilterOptions());
});

router.get('/stats/overview', async (req, res) => {
  res.json(await db.getOverallStats());
});

// ── Competition (public) ────────────────────────────────────────────────────

router.get('/competition/current', async (req, res) => {
  // Try existing active competition first, then auto season
  const comp = await db.getActiveCompetition();
  if (comp) {
    const weeks = await db.getWeeks(comp.id);
    const currentWeek = weeks.find(w => w.status === 'active') || null;
    const nextWeek = weeks.find(w => w.status === 'scheduled') || null;
    return res.json({ competition: comp, current_week: currentWeek, next_week: nextWeek });
  }
  const week = await db.getOrCreateCurrentWeek();
  if (!week) return res.json({ competition: null, current_week: null });
  res.json({ competition: { id: 0, name: week.competition_name || 'Auto Season', status: 'active' }, current_week: week, next_week: null });
});

router.get('/competition/standings', async (req, res) => {
  // Try existing active competition week first
  const activeWeek = await db.getActiveWeek();
  if (activeWeek) return res.json(await db.getWeeklyStandings(activeWeek.id));
  // Fall back to auto season
  const week = await db.getOrCreateCurrentWeek();
  if (!week) return res.json([]);
  res.json(await db.getWeeklyStandings(week.id));
});

router.get('/competition/standings/:weekId', async (req, res) => {
  res.json(await db.getWeeklyStandings(Number(req.params.weekId)));
});

router.get('/competition/season', async (req, res) => {
  // Use existing active competition, fall back to auto season
  const comp = await db.getActiveCompetition();
  const compId = comp ? comp.id : 0;
  res.json(await db.getSeasonStandings(compId));
});

router.get('/competition/weeks', async (req, res) => {
  const comp = await db.getActiveCompetition();
  const compId = comp ? comp.id : 0;
  res.json(await db.getWeeks(compId));
});

router.get('/competition/pilot/:pilotKey', async (req, res) => {
  const comp = await db.getActiveCompetition();
  const compId = comp ? comp.id : 0;
  res.json(await db.getPilotCompetitionHistory(compId, decodeURIComponent(req.params.pilotKey)));
});

router.get('/competition/race/:raceId/results', async (req, res) => {
  res.json(await db.getRaceResultsWithPoints(req.params.raceId));
});

// ── Tracks page ────────────────────────────────────────────────────────────

router.get('/tracks', async (req, res) => {
  const [rtInfo, recentTracks] = await Promise.all([
    rt.getTracksInfo(),
    db.getRecentTracks(10),
  ]);

  const { overseer } = rtInfo;

  // Build active playlists array
  const activePlaylists = [];

  if (overseer.running && overseer.mode === 'playlist' && overseer.playlist_id) {
    activePlaylists.push({
      playlist_id: overseer.playlist_id,
      playlist_name: overseer.playlist_name,
      interval_ms: overseer.interval_ms,
      is_current: true,
      current_index: overseer.current_index,
      next_change_at: overseer.next_change_at,
      tracks: overseer.tracks,
    });
  }

  // Derive upcoming tracks from the currently running playlist
  const upcoming = [];
  if (overseer.running && overseer.mode === 'playlist' && overseer.tracks.length > 0) {
    const count = Math.min(5, overseer.tracks.length - 1);
    for (let i = 1; i <= count; i++) {
      const idx = (overseer.current_index + i) % overseer.tracks.length;
      upcoming.push(overseer.tracks[idx]);
    }
  }

  res.json({
    active_playlists: activePlaylists,
    recent_tracks: recentTracks,
    upcoming,
    current_track: overseer.current_track,
    next_change_at: overseer.next_change_at,
    mode: overseer.mode,
    tag_names: overseer.tag_names,
  });
});

// ── Public image proxy (Steam CDN images) ───────────────────────────────────

const ALLOWED_IMAGE_PREFIXES = [
  'https://images.steamusercontent.com/',
  'https://steamuserimages-a.akamaihd.net/',
  'https://clan.akamai.steamstatic.com/',
  'https://clan.cloudflare.steamstatic.com/',
  'https://steamcdn-a.akamaihd.net/',
];

router.get('/image-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url || !ALLOWED_IMAGE_PREFIXES.some(p => url.startsWith(p))) {
    return res.status(400).json({ error: 'Invalid image URL' });
  }
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(502).json({ error: 'Failed to fetch image' });
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    const buffer = await upstream.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch {
    res.status(502).json({ error: 'Failed to fetch image' });
  }
});

// ── Track browser ────────────────────────────────────────────────────────────

router.get('/browse', async (req, res) => {
  const search = req.query.search || '';
  const sort = req.query.sort || 'name';
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;
  res.json(await db.getBrowseTracks({ search, sort, limit, offset }));
});

router.get('/browse/:env/:track', async (req, res) => {
  const env = decodeURIComponent(req.params.env);
  const track = decodeURIComponent(req.params.track);
  const row = await db.getTrackDetailByEnvTrack(env, track);
  if (!row) return res.status(404).json({ error: 'Track not found' });
  res.json(row);
});

router.get('/browse/:env/:track/leaderboard', async (req, res) => {
  const env = decodeURIComponent(req.params.env);
  const track = decodeURIComponent(req.params.track);
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  res.json(await db.getBestLapsByTrack(env, track, { limit }));
});

router.get('/browse/:env/:track/comments', async (req, res) => {
  const env = decodeURIComponent(req.params.env);
  const track = decodeURIComponent(req.params.track);
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;
  const row = await db.getTrackDetailByEnvTrack(env, track);
  if (!row) return res.status(404).json({ error: 'Track not found' });
  res.json(await db.getTrackComments(row.id, { limit, offset }));
});

router.post('/browse/:env/:track/comments', commentLimiter, async (req, res) => {
  const env = decodeURIComponent(req.params.env);
  const track = decodeURIComponent(req.params.track);
  const { author_name, body } = req.body;

  if (!author_name || typeof author_name !== 'string' || author_name.trim().length < 1 || author_name.trim().length > 50) {
    return res.status(400).json({ error: 'author_name must be 1–50 characters' });
  }
  if (!body || typeof body !== 'string' || body.trim().length < 1 || body.trim().length > 500) {
    return res.status(400).json({ error: 'body must be 1–500 characters' });
  }

  const row = await db.getTrackDetailByEnvTrack(env, track);
  if (!row) return res.status(404).json({ error: 'Track not found' });

  const ipHash = hashIp(req.ip || '');
  const isKnownPilot = await db.isKnownPilotName(author_name.trim());
  const comment = await db.addTrackComment(row.id, {
    authorName: author_name.trim(),
    isKnownPilot,
    body: body.trim(),
    ipHash,
  });
  res.status(201).json(comment);
});

router.get('/browse/:env/:track/user-tags', async (req, res) => {
  const env = decodeURIComponent(req.params.env);
  const track = decodeURIComponent(req.params.track);
  const row = await db.getTrackDetailByEnvTrack(env, track);
  if (!row) return res.status(404).json({ error: 'Track not found' });
  res.json(await db.getTrackUserTags(row.id));
});

router.post('/browse/:env/:track/user-tags', tagLimiter, async (req, res) => {
  const env = decodeURIComponent(req.params.env);
  const track = decodeURIComponent(req.params.track);
  const { label } = req.body;

  if (!label || typeof label !== 'string' || label.trim().length < 1 || label.trim().length > 30) {
    return res.status(400).json({ error: 'label must be 1–30 characters' });
  }

  const row = await db.getTrackDetailByEnvTrack(env, track);
  if (!row) return res.status(404).json({ error: 'Track not found' });

  const ipHash = hashIp(req.ip || '');
  res.json(await db.addOrVoteUserTag(row.id, label.trim(), ipHash));
});

// ── Site User Authentication ────────────────────────────────────────────────

const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registrations — try again in an hour' },
});

/** Middleware: require authenticated site user */
function requireSiteAuth(req, res, next) {
  const token = extractSiteToken(req);
  const session = getSession(token);
  if (!session || session.type !== 'site') {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  req.siteUser = session;
  next();
}

router.post('/register', registerLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = await db.getSiteUserByEmail(email.trim());
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const passwordHash = hashPassword(password);
  const verifyToken = crypto.randomBytes(32).toString('hex');
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60_000); // 24 hours

  const user = await db.createSiteUser(email.trim(), passwordHash, verifyToken, verifyExpires);

  try {
    await sendVerificationEmail(email.trim(), verifyToken);
  } catch (err) {
    console.error('[auth] Failed to send verification email:', err.message);
  }

  res.status(201).json({ ok: true, message: 'Account created. Check your email to verify.' });
});

router.get('/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  const result = await db.verifyEmail(token);
  if (!result) return res.status(400).json({ error: 'Invalid or expired verification link' });

  res.json({ ok: true, message: 'Email verified successfully' });
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = await db.getSiteUserByEmail(email.trim());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (!user.email_verified) {
    return res.status(403).json({ error: 'Please verify your email before logging in' });
  }

  const token = createSession(user, 'site');
  res.cookie('liftoff_user', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60_000,
    path: '/',
  });
  res.json({
    ok: true,
    user: { id: user.id, email: user.email, nickname: user.nickname, nick_verified: user.nick_verified },
  });
});

router.post('/auth/logout', (req, res) => {
  const token = extractSiteToken(req);
  if (token) destroySession(token);
  res.clearCookie('liftoff_user', { path: '/' });
  res.json({ ok: true });
});

router.get('/auth/me', requireSiteAuth, async (req, res) => {
  const user = await db.getSiteUserByEmail(req.siteUser.username);
  if (!user) return res.status(401).json({ error: 'User not found' });
  let role = null;
  if (user.role_id) {
    const roleData = await db.getRoleById(user.role_id);
    if (roleData) role = { id: roleData.id, name: roleData.name };
  }
  res.json({
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    nick_verified: user.nick_verified,
    email_verified: user.email_verified,
    role,
  });
});

router.post('/auth/verify-code', requireSiteAuth, async (req, res) => {
  const user = await db.getSiteUserByEmail(req.siteUser.username);
  if (!user || !user.email_verified) {
    return res.status(403).json({ error: 'You must verify your email first' });
  }

  const code = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6-char hex
  const expires = new Date(Date.now() + 60 * 60_000); // 1 hour
  await db.setNickVerifyCode(req.siteUser.userId, code, expires);

  res.json({
    ok: true,
    verify_code: code,
    message: `Type /verify ${code} in the Liftoff in-game chat to link your account`,
  });
});

router.put('/auth/password', requireSiteAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password are required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  const user = await db.getSiteUserByEmail(req.siteUser.username);
  if (!user || !verifyPassword(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  await db.updateSiteUserPassword(user.id, hashPassword(new_password));
  res.json({ ok: true });
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reset requests — try again in an hour' },
});

router.post('/auth/forgot-password', resetLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  // Always return success to prevent email enumeration
  const user = await db.getSiteUserByEmail(email.trim());
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60_000); // 1 hour
    await db.setResetToken(user.id, token, expires);
    try {
      await sendPasswordResetEmail(email.trim(), token);
    } catch (err) {
      console.error('[auth] Failed to send reset email:', err.message);
    }
  }

  res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
});

router.post('/auth/reset-password', async (req, res) => {
  const { token, new_password } = req.body;
  if (!token || !new_password) {
    return res.status(400).json({ error: 'token and new_password are required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const result = await db.resetPassword(token, hashPassword(new_password));
  if (!result) return res.status(400).json({ error: 'Invalid or expired reset link' });

  res.json({ ok: true, message: 'Password has been reset. You can now log in.' });
});

// ── Profile Dashboard (authenticated) ──────────────────────────────────────

const profileStatsLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — slow down' },
});

const csvDownloadLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many downloads — try again in an hour' },
});

router.get('/auth/my-stats', requireSiteAuth, profileStatsLimiter, async (req, res) => {
  const user = await db.getSiteUserByEmail(req.siteUser.username);
  if (!user?.nickname || !user.nick_verified) {
    return res.status(400).json({ error: 'Verified nickname required' });
  }
  const nick = user.nickname;
  const comp = await db.getActiveCompetition();
  const compId = comp ? comp.id : 0;

  const [summary, personalRecords, globalRecords, weeklyTrend, recentRaces, competition, rating] = await Promise.all([
    db.getPilotSummary(nick),
    db.getPilotPersonalRecords(nick),
    db.getGlobalTrackRecords(),
    db.getPilotWeeklyTrend(nick),
    db.getPilotRecentRaces(nick),
    db.getPilotCompetitionHistory(compId, nick),
    db.computePilotRating(nick),
  ]);

  // Enrich personal records with global comparison
  for (const pr of personalRecords) {
    const globalBest = globalRecords[`${pr.env}|${pr.track}`];
    pr.global_best_ms = globalBest || null;
    pr.pct_off_record = globalBest ? Math.round(((pr.best_lap_ms - globalBest) / globalBest) * 1000) / 10 : null;
  }

  // Compute average % off record across all tracks
  const pctValues = personalRecords.filter(pr => pr.pct_off_record != null).map(pr => pr.pct_off_record);
  summary.avg_pct_off_record = pctValues.length > 0
    ? Math.round(pctValues.reduce((a, b) => a + b, 0) / pctValues.length * 10) / 10
    : null;

  res.json({ summary, personalRecords, weeklyTrend, recentRaces, competition, rating });
});

router.get('/auth/my-track-trend', requireSiteAuth, profileStatsLimiter, async (req, res) => {
  const user = await db.getSiteUserByEmail(req.siteUser.username);
  if (!user?.nickname || !user.nick_verified) {
    return res.status(400).json({ error: 'Verified nickname required' });
  }
  const { env, track } = req.query;
  if (!env || !track) return res.status(400).json({ error: 'env and track required' });
  const trend = await db.getPilotTrackTrend(user.nickname, env, track);
  res.json({ trend });
});

router.get('/auth/my-laps/csv', requireSiteAuth, csvDownloadLimiter, async (req, res) => {
  const user = await db.getSiteUserByEmail(req.siteUser.username);
  if (!user?.nickname || !user.nick_verified) {
    return res.status(400).json({ error: 'Verified nickname required' });
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${user.nickname}-laps.csv"`);
  await db.streamLapsCsv(user.nickname, res);
});

router.get('/auth/my-races/csv', requireSiteAuth, csvDownloadLimiter, async (req, res) => {
  const user = await db.getSiteUserByEmail(req.siteUser.username);
  if (!user?.nickname || !user.nick_verified) {
    return res.status(400).json({ error: 'Verified nickname required' });
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${user.nickname}-races.csv"`);
  await db.streamRacesCsv(user.nickname, res);
});

module.exports = router;
