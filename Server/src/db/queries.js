const { getPool } = require('./connection');

async function getRaces({ limit = 50, offset = 0 } = {}) {
  const { rows } = await getPool().query(`
    SELECT * FROM races
    ORDER BY started_at DESC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);
  return rows;
}

async function getRaceById(id) {
  const pool = getPool();
  const { rows: [race] } = await pool.query('SELECT * FROM races WHERE id = $1', [id]);
  if (!race) return null;
  const { rows: laps } = await pool.query(`
    SELECT * FROM laps WHERE race_id = $1
      AND nick IN (SELECT nickname FROM site_users WHERE nick_verified = TRUE AND nickname IS NOT NULL)
    ORDER BY lap_number
  `, [id]);
  race.laps = laps;
  return race;
}

async function getBestLaps({ limit = 100 } = {}) {
  const { rows } = await getPool().query(`
    SELECT
      COALESCE(steam_id, pilot_guid, nick) AS pilot_key,
      nick,
      pilot_guid,
      steam_id,
      MIN(lap_ms)  AS best_lap_ms,
      COUNT(*)     AS total_laps
    FROM laps
    WHERE nick IN (SELECT nickname FROM site_users WHERE nick_verified = TRUE AND nickname IS NOT NULL)
    GROUP BY COALESCE(steam_id, pilot_guid, nick), nick, pilot_guid, steam_id
    ORDER BY best_lap_ms ASC
    LIMIT $1
  `, [limit]);
  return rows;
}

async function getLatestRaceWithLaps(since) {
  const pool = getPool();
  const { rows: [race] } = await pool.query(`
    SELECT r.* FROM races r
    LEFT JOIN laps l ON l.race_id = r.id
    GROUP BY r.id
    ORDER BY COALESCE(MAX(l.recorded_at), r.started_at) DESC, r.started_at DESC
    LIMIT 1
  `);
  if (!race) return null;
  const regFilter = 'AND nick IN (SELECT nickname FROM site_users WHERE nick_verified = TRUE AND nickname IS NOT NULL)';
  if (since) {
    const { rows } = await pool.query(`
      SELECT * FROM laps WHERE race_id = $1 AND recorded_at >= $2 ${regFilter} ORDER BY recorded_at ASC
    `, [race.id, since]);
    race.laps = rows;
  } else {
    const { rows } = await pool.query(`
      SELECT * FROM laps WHERE race_id = $1 ${regFilter} ORDER BY recorded_at ASC
    `, [race.id]);
    race.laps = rows;
  }
  return race;
}

async function getBestLapsByTrack(env, track, { limit = 100 } = {}) {
  const { rows } = await getPool().query(`
    SELECT
      COALESCE(l.steam_id, l.pilot_guid, l.nick) AS pilot_key,
      (ARRAY_AGG(l.nick ORDER BY l.lap_ms ASC))[1] AS nick,
      MIN(l.lap_ms)  AS best_lap_ms,
      COUNT(*)       AS total_laps
    FROM laps l
    JOIN races r ON l.race_id = r.id
    WHERE r.env = $1 AND r.track = $2
      AND l.nick IN (SELECT nickname FROM site_users WHERE nick_verified = TRUE AND nickname IS NOT NULL)
    GROUP BY COALESCE(l.steam_id, l.pilot_guid, l.nick)
    ORDER BY best_lap_ms ASC
    LIMIT $3
  `, [env, track, limit]);
  return rows;
}

async function getPlayerStats({ limit = 200 } = {}) {
  const { rows } = await getPool().query(`
    SELECT
      COALESCE(steam_id, pilot_guid, nick) AS pilot_key,
      nick, pilot_guid, steam_id,
      MIN(lap_ms)            AS best_lap_ms,
      COUNT(*)               AS total_laps,
      COUNT(DISTINCT race_id) AS races_entered
    FROM laps
    WHERE nick IN (SELECT nickname FROM site_users WHERE nick_verified = TRUE AND nickname IS NOT NULL)
    GROUP BY COALESCE(steam_id, pilot_guid, nick), nick, pilot_guid, steam_id
    ORDER BY total_laps DESC
    LIMIT $1
  `, [limit]);
  return rows;
}

async function getLatestCatalog() {
  const { rows: [row] } = await getPool().query(`
    SELECT catalog_json FROM track_catalog ORDER BY id DESC LIMIT 1
  `);
  return row ? JSON.parse(row.catalog_json) : null;
}

async function getPilotActivity() {
  const { rows: [row] } = await getPool().query(`
    SELECT
      COUNT(DISTINCT CASE WHEN recorded_at >= NOW() - INTERVAL '1 day'
        THEN COALESCE(steam_id, pilot_guid, nick) END) AS last_24h,
      COUNT(DISTINCT CASE WHEN recorded_at >= NOW() - INTERVAL '7 days'
        THEN COALESCE(steam_id, pilot_guid, nick) END) AS last_7d,
      COUNT(DISTINCT CASE WHEN recorded_at >= NOW() - INTERVAL '1 month'
        THEN COALESCE(steam_id, pilot_guid, nick) END) AS last_30d
    FROM laps
    WHERE nick IN (SELECT nickname FROM site_users WHERE nick_verified = TRUE AND nickname IS NOT NULL)
  `);
  return row;
}

/**
 * All-time lap totals for a list of nicks.
 * Returns { nick → { total_laps, best_lap_ms, races_entered } }
 */
async function getAllTimeStatsByNick(nicks) {
  if (!nicks || nicks.length === 0) return {};
  const placeholders = nicks.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await getPool().query(`
    SELECT
      nick,
      COUNT(*)               AS total_laps,
      MIN(lap_ms)            AS best_lap_ms,
      COUNT(DISTINCT race_id) AS races_entered
    FROM laps
    WHERE nick IN (${placeholders})
      AND nick IN (SELECT nickname FROM site_users WHERE nick_verified = TRUE AND nickname IS NOT NULL)
    GROUP BY nick
  `, nicks);
  const map = {};
  for (const r of rows) map[r.nick] = r;
  return map;
}

/**
 * Browse laps with optional filters. Returns { laps, total }.
 */
async function browseLaps({ env, track, nick, dateFrom, dateTo, limit = 50, offset = 0 } = {}) {
  const pool = getPool();
  const conditions = [
    'l.nick IN (SELECT nickname FROM site_users WHERE nick_verified = TRUE AND nickname IS NOT NULL)',
  ];
  const params = [];
  let n = 1;

  if (env) { conditions.push(`r.env = $${n++}`); params.push(env); }
  if (track) { conditions.push(`r.track = $${n++}`); params.push(track); }
  if (nick) { conditions.push(`l.nick LIKE $${n++}`); params.push(`%${nick}%`); }
  if (dateFrom) { conditions.push(`l.recorded_at >= $${n++}`); params.push(dateFrom); }
  if (dateTo) { conditions.push(`l.recorded_at <= $${n++}`); params.push(dateTo); }

  const where = 'WHERE ' + conditions.join(' AND ');

  const { rows: [{ cnt }] } = await pool.query(`
    SELECT COUNT(*) AS cnt
    FROM laps l
    JOIN races r ON l.race_id = r.id
    ${where}
  `, params);

  const { rows: laps } = await pool.query(`
    SELECT
      l.id, l.nick, l.lap_number, l.lap_ms, l.recorded_at, l.race_id,
      r.env, r.track
    FROM laps l
    JOIN races r ON l.race_id = r.id
    ${where}
    ORDER BY l.recorded_at DESC
    LIMIT $${n++} OFFSET $${n++}
  `, [...params, limit, offset]);

  return { laps, total: parseInt(cnt, 10) };
}

/**
 * Distinct filter values for the data browser.
 */
async function getFilterOptions() {
  const pool = getPool();
  const { rows: envRows } = await pool.query(`
    SELECT DISTINCT env FROM races WHERE env IS NOT NULL ORDER BY env
  `);
  const envs = envRows.map(r => r.env);
  const { rows: tracks } = await pool.query(`
    SELECT DISTINCT env, track FROM races
    WHERE env IS NOT NULL AND track IS NOT NULL
    ORDER BY env, track
  `);
  const { rows: pilots } = await pool.query(`
    SELECT nick, COUNT(*) AS total_laps
    FROM laps
    WHERE nick IN (SELECT nickname FROM site_users WHERE nick_verified = TRUE AND nickname IS NOT NULL)
    GROUP BY nick
    ORDER BY total_laps DESC
  `);
  return { envs, tracks, pilots };
}

/**
 * Summary stats for the stats page header.
 */
async function getOverallStats() {
  const { rows: [row] } = await getPool().query(`
    SELECT
      COUNT(*)                AS total_laps,
      COUNT(DISTINCT nick)   AS total_pilots,
      COUNT(DISTINCT race_id) AS total_races
    FROM laps
    WHERE nick IN (SELECT nickname FROM site_users WHERE nick_verified = TRUE AND nickname IS NOT NULL)
  `);
  return row;
}

async function getRecentTracks(limit = 10) {
  const { rows } = await getPool().query(`
    SELECT env, track, MAX(started_at) AS last_played
    FROM races
    WHERE env IS NOT NULL AND track IS NOT NULL AND env != '' AND track != ''
    GROUP BY env, track
    ORDER BY last_played DESC
    LIMIT $1
  `, [limit]);
  return rows;
}

async function isKnownPilot(nick) {
  const { rows: [{ exists }] } = await getPool().query(
    `SELECT EXISTS(SELECT 1 FROM laps WHERE LOWER(nick) = LOWER($1)) AS exists`,
    [nick]
  );
  return exists;
}

/**
 * Get laps from ALL active races since a given timestamp.
 * Used by the live page to merge laps from multiple bot lobbies.
 */
async function getActiveRacesLaps(since) {
  if (!since) return [];
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT l.actor, l.nick, l.lap_number, l.lap_ms, l.recorded_at, r.id AS race_id, r.room_id
    FROM laps l
    JOIN races r ON r.id = l.race_id
    WHERE r.started_at >= $1
      AND l.nick IN (SELECT nickname FROM site_users WHERE nick_verified = TRUE AND nickname IS NOT NULL)
    ORDER BY l.recorded_at ASC
  `, [since]);
  return rows;
}

module.exports = {
  getRaces,
  getRaceById,
  getBestLaps,
  getLatestRaceWithLaps,
  getActiveRacesLaps,
  getBestLapsByTrack,
  getPlayerStats,
  getLatestCatalog,
  getPilotActivity,
  getAllTimeStatsByNick,
  browseLaps,
  getFilterOptions,
  getOverallStats,
  getRecentTracks,
  isKnownPilot,
};
