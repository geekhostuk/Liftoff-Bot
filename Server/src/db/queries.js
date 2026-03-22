const { getDb } = require('./connection');

async function getRaces({ limit = 50, offset = 0 } = {}) {
  return getDb().prepare(`
    SELECT * FROM races
    ORDER BY started_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

async function getRaceById(id) {
  const db = getDb();
  const race = db.prepare('SELECT * FROM races WHERE id = ?').get(id);
  if (!race) return null;
  race.laps = db.prepare('SELECT * FROM laps WHERE race_id = ? ORDER BY lap_number').all(id);
  return race;
}

async function getBestLaps({ limit = 100 } = {}) {
  return getDb().prepare(`
    SELECT
      COALESCE(steam_id, pilot_guid, nick) AS pilot_key,
      nick,
      pilot_guid,
      steam_id,
      MIN(lap_ms)  AS best_lap_ms,
      COUNT(*)     AS total_laps
    FROM laps
    GROUP BY pilot_key
    ORDER BY best_lap_ms ASC
    LIMIT ?
  `).all(limit);
}

async function getLatestRaceWithLaps(since) {
  const db = getDb();
  const race = db.prepare(`
    SELECT r.* FROM races r
    LEFT JOIN laps l ON l.race_id = r.id
    GROUP BY r.id
    ORDER BY COALESCE(MAX(l.recorded_at), r.started_at) DESC, r.started_at DESC
    LIMIT 1
  `).get();
  if (!race) return null;
  if (since) {
    race.laps = db.prepare(`
      SELECT * FROM laps WHERE race_id = ? AND recorded_at >= ? ORDER BY recorded_at ASC
    `).all(race.id, since);
  } else {
    race.laps = db.prepare(`
      SELECT * FROM laps WHERE race_id = ? ORDER BY recorded_at ASC
    `).all(race.id);
  }
  return race;
}

async function getBestLapsByTrack(env, track, { limit = 100 } = {}) {
  return getDb().prepare(`
    SELECT
      COALESCE(l.steam_id, l.pilot_guid, l.nick) AS pilot_key,
      l.nick, l.pilot_guid, l.steam_id,
      MIN(l.lap_ms)  AS best_lap_ms,
      COUNT(*)       AS total_laps
    FROM laps l
    JOIN races r ON l.race_id = r.id
    WHERE r.env = ? AND r.track = ?
    GROUP BY pilot_key
    ORDER BY best_lap_ms ASC
    LIMIT ?
  `).all(env, track, limit);
}

async function getPlayerStats({ limit = 200 } = {}) {
  return getDb().prepare(`
    SELECT
      COALESCE(steam_id, pilot_guid, nick) AS pilot_key,
      nick, pilot_guid, steam_id,
      MIN(lap_ms)            AS best_lap_ms,
      COUNT(*)               AS total_laps,
      COUNT(DISTINCT race_id) AS races_entered
    FROM laps
    GROUP BY pilot_key
    ORDER BY total_laps DESC
    LIMIT ?
  `).all(limit);
}

async function getLatestCatalog() {
  const row = getDb().prepare(`
    SELECT catalog_json FROM track_catalog ORDER BY id DESC LIMIT 1
  `).get();
  return row ? JSON.parse(row.catalog_json) : null;
}

async function getPilotActivity() {
  return getDb().prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN datetime(recorded_at) >= datetime('now', '-1 day')
        THEN COALESCE(steam_id, pilot_guid, nick) END) AS last_24h,
      COUNT(DISTINCT CASE WHEN datetime(recorded_at) >= datetime('now', '-7 days')
        THEN COALESCE(steam_id, pilot_guid, nick) END) AS last_7d,
      COUNT(DISTINCT CASE WHEN datetime(recorded_at) >= datetime('now', '-1 month')
        THEN COALESCE(steam_id, pilot_guid, nick) END) AS last_30d
    FROM laps
  `).get();
}

/**
 * All-time lap totals for a list of nicks.
 * Returns { nick → { total_laps, best_lap_ms, races_entered } }
 */
async function getAllTimeStatsByNick(nicks) {
  if (!nicks || nicks.length === 0) return {};
  const db = getDb();
  const placeholders = nicks.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT
      nick,
      COUNT(*)               AS total_laps,
      MIN(lap_ms)            AS best_lap_ms,
      COUNT(DISTINCT race_id) AS races_entered
    FROM laps
    WHERE nick IN (${placeholders})
    GROUP BY nick
  `).all(...nicks);
  const map = {};
  for (const r of rows) map[r.nick] = r;
  return map;
}

/**
 * Browse laps with optional filters. Returns { laps, total }.
 */
async function browseLaps({ env, track, nick, dateFrom, dateTo, limit = 50, offset = 0 } = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (env) { conditions.push('r.env = ?'); params.push(env); }
  if (track) { conditions.push('r.track = ?'); params.push(track); }
  if (nick) { conditions.push('l.nick LIKE ?'); params.push(`%${nick}%`); }
  if (dateFrom) { conditions.push('l.recorded_at >= ?'); params.push(dateFrom); }
  if (dateTo) { conditions.push('l.recorded_at <= ?'); params.push(dateTo); }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const total = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM laps l
    JOIN races r ON l.race_id = r.id
    ${where}
  `).get(...params).cnt;

  const laps = db.prepare(`
    SELECT
      l.id, l.nick, l.lap_number, l.lap_ms, l.recorded_at, l.race_id,
      r.env, r.track
    FROM laps l
    JOIN races r ON l.race_id = r.id
    ${where}
    ORDER BY l.recorded_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return { laps, total };
}

/**
 * Distinct filter values for the data browser.
 */
async function getFilterOptions() {
  const db = getDb();
  const envs = db.prepare(`
    SELECT DISTINCT env FROM races WHERE env IS NOT NULL ORDER BY env
  `).all().map(r => r.env);
  const tracks = db.prepare(`
    SELECT DISTINCT env, track FROM races
    WHERE env IS NOT NULL AND track IS NOT NULL
    ORDER BY env, track
  `).all();
  const pilots = db.prepare(`
    SELECT nick, COUNT(*) AS total_laps
    FROM laps
    GROUP BY nick
    ORDER BY total_laps DESC
  `).all();
  return { envs, tracks, pilots };
}

/**
 * Summary stats for the stats page header.
 */
async function getOverallStats() {
  return getDb().prepare(`
    SELECT
      COUNT(*)                AS total_laps,
      COUNT(DISTINCT nick)   AS total_pilots,
      COUNT(DISTINCT race_id) AS total_races
    FROM laps
  `).get();
}

module.exports = {
  getRaces,
  getRaceById,
  getBestLaps,
  getLatestRaceWithLaps,
  getBestLapsByTrack,
  getPlayerStats,
  getLatestCatalog,
  getPilotActivity,
  getAllTimeStatsByNick,
  browseLaps,
  getFilterOptions,
  getOverallStats,
};
