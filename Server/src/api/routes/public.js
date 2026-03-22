/**
 * Public routes for the API server.
 *
 * All database reads go direct. Runtime state (plugin status, online players,
 * current track) comes from the realtime server via internal API.
 */

const { Router } = require('express');
const db = require('../../database');
const rt = require('../realtimeClient');

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
  const comp = await db.getActiveCompetition();
  if (!comp) return res.json({ competition: null, current_week: null });
  const weeks = await db.getWeeks(comp.id);
  const currentWeek = weeks.find(w => w.status === 'active') || null;
  const nextWeek = weeks.find(w => w.status === 'scheduled') || null;
  res.json({ competition: comp, current_week: currentWeek, next_week: nextWeek });
});

router.get('/competition/standings', async (req, res) => {
  const week = await db.getActiveWeek();
  if (!week) return res.json([]);
  res.json(await db.getWeeklyStandings(week.id));
});

router.get('/competition/standings/:weekId', async (req, res) => {
  res.json(await db.getWeeklyStandings(Number(req.params.weekId)));
});

router.get('/competition/season', async (req, res) => {
  const comp = await db.getActiveCompetition();
  if (!comp) return res.json([]);
  res.json(await db.getSeasonStandings(comp.id));
});

router.get('/competition/weeks', async (req, res) => {
  const comp = await db.getActiveCompetition();
  if (!comp) return res.json([]);
  res.json(await db.getWeeks(comp.id));
});

router.get('/competition/pilot/:pilotKey', async (req, res) => {
  const comp = await db.getActiveCompetition();
  if (!comp) return res.json({ weeklyStandings: [], recentResults: [] });
  res.json(await db.getPilotCompetitionHistory(comp.id, decodeURIComponent(req.params.pilotKey)));
});

router.get('/competition/race/:raceId/results', async (req, res) => {
  res.json(await db.getRaceResultsWithPoints(req.params.raceId));
});

module.exports = router;
