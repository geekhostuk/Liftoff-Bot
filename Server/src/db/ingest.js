const { getPool } = require('./connection');

// Lazy-loaded to avoid circular dependency (scoring → database → ingest → scoring)
let _processRaceClose = null;
function getProcessRaceClose() {
  if (!_processRaceClose) _processRaceClose = require('../competitionScoring').processRaceClose;
  return _processRaceClose;
}

// Lazy-loaded to avoid circular dependency (idleKick → db → ingest → idleKick)
let _idleKick = null;
function getIdleKick() {
  if (!_idleKick) _idleKick = require('../idleKick');
  return _idleKick;
}

async function handleSessionStarted(event) {
  await getPool().query(`
    INSERT INTO sessions (id, started_at, plugin_ver, bot_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO NOTHING
  `, [event.session_id, event.timestamp_utc, event.version || null, event.bot_id || 'default']);
}

async function handleRaceReset(event, currentTrack = {}) {
  const pool = getPool();
  const closedRaces = [];

  // Close any open races for this session and populate results from laps
  const { rows: openRaces } = await pool.query(`
    SELECT id FROM races
    WHERE session_id = $1 AND ended_at IS NULL AND id != $2
  `, [event.session_id, event.race_id]);

  for (const race of openRaces) {
    const { rows: [{ cnt }] } = await pool.query(`
      SELECT COUNT(DISTINCT actor) AS cnt FROM laps WHERE race_id = $1 AND registered = TRUE
    `, [race.id]);
    const participants = parseInt(cnt, 10) || 0;

    let winner = null;
    if (participants > 0) {
      const { rows: [w] } = await pool.query(`
        SELECT actor, nick, MIN(lap_ms) AS best_ms
        FROM laps WHERE race_id = $1 AND registered = TRUE
        GROUP BY actor, nick ORDER BY best_ms ASC LIMIT 1
      `, [race.id]);
      winner = w;
    }

    await pool.query(`
      UPDATE races
      SET ended_at        = $1,
          winner_actor    = COALESCE(winner_actor, $2),
          winner_nick     = COALESCE(winner_nick, $3),
          winner_total_ms = COALESCE(winner_total_ms, $4),
          participants    = CASE WHEN participants > 0 THEN participants ELSE $5 END,
          completed       = CASE WHEN completed > 0 THEN completed ELSE $6 END
      WHERE id = $7
    `, [
      event.timestamp_utc,
      winner?.actor ?? null,
      winner?.nick ?? null,
      winner?.best_ms ?? null,
      participants,
      participants,
      race.id,
    ]);

    closedRaces.push({
      race_id: race.id,
      winner_nick: winner?.nick ?? null,
      winner_total_ms: winner?.best_ms ?? null,
    });

    // Competition scoring — award points for this race if a competition week is active
    try { await getProcessRaceClose()(race.id); } catch (err) {
      console.error('[competition] Scoring error for race', race.id, err.message);
    }
  }

  await pool.query(`
    INSERT INTO races (id, session_id, ordinal, started_at, env, track)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO NOTHING
  `, [
    event.race_id,
    event.session_id,
    event.race_ordinal,
    event.timestamp_utc,
    currentTrack.env || null,
    currentTrack.track || null,
  ]);

  return closedRaces;
}

async function handleLapRecorded(event, currentTrack = {}) {
  const pool = getPool();
  await ensureRaceExists(event);
  if (currentTrack.env && currentTrack.track) {
    await pool.query(`
      UPDATE races SET env = $1, track = $2 WHERE id = $3 AND env IS NULL
    `, [currentTrack.env, currentTrack.track, event.race_id]);
  }
  const isRegistered = getIdleKick().isNickVerified(event.nick || '');
  await pool.query(`
    INSERT INTO laps (race_id, session_id, actor, nick, pilot_guid, steam_id, lap_number, lap_ms, recorded_at, registered)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [
    event.race_id,
    event.session_id,
    event.actor,
    event.nick || null,
    event.pilot_guid || null,
    event.steam_id || null,
    event.lap_number,
    event.lap_ms,
    event.timestamp_utc,
    isRegistered,
  ]);
}

async function handleRaceEnd(event) {
  const pool = getPool();
  await ensureRaceExists(event);

  // Determine winner by fastest lap time from registered pilots only
  const { rows: [fastestLap] } = await pool.query(`
    SELECT actor, nick, MIN(lap_ms) AS best_ms
    FROM laps WHERE race_id = $1 AND registered = TRUE
    GROUP BY actor, nick ORDER BY best_ms ASC LIMIT 1
  `, [event.race_id]);

  const winnerActor = fastestLap?.actor ?? event.winner_actor ?? null;
  const winnerNick  = fastestLap?.nick  ?? event.winner_nick  ?? null;
  const winnerMs    = fastestLap?.best_ms ?? event.winner_total_ms ?? null;

  // Derive participant count from registered laps only
  const { rows: [{ cnt: regCount }] } = await pool.query(`
    SELECT COUNT(DISTINCT actor) AS cnt FROM laps WHERE race_id = $1 AND registered = TRUE
  `, [event.race_id]);
  const registeredParticipants = parseInt(regCount, 10) || 0;

  await pool.query(`
    UPDATE races
    SET ended_at        = $1,
        winner_actor    = $2,
        winner_nick     = $3,
        winner_total_ms = $4,
        participants    = $5,
        completed       = $6
    WHERE id = $7
  `, [
    event.timestamp_utc,
    winnerActor,
    winnerNick,
    winnerMs,
    registeredParticipants,
    registeredParticipants,
    event.race_id,
  ]);

  // Competition scoring — race_end fires before race_reset, so this is the
  // reliable place to score a completed race. hasRaceResults() inside
  // processRaceClose prevents double-scoring if race_reset also triggers it.
  try { await getProcessRaceClose()(event.race_id); } catch (err) {
    console.error('[competition] Scoring error for race', event.race_id, err.message);
  }
}

async function handleTrackCatalog(event) {
  await getPool().query(`
    INSERT INTO track_catalog (session_id, recorded_at, catalog_json)
    VALUES ($1, $2, $3)
  `, [event.session_id, event.timestamp_utc, JSON.stringify(event)]);

  // Auto-populate the tracks table from catalog discovery
  if (event.environments && event.environments.length > 0) {
    const { upsertTracksFromCatalog } = require('./tags');
    try {
      await upsertTracksFromCatalog(event.environments);
    } catch (err) {
      console.error('[ingest] Failed to upsert tracks from catalog:', err.message);
    }
  }
}

async function ensureRaceExists(event) {
  const pool = getPool();
  await pool.query(`
    INSERT INTO sessions (id, started_at, plugin_ver, bot_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO NOTHING
  `, [event.session_id, event.timestamp_utc, event.version || null, event.bot_id || 'default']);

  await pool.query(`
    INSERT INTO races (id, session_id, ordinal, started_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO NOTHING
  `, [event.race_id, event.session_id, event.race_ordinal || 0, event.timestamp_utc]);
}

module.exports = {
  handleSessionStarted,
  handleRaceReset,
  handleLapRecorded,
  handleRaceEnd,
  handleTrackCatalog,
};
