const { getPool } = require('./connection');

// ── Summary Stats ──────────────────────────────────────────────────────────

async function getPilotSummary(nick) {
  const { rows: [row] } = await getPool().query(`
    SELECT
      COUNT(*)::int                       AS total_laps,
      MIN(l.lap_ms)                       AS all_time_best_ms,
      COUNT(DISTINCT l.race_id)::int      AS races_entered,
      COUNT(DISTINCT r.env || '|' || r.track)::int AS tracks_flown,
      MIN(l.recorded_at)                  AS first_race_date
    FROM laps l
    JOIN races r ON r.id = l.race_id
    WHERE l.nick = $1
  `, [nick]);
  return row;
}

// ── Personal Records (best lap per track) ──────────────────────────────────

async function getPilotPersonalRecords(nick) {
  const { rows } = await getPool().query(`
    SELECT r.env, r.track,
      MIN(l.lap_ms)    AS best_lap_ms,
      COUNT(*)::int     AS laps_on_track
    FROM laps l
    JOIN races r ON r.id = l.race_id
    WHERE l.nick = $1 AND r.env IS NOT NULL AND r.track IS NOT NULL
    GROUP BY r.env, r.track
    ORDER BY best_lap_ms ASC
  `, [nick]);
  return rows;
}

// ── Global track records (for comparison) ──────────────────────────────────

async function getGlobalTrackRecords() {
  const { rows } = await getPool().query(`
    SELECT r.env, r.track, MIN(l.lap_ms) AS global_best_ms
    FROM laps l
    JOIN races r ON r.id = l.race_id
    WHERE r.env IS NOT NULL AND r.track IS NOT NULL
    GROUP BY r.env, r.track
  `);
  const map = {};
  for (const r of rows) map[`${r.env}|${r.track}`] = Number(r.global_best_ms);
  return map;
}

// ── Weekly Trend (last 20 weeks) ───────────────────────────────────────────

async function getPilotWeeklyTrend(nick) {
  const { rows } = await getPool().query(`
    SELECT
      date_trunc('week', l.recorded_at)::date AS week,
      AVG(l.lap_ms)::int  AS avg_lap_ms,
      MIN(l.lap_ms)       AS best_lap_ms,
      COUNT(*)::int        AS lap_count
    FROM laps l
    WHERE l.nick = $1
    GROUP BY date_trunc('week', l.recorded_at)
    ORDER BY week DESC
    LIMIT 20
  `, [nick]);
  return rows.reverse(); // chronological order for charts
}

// ── Recent Races ───────────────────────────────────────────────────────────

async function getPilotRecentRaces(nick) {
  const { rows } = await getPool().query(`
    SELECT
      rr.race_id, rr.position, rr.best_lap_ms, rr.total_laps, rr.avg_lap_ms,
      r.env, r.track, r.started_at, r.participants
    FROM race_results rr
    JOIN races r ON r.id = rr.race_id
    WHERE rr.pilot_key = $1
    ORDER BY r.started_at DESC
    LIMIT 25
  `, [nick]);
  return rows;
}

// ── Pilot Rating ───────────────────────────────────────────────────────────

async function computePilotRating(nick) {
  const pool = getPool();

  // Speed: percentile of pilot's best lap vs all pilots
  const { rows: [pilotBest] } = await pool.query(
    'SELECT MIN(lap_ms) AS best FROM laps WHERE nick = $1', [nick]
  );
  if (!pilotBest?.best) return null;

  const [{ rows: [{ better }] }, { rows: [{ total }] }] = await Promise.all([
    pool.query(`
      SELECT COUNT(*)::int AS better FROM (
        SELECT MIN(lap_ms) AS best FROM laps GROUP BY COALESCE(steam_id, pilot_guid, nick)
      ) sub WHERE sub.best < $1
    `, [pilotBest.best]),
    pool.query(`
      SELECT COUNT(DISTINCT COALESCE(steam_id, pilot_guid, nick))::int AS total FROM laps
    `),
  ]);

  const speedScore = total > 1 ? (1 - better / total) * 100 : 50;

  // Consistency: coefficient of variation of recent lap times
  const { rows: [cvRow] } = await pool.query(`
    SELECT
      STDDEV(lap_ms)::float / NULLIF(AVG(lap_ms)::float, 0) AS cv
    FROM laps
    WHERE nick = $1
      AND race_id IN (
        SELECT DISTINCT race_id FROM laps WHERE nick = $1
        ORDER BY race_id DESC LIMIT 50
      )
  `, [nick]);
  const cv = cvRow?.cv ?? 0.2;
  const consistencyScore = Math.max(0, Math.min(100, 100 - cv * 500));

  // Competitive: average finish position percentile in last 30 races
  const { rows: [compRow] } = await pool.query(`
    SELECT AVG(
      CASE WHEN r.participants > 1
        THEN (1.0 - (rr.position - 1.0) / (r.participants - 1.0)) * 100
        ELSE 50
      END
    )::float AS comp_score
    FROM (
      SELECT rr2.race_id, rr2.position
      FROM race_results rr2
      WHERE rr2.pilot_key = $1
      ORDER BY rr2.race_id DESC
      LIMIT 30
    ) rr
    JOIN races r ON r.id = rr.race_id
  `, [nick]);
  const competitiveScore = compRow?.comp_score ?? 50;

  // Activity: days active in last 30 days
  const { rows: [actRow] } = await pool.query(`
    SELECT COUNT(DISTINCT recorded_at::date)::int AS days
    FROM laps
    WHERE nick = $1 AND recorded_at >= NOW() - INTERVAL '30 days'
  `, [nick]);
  const activityScore = Math.min(100, (actRow?.days ?? 0) / 30 * 100);

  const score = Math.round(
    speedScore * 0.35 +
    consistencyScore * 0.25 +
    competitiveScore * 0.25 +
    activityScore * 0.15
  );

  // Tier
  let tier;
  if (score >= 90) tier = 'Ace';
  else if (score >= 75) tier = 'Expert';
  else if (score >= 60) tier = 'Advanced';
  else if (score >= 45) tier = 'Intermediate';
  else if (score >= 30) tier = 'Novice';
  else tier = 'Rookie';

  // Percentile among all pilots with laps
  const { rows: [{ worse }] } = await pool.query(`
    SELECT COUNT(*)::int AS worse FROM (
      SELECT MIN(lap_ms) AS best FROM laps GROUP BY COALESCE(steam_id, pilot_guid, nick)
    ) sub WHERE sub.best > $1
  `, [pilotBest.best]);
  const percentile = total > 1 ? Math.round((worse / (total - 1)) * 100) : 50;

  return {
    score,
    tier,
    percentile,
    breakdown: {
      speed: Math.round(speedScore),
      consistency: Math.round(consistencyScore),
      competitive: Math.round(competitiveScore),
      activity: Math.round(activityScore),
    },
  };
}

// ── CSV Streaming ──────────────────────────────────────────────────────────

async function streamLapsCsv(nick, res) {
  res.write('Date,Environment,Track,Lap Number,Lap Time (ms),Lap Time,Race ID\n');
  const batchSize = 1000;
  let offset = 0;
  while (true) {
    const { rows } = await getPool().query(`
      SELECT l.recorded_at, r.env, r.track, l.lap_number, l.lap_ms, l.race_id
      FROM laps l
      JOIN races r ON r.id = l.race_id
      WHERE l.nick = $1
      ORDER BY l.recorded_at DESC
      LIMIT $2 OFFSET $3
    `, [nick, batchSize, offset]);
    if (rows.length === 0) break;
    for (const r of rows) {
      const time = fmtMsCsv(r.lap_ms);
      const date = r.recorded_at ? new Date(r.recorded_at).toISOString() : '';
      res.write(`${date},"${csvEscape(r.env)}","${csvEscape(r.track)}",${r.lap_number},${r.lap_ms},${time},${r.race_id}\n`);
    }
    offset += batchSize;
    if (rows.length < batchSize) break;
  }
  res.end();
}

async function streamRacesCsv(nick, res) {
  res.write('Date,Environment,Track,Position,Participants,Best Lap (ms),Best Lap,Avg Lap (ms),Total Laps\n');
  const batchSize = 500;
  let offset = 0;
  while (true) {
    const { rows } = await getPool().query(`
      SELECT r.started_at, r.env, r.track, rr.position, r.participants,
             rr.best_lap_ms, rr.avg_lap_ms, rr.total_laps
      FROM race_results rr
      JOIN races r ON r.id = rr.race_id
      WHERE rr.pilot_key = $1
      ORDER BY r.started_at DESC
      LIMIT $2 OFFSET $3
    `, [nick, batchSize, offset]);
    if (rows.length === 0) break;
    for (const r of rows) {
      const date = r.started_at ? new Date(r.started_at).toISOString() : '';
      res.write(`${date},"${csvEscape(r.env)}","${csvEscape(r.track)}",${r.position},${r.participants},${r.best_lap_ms},${fmtMsCsv(r.best_lap_ms)},${r.avg_lap_ms || ''},${r.total_laps}\n`);
    }
    offset += batchSize;
    if (rows.length < batchSize) break;
  }
  res.end();
}

function csvEscape(s) {
  return String(s || '').replace(/"/g, '""');
}

function fmtMsCsv(ms) {
  if (ms == null) return '';
  const sec = ms / 1000;
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(3).padStart(6, '0');
  return m > 0 ? `${m}:${s}` : s;
}

module.exports = {
  getPilotSummary,
  getPilotPersonalRecords,
  getGlobalTrackRecords,
  getPilotWeeklyTrend,
  getPilotRecentRaces,
  computePilotRating,
  streamLapsCsv,
  streamRacesCsv,
};
