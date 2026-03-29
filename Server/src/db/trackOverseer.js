const { getPool } = require('./connection');

const KV_PREFIX = 'overseer_';

// ── Overseer State Persistence (kv_store) ───────────────────────────────────

async function saveOverseerState(state) {
  const pool = getPool();
  const upsert = `INSERT INTO kv_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  await pool.query(upsert, [`${KV_PREFIX}mode`, state.mode || 'idle']);
  await pool.query(upsert, [`${KV_PREFIX}playlist_id`, state.playlistId != null ? String(state.playlistId) : '']);
  await pool.query(upsert, [`${KV_PREFIX}current_index`, String(state.currentIndex || 0)]);
  await pool.query(upsert, [`${KV_PREFIX}interval_ms`, String(state.intervalMs || 900000)]);
  await pool.query(upsert, [`${KV_PREFIX}next_change_at`, state.nextChangeAt ? state.nextChangeAt.toISOString() : '']);
  await pool.query(upsert, [`${KV_PREFIX}tag_names`, JSON.stringify(state.tagNames || [])]);
  await pool.query(upsert, [`${KV_PREFIX}default_interval_ms`, String(state.defaultIntervalMs || 600000)]);
  await pool.query(upsert, [`${KV_PREFIX}current_track`, JSON.stringify(state.currentTrack || null)]);
}

async function loadOverseerState() {
  const pool = getPool();
  const get = async (key) => {
    const { rows: [row] } = await pool.query('SELECT value FROM kv_store WHERE key = $1', [`${KV_PREFIX}${key}`]);
    return row ? row.value : null;
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
  };
}

async function clearOverseerState() {
  await getPool().query(`DELETE FROM kv_store WHERE key LIKE '${KV_PREFIX}%'`);
}

// ── Track Queue ─────────────────────────────────────────────────────────────

async function getQueue() {
  const { rows } = await getPool().query('SELECT * FROM track_queue ORDER BY position');
  return rows;
}

async function addToQueue({ env = '', track = '', race = '', workshop_id = '' }) {
  const pool = getPool();
  const { rows: [{ m }] } = await pool.query(
    'SELECT COALESCE(MAX(position), -1) AS m FROM track_queue'
  );
  const { rows: [row] } = await pool.query(`
    INSERT INTO track_queue (position, env, track, race, workshop_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [parseInt(m, 10) + 1, env, track, race, workshop_id]);
  return row;
}

async function removeFromQueue(id) {
  const pool = getPool();
  await pool.query('DELETE FROM track_queue WHERE id = $1', [id]);
  // Compact positions
  const { rows } = await pool.query('SELECT id FROM track_queue ORDER BY position');
  for (let i = 0; i < rows.length; i++) {
    await pool.query('UPDATE track_queue SET position = $1 WHERE id = $2', [i, rows[i].id]);
  }
}

async function reorderQueue(id, direction) {
  const pool = getPool();
  const { rows: [row] } = await pool.query('SELECT * FROM track_queue WHERE id = $1', [id]);
  if (!row) return;
  const { rows: items } = await pool.query('SELECT * FROM track_queue ORDER BY position');
  const idx = items.findIndex(r => r.id === id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return;
  const a = items[idx], b = items[swapIdx];
  await pool.query('UPDATE track_queue SET position = $1 WHERE id = $2', [b.position, a.id]);
  await pool.query('UPDATE track_queue SET position = $1 WHERE id = $2', [a.position, b.id]);
}

async function popQueue() {
  const pool = getPool();
  const { rows: [row] } = await pool.query(
    'SELECT * FROM track_queue ORDER BY position LIMIT 1'
  );
  if (!row) return null;
  await pool.query('DELETE FROM track_queue WHERE id = $1', [row.id]);
  // Compact positions
  const { rows } = await pool.query('SELECT id FROM track_queue ORDER BY position');
  for (let i = 0; i < rows.length; i++) {
    await pool.query('UPDATE track_queue SET position = $1 WHERE id = $2', [i, rows[i].id]);
  }
  return row;
}

async function clearQueue() {
  await getPool().query('DELETE FROM track_queue');
}

// ── Track History ───────────────────────────────────────────────────────────

async function recordTrackStart(env, track, race, source = 'playlist') {
  const { rows: [row] } = await getPool().query(`
    INSERT INTO track_history (env, track, race, source, started_at)
    VALUES ($1, $2, $3, $4, NOW())
    RETURNING id
  `, [env, track, race, source]);
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
  // Queue
  getQueue,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  popQueue,
  clearQueue,
  // History
  recordTrackStart,
  recordTrackEnd,
  getTrackHistory,
  // Scoring periods
  getOrCreateCurrentWeek,
  finaliseExpiredWeeks,
};
