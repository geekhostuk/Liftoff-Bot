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

// ── Weekly Trend (last 20 weeks, normalised % off track record) ───────────

async function getPilotWeeklyTrend(nick) {
  const { rows } = await getPool().query(`
    WITH track_records AS (
      SELECT r.env, r.track, MIN(l.lap_ms) AS global_best
      FROM laps l JOIN races r ON r.id = l.race_id
      WHERE r.env IS NOT NULL AND r.track IS NOT NULL
      GROUP BY r.env, r.track
    )
    SELECT
      date_trunc('week', l.recorded_at)::date AS week,
      AVG((l.lap_ms - tr.global_best)::float / tr.global_best * 100)::float AS avg_pct_off,
      MIN((l.lap_ms - tr.global_best)::float / tr.global_best * 100)::float AS best_pct_off,
      COUNT(*)::int AS lap_count,
      COUNT(DISTINCT r.env || '|' || r.track)::int AS tracks_flown
    FROM laps l
    JOIN races r ON r.id = l.race_id
    JOIN track_records tr ON tr.env = r.env AND tr.track = r.track
    WHERE l.nick = $1
    GROUP BY date_trunc('week', l.recorded_at)
    ORDER BY week DESC
    LIMIT 20
  `, [nick]);
  return rows.reverse();
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

  // Speed + percentile: single query for avg % off track record vs all pilots
  const { rows: [speedRow] } = await pool.query(`
    WITH track_records AS (
      SELECT r.env, r.track, MIN(l.lap_ms) AS global_best
      FROM laps l JOIN races r ON r.id = l.race_id
      WHERE r.env IS NOT NULL AND r.track IS NOT NULL
      GROUP BY r.env, r.track
    ),
    pilot_track_bests AS (
      SELECT l.nick, r.env, r.track, MIN(l.lap_ms) AS best_ms
      FROM laps l JOIN races r ON r.id = l.race_id
      WHERE r.env IS NOT NULL AND r.track IS NOT NULL
      GROUP BY l.nick, r.env, r.track
    ),
    pilot_avg_pct AS (
      SELECT ptb.nick,
        AVG((ptb.best_ms - tr.global_best)::float / NULLIF(tr.global_best, 0) * 100) AS avg_pct_off
      FROM pilot_track_bests ptb
      JOIN track_records tr ON tr.env = ptb.env AND tr.track = ptb.track
      GROUP BY ptb.nick
      HAVING COUNT(*) >= 3
    )
    SELECT
      (SELECT avg_pct_off FROM pilot_avg_pct WHERE nick = $1) AS my_pct,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE avg_pct_off < (SELECT avg_pct_off FROM pilot_avg_pct WHERE nick = $1))::int AS better,
      COUNT(*) FILTER (WHERE avg_pct_off > (SELECT avg_pct_off FROM pilot_avg_pct WHERE nick = $1))::int AS worse
    FROM pilot_avg_pct
  `, [nick]);

  if (!speedRow) return null;
  const speedScore = speedRow.my_pct != null && speedRow.total > 1
    ? (1 - speedRow.better / speedRow.total) * 100
    : 50;

  // Consistency: per-track CV weighted by lap count (last 50 races)
  const { rows: [cvRow] } = await pool.query(`
    WITH recent_race_ids AS (
      SELECT DISTINCT race_id FROM laps WHERE nick = $1
      ORDER BY race_id DESC LIMIT 50
    ),
    per_track_cv AS (
      SELECT r.env, r.track,
        STDDEV(l.lap_ms)::float / NULLIF(AVG(l.lap_ms)::float, 0) AS cv,
        COUNT(*)::int AS n
      FROM laps l
      JOIN races r ON r.id = l.race_id
      WHERE l.nick = $1 AND l.race_id IN (SELECT race_id FROM recent_race_ids)
        AND r.env IS NOT NULL AND r.track IS NOT NULL
      GROUP BY r.env, r.track
      HAVING COUNT(*) >= 3
    )
    SELECT SUM(cv * n)::float / NULLIF(SUM(n)::float, 0) AS weighted_cv
    FROM per_track_cv
  `, [nick]);
  const cv = cvRow?.weighted_cv ?? 0.2;
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

  // Percentile: reuse worse count from the speed query (same CTE, no duplicate scan)
  const totalPilots = speedRow.total || 1;
  const percentile = totalPilots > 1 ? Math.round((speedRow?.worse ?? 0) / (totalPilots - 1) * 100) : 50;

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

// ── Per-Track Trend (for drill-down) ──────────────────────────────────────

async function getPilotTrackTrend(nick, env, track) {
  const { rows } = await getPool().query(`
    SELECT
      l.recorded_at::date AS session_date,
      MIN(l.lap_ms)       AS best_lap_ms,
      AVG(l.lap_ms)::int  AS avg_lap_ms,
      COUNT(*)::int        AS lap_count
    FROM laps l
    JOIN races r ON r.id = l.race_id
    WHERE l.nick = $1 AND r.env = $2 AND r.track = $3
    GROUP BY l.recorded_at::date
    ORDER BY session_date ASC
  `, [nick, env, track]);
  return rows;
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
  getPilotTrackTrend,
  computePilotRating,
  streamLapsCsv,
  streamRacesCsv,
};
