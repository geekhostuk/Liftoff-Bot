const { getPool } = require('./connection');

// ── Competitions ────────────────────────────────────────────────────────────

async function createCompetition(name) {
  const { rows: [row] } = await getPool().query(`
    INSERT INTO competitions (name, created_at) VALUES ($1, NOW())
    RETURNING *
  `, [name]);
  return row;
}

async function getCompetitions() {
  const { rows } = await getPool().query('SELECT * FROM competitions ORDER BY id DESC');
  return rows;
}

async function getActiveCompetition() {
  const { rows: [row] } = await getPool().query("SELECT * FROM competitions WHERE status = 'active' ORDER BY id DESC LIMIT 1");
  return row || null;
}

async function archiveCompetition(id) {
  await getPool().query("UPDATE competitions SET status = 'archived' WHERE id = $1", [id]);
}

// ── Competition Weeks ───────────────────────────────────────────────────────

async function createWeek(competitionId, weekNumber, startsAt, endsAt) {
  const { rows: [row] } = await getPool().query(`
    INSERT INTO competition_weeks (competition_id, week_number, starts_at, ends_at)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [competitionId, weekNumber, startsAt, endsAt]);
  return row;
}

async function generateWeeks(competitionId, count, startDate) {
  const weeks = [];
  const start = new Date(startDate);
  // Align to the Monday of the week containing the chosen date
  const day = start.getUTCDay(); // 0=Sun,1=Mon,...,6=Sat
  const diff = day === 0 ? -6 : 1 - day; // Sun→back 6, Mon→0, Tue→-1, etc.
  start.setUTCDate(start.getUTCDate() + diff);
  start.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i < count; i++) {
    const weekStart = new Date(start);
    weekStart.setUTCDate(weekStart.getUTCDate() + i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 0);

    const week = await createWeek(
      competitionId,
      i + 1,
      weekStart.toISOString(),
      weekEnd.toISOString()
    );
    weeks.push(week);
  }
  return weeks;
}

async function getWeeks(competitionId) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM competition_weeks WHERE competition_id = $1 ORDER BY week_number', [competitionId]
  );
  for (const w of rows) {
    const { rows: [{ n }] } = await pool.query(
      'SELECT COUNT(*) AS n FROM week_playlists WHERE week_id = $1', [w.id]
    );
    w.playlist_count = parseInt(n, 10);
  }
  return rows;
}

async function getWeekById(id) {
  const { rows: [row] } = await getPool().query('SELECT * FROM competition_weeks WHERE id = $1', [id]);
  return row || null;
}

async function getActiveWeek() {
  const { rows: [row] } = await getPool().query(`
    SELECT cw.*, c.name AS competition_name
    FROM competition_weeks cw
    JOIN competitions c ON c.id = cw.competition_id
    WHERE cw.status = 'active' AND c.status = 'active'
    ORDER BY cw.id DESC LIMIT 1
  `);
  return row || null;
}

async function getNextScheduledWeek() {
  const now = new Date().toISOString();
  const { rows: [row] } = await getPool().query(`
    SELECT cw.*, c.name AS competition_name
    FROM competition_weeks cw
    JOIN competitions c ON c.id = cw.competition_id
    WHERE cw.status = 'scheduled' AND c.status = 'active'
      AND cw.starts_at <= $1
    ORDER BY cw.starts_at ASC LIMIT 1
  `, [now]);
  return row || null;
}

async function getOverdueActiveWeek() {
  const now = new Date().toISOString();
  const { rows: [row] } = await getPool().query(`
    SELECT cw.*, c.name AS competition_name
    FROM competition_weeks cw
    JOIN competitions c ON c.id = cw.competition_id
    WHERE cw.status = 'active' AND c.status = 'active'
      AND cw.ends_at < $1
    ORDER BY cw.ends_at ASC LIMIT 1
  `, [now]);
  return row || null;
}

async function updateWeekStatus(id, status) {
  await getPool().query('UPDATE competition_weeks SET status = $1 WHERE id = $2', [status, id]);
}

async function updateWeek(id, fields) {
  const sets = [];
  const values = [];
  let n = 1;
  if (fields.starts_at !== undefined) { sets.push(`starts_at = $${n++}`); values.push(fields.starts_at); }
  if (fields.ends_at !== undefined) { sets.push(`ends_at = $${n++}`); values.push(fields.ends_at); }
  if (fields.status !== undefined) { sets.push(`status = $${n++}`); values.push(fields.status); }
  if (fields.week_number !== undefined) { sets.push(`week_number = $${n++}`); values.push(fields.week_number); }
  if (fields.interval_ms !== undefined) { sets.push(`interval_ms = $${n++}`); values.push(fields.interval_ms); }
  if (sets.length === 0) return;
  values.push(id);
  await getPool().query(`UPDATE competition_weeks SET ${sets.join(', ')} WHERE id = $${n}`, values);
}

async function deleteWeek(id) {
  const pool = getPool();
  await pool.query('DELETE FROM weekly_standings WHERE week_id = $1', [id]);
  await pool.query('DELETE FROM weekly_points WHERE week_id = $1', [id]);
  await pool.query('DELETE FROM race_results WHERE week_id = $1', [id]);
  await pool.query('DELETE FROM week_playlists WHERE week_id = $1', [id]);
  await pool.query('DELETE FROM competition_weeks WHERE id = $1', [id]);
}

async function getCurrentWeekInfo() {
  const pool = getPool();
  const active = await getActiveWeek();
  if (!active) return null;
  const { rows: [comp] } = await pool.query('SELECT * FROM competitions WHERE id = $1', [active.competition_id]);
  return { competition: comp, week: active };
}

// ── Week Playlists ──────────────────────────────────────────────────────────

async function getWeekPlaylists(weekId) {
  const { rows } = await getPool().query(`
    SELECT wp.*, p.name AS playlist_name
    FROM week_playlists wp
    JOIN playlists p ON p.id = wp.playlist_id
    WHERE wp.week_id = $1
    ORDER BY wp.position
  `, [weekId]);
  return rows;
}

async function addWeekPlaylist(weekId, playlistId, intervalMs = 900000) {
  const pool = getPool();
  const { rows: [{ m }] } = await pool.query(
    'SELECT COALESCE(MAX(position), -1) AS m FROM week_playlists WHERE week_id = $1', [weekId]
  );
  const { rows: [row] } = await pool.query(`
    INSERT INTO week_playlists (week_id, playlist_id, position, interval_ms)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [weekId, playlistId, parseInt(m, 10) + 1, intervalMs]);
  return row;
}

async function removeWeekPlaylist(wpId) {
  const pool = getPool();
  const { rows: [row] } = await pool.query('SELECT * FROM week_playlists WHERE id = $1', [wpId]);
  if (!row) return;
  await pool.query('DELETE FROM week_playlists WHERE id = $1', [wpId]);
  const { rows: remaining } = await pool.query(
    'SELECT id FROM week_playlists WHERE week_id = $1 ORDER BY position', [row.week_id]
  );
  for (let i = 0; i < remaining.length; i++) {
    await pool.query('UPDATE week_playlists SET position = $1 WHERE id = $2', [i, remaining[i].id]);
  }
}

async function moveWeekPlaylist(wpId, direction) {
  const pool = getPool();
  const { rows: [row] } = await pool.query('SELECT * FROM week_playlists WHERE id = $1', [wpId]);
  if (!row) return;
  const { rows: items } = await pool.query(
    'SELECT * FROM week_playlists WHERE week_id = $1 ORDER BY position', [row.week_id]
  );
  const idx = items.findIndex(r => r.id === wpId);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return;
  const a = items[idx], b = items[swapIdx];
  await pool.query('UPDATE week_playlists SET position = $1 WHERE id = $2', [b.position, a.id]);
  await pool.query('UPDATE week_playlists SET position = $1 WHERE id = $2', [a.position, b.id]);
}

// ── Race Results ────────────────────────────────────────────────────────────

async function insertRaceResult(raceId, pilotKey, displayName, position, bestLapMs, totalLaps, avgLapMs, weekId) {
  await getPool().query(`
    INSERT INTO race_results (race_id, pilot_key, display_name, position, best_lap_ms, total_laps, avg_lap_ms, week_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (race_id, pilot_key) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      position = EXCLUDED.position,
      best_lap_ms = EXCLUDED.best_lap_ms,
      total_laps = EXCLUDED.total_laps,
      avg_lap_ms = EXCLUDED.avg_lap_ms,
      week_id = EXCLUDED.week_id
  `, [raceId, pilotKey, displayName, position, bestLapMs, totalLaps, avgLapMs, weekId]);
}

async function getRaceResults(raceId) {
  const { rows } = await getPool().query(
    'SELECT * FROM race_results WHERE race_id = $1 ORDER BY position', [raceId]
  );
  return rows;
}

async function getRaceResultsWithPoints(raceId) {
  const pool = getPool();
  const results = await getRaceResults(raceId);
  for (const r of results) {
    const { rows } = await pool.query(
      'SELECT category, points, detail FROM weekly_points WHERE week_id = $1 AND pilot_key = $2 AND detail LIKE $3',
      [r.week_id, r.pilot_key, `%${raceId}%`]
    );
    r.points = rows;
  }
  return results;
}

// ── Points ──────────────────────────────────────────────────────────────────

async function awardPoints(weekId, pilotKey, category, points, detail = null) {
  await getPool().query(`
    INSERT INTO weekly_points (week_id, pilot_key, category, points, detail)
    VALUES ($1, $2, $3, $4, $5)
  `, [weekId, pilotKey, category, points, detail ? JSON.stringify(detail) : null]);
}

async function getWeeklyPointsForPilot(weekId, pilotKey) {
  const { rows } = await getPool().query(
    'SELECT * FROM weekly_points WHERE week_id = $1 AND pilot_key = $2 ORDER BY awarded_at', [weekId, pilotKey]
  );
  return rows;
}

async function getPointsByCategory(weekId) {
  const { rows } = await getPool().query(`
    SELECT pilot_key, category, SUM(points) AS total
    FROM weekly_points WHERE week_id = $1
    GROUP BY pilot_key, category
    ORDER BY total DESC
  `, [weekId]);
  return rows;
}

// ── Standings ───────────────────────────────────────────────────────────────

async function refreshWeeklyStandings(weekId) {
  const pool = getPool();
  const week = await getWeekById(weekId);
  if (!week) return;

  // Aggregate points by pilot and category
  const { rows: pilots } = await pool.query(`
    SELECT pilot_key,
      SUM(points) AS total_points,
      SUM(CASE WHEN category = 'race_position' THEN points ELSE 0 END) AS position_points,
      SUM(CASE WHEN category IN ('most_laps', 'lap_leader') THEN points ELSE 0 END) AS laps_points,
      SUM(CASE WHEN category = 'most_improved' OR category = 'personal_best' THEN points ELSE 0 END) AS improved_points,
      SUM(CASE WHEN category = 'consistency' THEN points ELSE 0 END) AS consistency_points,
      SUM(CASE WHEN category = 'participation' THEN points ELSE 0 END) AS participation_points,
      SUM(CASE WHEN category = 'hot_streak' THEN points ELSE 0 END) AS streak_points
    FROM weekly_points
    WHERE week_id = $1
    GROUP BY pilot_key
    ORDER BY total_points DESC
  `, [weekId]);

  // Get display names from most recent race_results
  const nameMap = {};
  const { rows: names } = await pool.query(`
    SELECT pilot_key, display_name FROM race_results
    WHERE week_id = $1 AND display_name IS NOT NULL
    ORDER BY id DESC
  `, [weekId]);
  for (const n of names) {
    if (!nameMap[n.pilot_key]) nameMap[n.pilot_key] = n.display_name;
  }

  // Clear and rebuild standings
  await pool.query('DELETE FROM weekly_standings WHERE week_id = $1', [weekId]);

  for (let i = 0; i < pilots.length; i++) {
    const p = pilots[i];
    await pool.query(`
      INSERT INTO weekly_standings
        (week_id, competition_id, pilot_key, display_name, total_points,
         position_points, laps_points, improved_points, consistency_points,
         participation_points, streak_points, rank, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
    `, [
      weekId, week.competition_id, p.pilot_key,
      nameMap[p.pilot_key] || p.pilot_key,
      p.total_points, p.position_points, p.laps_points,
      p.improved_points, p.consistency_points,
      p.participation_points, p.streak_points,
      i + 1,
    ]);
  }
}

async function getWeeklyStandings(weekId) {
  const { rows } = await getPool().query(
    'SELECT * FROM weekly_standings WHERE week_id = $1 ORDER BY rank ASC', [weekId]
  );
  return rows;
}

async function getSeasonStandings(competitionId) {
  const { rows } = await getPool().query(`
    SELECT pilot_key, display_name,
      SUM(total_points) AS total_points,
      SUM(position_points) AS position_points,
      SUM(laps_points) AS laps_points,
      SUM(improved_points) AS improved_points,
      SUM(consistency_points) AS consistency_points,
      SUM(participation_points) AS participation_points,
      SUM(streak_points) AS streak_points,
      COUNT(DISTINCT week_id) AS weeks_active
    FROM weekly_standings
    WHERE competition_id = $1
    GROUP BY pilot_key, display_name
    ORDER BY total_points DESC
  `, [competitionId]);
  return rows;
}

async function getPilotCompetitionHistory(competitionId, pilotKey) {
  const pool = getPool();
  const { rows: weeklyStandings } = await pool.query(`
    SELECT ws.*, cw.week_number, cw.starts_at, cw.ends_at
    FROM weekly_standings ws
    JOIN competition_weeks cw ON cw.id = ws.week_id
    WHERE ws.competition_id = $1 AND ws.pilot_key = $2
    ORDER BY cw.week_number
  `, [competitionId, pilotKey]);

  const { rows: recentResults } = await pool.query(`
    SELECT rr.*, r.env, r.track, r.started_at AS race_started_at
    FROM race_results rr
    JOIN races r ON r.id = rr.race_id
    JOIN competition_weeks cw ON cw.id = rr.week_id
    WHERE cw.competition_id = $1 AND rr.pilot_key = $2
    ORDER BY r.started_at DESC
    LIMIT 50
  `, [competitionId, pilotKey]);

  return { weeklyStandings, recentResults };
}

// ── Scoring Helpers ─────────────────────────────────────────────────────────

async function getRaceLapsGrouped(raceId) {
  const { rows } = await getPool().query(`
    SELECT
      COALESCE(steam_id, pilot_guid, nick) AS pilot_key,
      nick,
      MIN(lap_ms) AS best_lap_ms,
      COUNT(*) AS total_laps,
      AVG(lap_ms) AS avg_lap_ms
    FROM laps
    WHERE race_id = $1
    GROUP BY COALESCE(steam_id, pilot_guid, nick), nick
    HAVING COUNT(*) >= 2
    ORDER BY best_lap_ms ASC
  `, [raceId]);
  return rows;
}

async function getRaceLapsDetailed(raceId, pilotKey) {
  const { rows } = await getPool().query(`
    SELECT lap_ms FROM laps
    WHERE race_id = $1 AND COALESCE(steam_id, pilot_guid, nick) = $2
    ORDER BY lap_number
  `, [raceId, pilotKey]);
  return rows.map(r => r.lap_ms);
}

async function getPilotBaselineBests(pilotKey, beforeDate) {
  const { rows } = await getPool().query(`
    SELECT r.env, r.track, MIN(l.lap_ms) AS best_lap_ms
    FROM laps l
    JOIN races r ON r.id = l.race_id
    WHERE COALESCE(l.steam_id, l.pilot_guid, l.nick) = $1
      AND l.recorded_at < $2
      AND r.env IS NOT NULL AND r.track IS NOT NULL
    GROUP BY r.env, r.track
  `, [pilotKey, beforeDate]);
  return rows;
}

async function getPilotWeekBests(pilotKey, startsAt, endsAt) {
  const { rows } = await getPool().query(`
    SELECT r.env, r.track, MIN(l.lap_ms) AS best_lap_ms
    FROM laps l
    JOIN races r ON r.id = l.race_id
    WHERE COALESCE(l.steam_id, l.pilot_guid, l.nick) = $1
      AND l.recorded_at >= $2 AND l.recorded_at <= $3
      AND r.env IS NOT NULL AND r.track IS NOT NULL
    GROUP BY r.env, r.track
  `, [pilotKey, startsAt, endsAt]);
  return rows;
}

async function getWeekPilots(weekId) {
  const week = await getWeekById(weekId);
  if (!week) return [];
  const { rows } = await getPool().query(`
    SELECT DISTINCT COALESCE(l.steam_id, l.pilot_guid, l.nick) AS pilot_key, l.nick
    FROM laps l
    JOIN races r ON r.id = l.race_id
    WHERE l.recorded_at >= $1 AND l.recorded_at <= $2
  `, [week.starts_at, week.ends_at]);
  return rows;
}

async function getPilotActiveDays(pilotKey, startsAt, endsAt) {
  const { rows: [{ day_count }] } = await getPool().query(`
    SELECT COUNT(DISTINCT l.recorded_at::date) AS day_count
    FROM laps l
    WHERE COALESCE(l.steam_id, l.pilot_guid, l.nick) = $1
      AND l.recorded_at >= $2 AND l.recorded_at <= $3
  `, [pilotKey, startsAt, endsAt]);
  return parseInt(day_count, 10);
}

async function getPilotDistinctTracks(pilotKey, startsAt, endsAt) {
  const { rows: [{ track_count }] } = await getPool().query(`
    SELECT COUNT(DISTINCT r.env || '|' || r.track) AS track_count
    FROM laps l
    JOIN races r ON r.id = l.race_id
    WHERE COALESCE(l.steam_id, l.pilot_guid, l.nick) = $1
      AND l.recorded_at >= $2 AND l.recorded_at <= $3
      AND r.env IS NOT NULL AND r.track IS NOT NULL
  `, [pilotKey, startsAt, endsAt]);
  return parseInt(track_count, 10);
}

async function hasRaceResults(raceId) {
  const { rows: [{ n }] } = await getPool().query(
    'SELECT COUNT(*) AS n FROM race_results WHERE race_id = $1', [raceId]
  );
  return parseInt(n, 10) > 0;
}

// ── Runner State Persistence ────────────────────────────────────────────────

async function saveRunnerState(state) {
  const pool = getPool();
  const upsert = `INSERT INTO kv_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  await pool.query(upsert, ['runner_auto_managed', state.autoManaged ? '1' : '0']);
  await pool.query(upsert, ['runner_week_id', state.currentWeekId != null ? String(state.currentWeekId) : '']);
  await pool.query(upsert, ['runner_day_number', state.currentDayNumber != null ? String(state.currentDayNumber) : '']);
}

async function loadRunnerState() {
  const pool = getPool();
  const get = async (key) => {
    const { rows: [row] } = await pool.query('SELECT value FROM kv_store WHERE key = $1', [key]);
    return row ? row.value : null;
  };
  return {
    autoManaged: (await get('runner_auto_managed')) === '1',
    currentWeekId: (await get('runner_week_id')) ? Number(await get('runner_week_id')) : null,
    currentDayNumber: (await get('runner_day_number')) !== null ? Number(await get('runner_day_number')) : null,
  };
}

// ── Week Schedules ─────────────────────────────────────────────────────────

async function saveWeekSchedule(weekId, dayNumber, schedule) {
  await getPool().query(`
    INSERT INTO week_schedules (week_id, day_number, schedule)
    VALUES ($1, $2, $3)
    ON CONFLICT (week_id, day_number) DO UPDATE SET schedule = EXCLUDED.schedule, created_at = NOW()
  `, [weekId, dayNumber, JSON.stringify(schedule)]);
}

async function getWeekSchedule(weekId, dayNumber) {
  const { rows: [row] } = await getPool().query(
    'SELECT schedule FROM week_schedules WHERE week_id = $1 AND day_number = $2',
    [weekId, dayNumber]
  );
  return row ? row.schedule : null;
}

async function deleteWeekSchedules(weekId) {
  await getPool().query('DELETE FROM week_schedules WHERE week_id = $1', [weekId]);
}

// ── Playlist Runner State ─────────────────────────────────────────────────

async function savePlaylistRunnerState(plState) {
  const pool = getPool();
  const upsert = `INSERT INTO kv_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  await pool.query(upsert, ['pl_playlist_id', plState.playlistId != null ? String(plState.playlistId) : '']);
  await pool.query(upsert, ['pl_current_index', String(plState.currentIndex || 0)]);
  await pool.query(upsert, ['pl_interval_ms', String(plState.intervalMs || 900000)]);
  await pool.query(upsert, ['pl_next_change_at', plState.nextChangeAt ? plState.nextChangeAt.toISOString() : '']);
}

async function loadPlaylistRunnerState() {
  const pool = getPool();
  const get = async (key) => {
    const { rows: [row] } = await pool.query('SELECT value FROM kv_store WHERE key = $1', [key]);
    return row ? row.value : null;
  };
  const playlistId = await get('pl_playlist_id');
  return {
    playlistId: playlistId ? Number(playlistId) : null,
    currentIndex: Number((await get('pl_current_index')) || 0),
    intervalMs: Number((await get('pl_interval_ms')) || 900000),
    nextChangeAt: (await get('pl_next_change_at')) || null,
  };
}

async function clearPlaylistRunnerState() {
  const pool = getPool();
  await pool.query(`DELETE FROM kv_store WHERE key IN ('pl_playlist_id', 'pl_current_index', 'pl_interval_ms', 'pl_next_change_at')`);
}

async function clearWeekData(weekId) {
  const pool = getPool();
  await pool.query('DELETE FROM weekly_points WHERE week_id = $1', [weekId]);
  await pool.query('DELETE FROM race_results WHERE week_id = $1', [weekId]);
  await pool.query('DELETE FROM weekly_standings WHERE week_id = $1', [weekId]);
}

async function getRacesInRange(startsAt, endsAt) {
  const { rows } = await getPool().query(`
    SELECT id FROM races
    WHERE started_at >= $1 AND started_at <= $2 AND ended_at IS NOT NULL
    ORDER BY started_at
  `, [startsAt, endsAt]);
  return rows;
}

module.exports = {
  // Competitions
  createCompetition,
  getCompetitions,
  getActiveCompetition,
  archiveCompetition,
  // Weeks
  createWeek,
  generateWeeks,
  getWeeks,
  getWeekById,
  getActiveWeek,
  getNextScheduledWeek,
  getOverdueActiveWeek,
  updateWeekStatus,
  updateWeek,
  deleteWeek,
  getCurrentWeekInfo,
  // Week playlists
  getWeekPlaylists,
  addWeekPlaylist,
  removeWeekPlaylist,
  moveWeekPlaylist,
  // Race results
  insertRaceResult,
  getRaceResults,
  getRaceResultsWithPoints,
  // Points
  awardPoints,
  getWeeklyPointsForPilot,
  getPointsByCategory,
  // Standings
  refreshWeeklyStandings,
  getWeeklyStandings,
  getSeasonStandings,
  getPilotCompetitionHistory,
  // Scoring helpers
  getRaceLapsGrouped,
  getRaceLapsDetailed,
  getPilotBaselineBests,
  getPilotWeekBests,
  getWeekPilots,
  getPilotActiveDays,
  getPilotDistinctTracks,
  hasRaceResults,
  // Runner state
  saveRunnerState,
  loadRunnerState,
  // Week schedules
  saveWeekSchedule,
  getWeekSchedule,
  deleteWeekSchedules,
  // Playlist runner state
  savePlaylistRunnerState,
  loadPlaylistRunnerState,
  clearPlaylistRunnerState,
  // Recalculation helpers
  clearWeekData,
  getRacesInRange,
};
