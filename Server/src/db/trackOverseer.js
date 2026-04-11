const { getPool } = require('./connection');

const KV_PREFIX = 'overseer_';

function _kvPrefix(roomId) {
  if (!roomId || roomId === 'default') return KV_PREFIX;
  return `overseer_${roomId}_`;
}

// ── Overseer State Persistence (kv_store) ───────────────────────────────────

async function saveOverseerState(state, roomId = 'default') {
  const pool = getPool();
  const prefix = _kvPrefix(roomId);
  const keys = [
    `${prefix}mode`,
    `${prefix}playlist_id`,
    `${prefix}current_index`,
    `${prefix}interval_ms`,
    `${prefix}next_change_at`,
    `${prefix}tag_names`,
    `${prefix}default_interval_ms`,
    `${prefix}current_track`,
    `${prefix}skip_vote_enabled`,
    `${prefix}extend_vote_enabled`,
  ];
  const values = [
    state.mode || 'idle',
    state.playlistId != null ? String(state.playlistId) : '',
    String(state.currentIndex || 0),
    String(state.intervalMs || 900000),
    state.nextChangeAt ? state.nextChangeAt.toISOString() : '',
    JSON.stringify(state.tagNames || []),
    String(state.defaultIntervalMs || 600000),
    JSON.stringify(state.currentTrack || null),
    state.skipVoteEnabled !== false ? 'true' : 'false',
    state.extendVoteEnabled !== false ? 'true' : 'false',
  ];
  await pool.query(`
    INSERT INTO kv_store (key, value)
    SELECT * FROM unnest($1::text[], $2::text[])
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, [keys, values]);
}

async function loadOverseerState(roomId = 'default') {
  const pool = getPool();
  const prefix = _kvPrefix(roomId);
  const get = async (key) => {
    // Try room-scoped key first, fall back to legacy key for default room migration
    const { rows: [row] } = await pool.query('SELECT value FROM kv_store WHERE key = $1', [`${prefix}${key}`]);
    if (row) return row.value;
    // Fallback: legacy un-prefixed key (only for default room during migration)
    if (roomId === 'default' && prefix !== KV_PREFIX) {
      const { rows: [legacy] } = await pool.query('SELECT value FROM kv_store WHERE key = $1', [`${KV_PREFIX}${key}`]);
      return legacy ? legacy.value : null;
    }
    return null;
  };
  const mode = (await get('mode')) || 'idle';
  const playlistId = await get('playlist_id');
  let tagNames = [];
  try { tagNames = JSON.parse((await get('tag_names')) || '[]'); } catch {}
  return {
    mode,
    playlistId: playlistId ? Number(playlistId) : null,
    currentIndex: Number((await get('current_index')) || 0),
    intervalMs: Number((await get('interval_ms')) || 900000),
    nextChangeAt: (await get('next_change_at')) || null,
    tagNames,
    defaultIntervalMs: Number((await get('default_interval_ms')) || 600000),
    currentTrack: JSON.parse((await get('current_track')) || 'null'),
    skipVoteEnabled: (await get('skip_vote_enabled')) !== 'false',
    extendVoteEnabled: (await get('extend_vote_enabled')) !== 'false',
  };
}

async function clearOverseerState(roomId = 'default') {
  const prefix = _kvPrefix(roomId);
  await getPool().query(`DELETE FROM kv_store WHERE key LIKE $1`, [`${prefix}%`]);
}

// ── Track Queue ─────────────────────────────────────────────────────────────

async function getQueue(roomId = 'default') {
  const { rows } = await getPool().query(
    'SELECT * FROM track_queue WHERE room_id = $1 ORDER BY position', [roomId]
  );
  return rows;
}

async function addToQueue({ env = '', track = '', race = '', workshop_id = '' }, roomId = 'default') {
  const pool = getPool();
  const { rows: [{ m }] } = await pool.query(
    'SELECT COALESCE(MAX(position), -1) AS m FROM track_queue WHERE room_id = $1', [roomId]
  );
  const { rows: [row] } = await pool.query(`
    INSERT INTO track_queue (position, env, track, race, workshop_id, room_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [parseInt(m, 10) + 1, env, track, race, workshop_id, roomId]);
  return row;
}

async function removeFromQueue(id) {
  const pool = getPool();
  const { rows: [deleted] } = await pool.query('DELETE FROM track_queue WHERE id = $1 RETURNING room_id', [id]);
  const rId = deleted?.room_id || 'default';
  await pool.query(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY position) - 1 AS new_pos
      FROM track_queue WHERE room_id = $1
    )
    UPDATE track_queue SET position = ranked.new_pos
    FROM ranked WHERE track_queue.id = ranked.id
  `, [rId]);
}

async function reorderQueue(id, direction) {
  const pool = getPool();
  const { rows: [row] } = await pool.query('SELECT * FROM track_queue WHERE id = $1', [id]);
  if (!row) return;
  const { rows: items } = await pool.query(
    'SELECT * FROM track_queue WHERE room_id = $1 ORDER BY position', [row.room_id]
  );
  const idx = items.findIndex(r => r.id === id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return;
  const a = items[idx], b = items[swapIdx];
  await pool.query('UPDATE track_queue SET position = $1 WHERE id = $2', [b.position, a.id]);
  await pool.query('UPDATE track_queue SET position = $1 WHERE id = $2', [a.position, b.id]);
}

async function popQueue(roomId = 'default') {
  const pool = getPool();
  const { rows: [row] } = await pool.query(
    'SELECT * FROM track_queue WHERE room_id = $1 ORDER BY position LIMIT 1', [roomId]
  );
  if (!row) return null;
  await pool.query('DELETE FROM track_queue WHERE id = $1', [row.id]);
  await pool.query(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY position) - 1 AS new_pos
      FROM track_queue WHERE room_id = $1
    )
    UPDATE track_queue SET position = ranked.new_pos
    FROM ranked WHERE track_queue.id = ranked.id
  `, [roomId]);
  return row;
}

async function clearQueue(roomId = 'default') {
  await getPool().query('DELETE FROM track_queue WHERE room_id = $1', [roomId]);
}

// ── Playlist Queue ─────────────────────────────────────────────────────────

const PLAYLIST_QUEUE_SELECT = `
  SELECT pq.*, p.name AS playlist_name,
    (SELECT COUNT(*)::int FROM playlist_tracks pt WHERE pt.playlist_id = pq.playlist_id) AS track_count
  FROM playlist_queue pq
  JOIN playlists p ON p.id = pq.playlist_id
`;

async function getPlaylistQueue() {
  const { rows } = await getPool().query(`${PLAYLIST_QUEUE_SELECT} ORDER BY pq.position`);
  return rows;
}

async function addToPlaylistQueue({ playlist_id, interval_ms = 900000, shuffle = false, start_after = 'track' }) {
  const pool = getPool();
  const { rows: [{ m }] } = await pool.query(
    'SELECT COALESCE(MAX(position), -1) AS m FROM playlist_queue'
  );
  const { rows: [row] } = await pool.query(`
    INSERT INTO playlist_queue (position, playlist_id, interval_ms, shuffle, start_after)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [parseInt(m, 10) + 1, playlist_id, interval_ms, shuffle, start_after]);
  return row;
}

async function removeFromPlaylistQueue(id) {
  const pool = getPool();
  await pool.query('DELETE FROM playlist_queue WHERE id = $1', [id]);
  await pool.query(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY position) - 1 AS new_pos
      FROM playlist_queue
    )
    UPDATE playlist_queue SET position = ranked.new_pos
    FROM ranked WHERE playlist_queue.id = ranked.id
  `);
}

async function reorderPlaylistQueue(id, direction) {
  const pool = getPool();
  const { rows: [row] } = await pool.query('SELECT * FROM playlist_queue WHERE id = $1', [id]);
  if (!row) return;
  const { rows: items } = await pool.query('SELECT * FROM playlist_queue ORDER BY position');
  const idx = items.findIndex(r => r.id === id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return;
  const a = items[idx], b = items[swapIdx];
  await pool.query('UPDATE playlist_queue SET position = $1 WHERE id = $2', [b.position, a.id]);
  await pool.query('UPDATE playlist_queue SET position = $1 WHERE id = $2', [a.position, b.id]);
}

async function peekPlaylistQueue() {
  const { rows: [row] } = await getPool().query(`${PLAYLIST_QUEUE_SELECT} ORDER BY pq.position LIMIT 1`);
  return row || null;
}

async function popPlaylistQueue() {
  const pool = getPool();
  const { rows: [row] } = await pool.query(`${PLAYLIST_QUEUE_SELECT} ORDER BY pq.position LIMIT 1`);
  if (!row) return null;
  await pool.query('DELETE FROM playlist_queue WHERE id = $1', [row.id]);
  await pool.query(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY position) - 1 AS new_pos
      FROM playlist_queue
    )
    UPDATE playlist_queue SET position = ranked.new_pos
    FROM ranked WHERE playlist_queue.id = ranked.id
  `);
  return row;
}

async function clearPlaylistQueue() {
  await getPool().query('DELETE FROM playlist_queue');
}

// ── Track History ───────────────────────────────────────────────────────────

async function recordTrackStart(env, track, race, source = 'playlist', roomId = 'default') {
  const { rows: [row] } = await getPool().query(`
    INSERT INTO track_history (env, track, race, source, started_at, room_id)
    VALUES ($1, $2, $3, $4, NOW(), $5)
    RETURNING id
  `, [env, track, race, source, roomId]);
  return row.id;
}

async function recordTrackEnd(historyId, skipCount = 0, extendCount = 0) {
  if (!historyId) return;
  await getPool().query(`
    UPDATE track_history
    SET ended_at = NOW(), skip_count = $2, extend_count = $3
    WHERE id = $1
  `, [historyId, skipCount, extendCount]);
}

async function getTrackHistory(limit = 50, offset = 0) {
  const { rows } = await getPool().query(
    'SELECT * FROM track_history ORDER BY started_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return rows;
}

// ── Scoring Period (auto-create Mon-Sun weeks) ──────────────────────────────

async function getOrCreateCurrentWeek() {
  const pool = getPool();

  // Check for existing active week (any competition_id)
  const { rows: [existing] } = await pool.query(`
    SELECT cw.*, COALESCE(c.name, 'Auto Season') AS competition_name
    FROM competition_weeks cw
    LEFT JOIN competitions c ON c.id = cw.competition_id
    WHERE cw.status = 'active'
      AND NOW() >= cw.starts_at AND NOW() <= cw.ends_at
    ORDER BY cw.id DESC LIMIT 1
  `);
  if (existing) return existing;

  // Calculate current Mon-Sun boundaries in UTC
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun,1=Mon,...,6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 0);

  // Ensure a competition_id=0 "Auto Season" competition exists
  await pool.query(`
    INSERT INTO competitions (id, name, status, created_at)
    VALUES (0, 'Auto Season', 'active', NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Calculate week number (weeks since epoch Monday for consistency)
  const epochMonday = new Date('2024-01-01T00:00:00Z');
  const weekNum = Math.floor((monday - epochMonday) / (7 * 86400000)) + 1;

  // Create the week
  const { rows: [week] } = await pool.query(`
    INSERT INTO competition_weeks (competition_id, week_number, starts_at, ends_at, status)
    VALUES (0, $1, $2, $3, 'active')
    ON CONFLICT DO NOTHING
    RETURNING *
  `, [weekNum, monday.toISOString(), sunday.toISOString()]);

  if (week) {
    week.competition_name = 'Auto Season';
    return week;
  }

  // Race condition: someone else created it
  const { rows: [retry] } = await pool.query(`
    SELECT cw.*, 'Auto Season' AS competition_name
    FROM competition_weeks cw
    WHERE cw.competition_id = 0 AND cw.status = 'active'
      AND NOW() >= cw.starts_at AND NOW() <= cw.ends_at
    ORDER BY cw.id DESC LIMIT 1
  `);
  return retry || null;
}

async function finaliseExpiredWeeks() {
  const pool = getPool();
  await pool.query(`
    UPDATE competition_weeks
    SET status = 'finalised'
    WHERE status = 'active' AND ends_at < NOW()
  `);
}

module.exports = {
  // Overseer state
  saveOverseerState,
  loadOverseerState,
  clearOverseerState,
  // Track queue
  getQueue,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  popQueue,
  clearQueue,
  // Playlist queue
  getPlaylistQueue,
  addToPlaylistQueue,
  removeFromPlaylistQueue,
  reorderPlaylistQueue,
  peekPlaylistQueue,
  popPlaylistQueue,
  clearPlaylistQueue,
  // History
  recordTrackStart,
  recordTrackEnd,
  getTrackHistory,
  // Scoring periods
  getOrCreateCurrentWeek,
  finaliseExpiredWeeks,
};
