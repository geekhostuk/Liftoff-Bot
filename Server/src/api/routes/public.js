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

module.exports = router;
