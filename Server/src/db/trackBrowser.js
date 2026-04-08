const { getPool } = require('./connection');

const VALID_SORTS = ['name', 'plays', 'last_played', 'steam_score'];

async function getBrowseTracks({ search, sort = 'name', limit = 50, offset = 0 } = {}) {
  const pool = getPool();
  const safeSort = VALID_SORTS.includes(sort) ? sort : 'name';

  const orderBy = {
    name: 't.track ASC, t.env ASC',
    plays: 'race_count DESC NULLS LAST, t.track ASC',
    last_played: 'last_played DESC NULLS LAST, t.track ASC',
    steam_score: 't.steam_score DESC NULLS LAST, t.track ASC',
  }[safeSort];

  const params = [];
  let whereClause = '';
  if (search) {
    params.push(`%${search}%`);
    whereClause = `WHERE (t.track ILIKE $1 OR t.steam_title ILIKE $1)`;
  }

  const dataParams = [...params, limit, offset];
  const limitParam = params.length + 1;
  const offsetParam = params.length + 2;

  const { rows } = await pool.query(`
    SELECT
      t.id, t.env, t.track, t.local_id, t.steam_id,
      t.steam_title, t.steam_author_name, t.steam_preview_url,
      t.steam_score, t.steam_subscriptions, t.steam_tags,
      t.steam_fetched_at,
      ts.skip_count, ts.extend_count,
      COALESCE(rc.race_count, 0)::int AS race_count,
      rc.last_played,
      COALESCE(lc.total_laps, 0)::int AS total_laps
    FROM tracks t
    LEFT JOIN track_stats ts ON ts.track_id = t.id
    LEFT JOIN (
      SELECT env, track, COUNT(*) AS race_count, MAX(started_at) AS last_played
      FROM races
      GROUP BY env, track
    ) rc ON rc.env = t.env AND rc.track = t.track
    LEFT JOIN (
      SELECT r.env, r.track, COUNT(*) AS total_laps
      FROM laps l
      JOIN races r ON l.race_id = r.id
      WHERE l.nick IN (SELECT nickname FROM site_users WHERE nick_verified = TRUE AND nickname IS NOT NULL)
      GROUP BY r.env, r.track
    ) lc ON lc.env = t.env AND lc.track = t.track
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `, dataParams);

  const countParams = [...params];
  const { rows: [{ total }] } = await pool.query(`
    SELECT COUNT(*)::int AS total
    FROM tracks t
    ${whereClause}
  `, countParams);

  return { tracks: rows, total };
}

async function getTrackDetailByEnvTrack(env, track) {
  const pool = getPool();

  const { rows: [row] } = await pool.query(`
    SELECT
      t.*,
      ts.skip_count, ts.extend_count,
      COALESCE(rc.race_count, 0)::int AS race_count,
      rc.last_played,
      COALESCE(lc.total_laps, 0)::int AS total_laps,
      COALESCE(bl.best_lap_ms, NULL) AS overall_best_lap_ms,
      bl.best_lap_nick,
      COALESCE(
        json_agg(json_build_object('id', tg.id, 'name', tg.name))
          FILTER (WHERE tg.id IS NOT NULL),
        '[]'
      ) AS admin_tags,
      COALESCE(ut.user_tag_count, 0)::int AS user_tag_count
    FROM tracks t
    LEFT JOIN track_stats ts ON ts.track_id = t.id
    LEFT JOIN (
      SELECT env, track, COUNT(*) AS race_count, MAX(started_at) AS last_played
      FROM races
      GROUP BY env, track
    ) rc ON rc.env = t.env AND rc.track = t.track
    LEFT JOIN (
      SELECT r.env, r.track, COUNT(*) AS total_laps
      FROM laps l
      JOIN races r ON l.race_id = r.id
      WHERE l.nick IN (SELECT nickname FROM site_users WHERE nick_verified = TRUE AND nickname IS NOT NULL)
      GROUP BY r.env, r.track
    ) lc ON lc.env = t.env AND lc.track = t.track
    LEFT JOIN (
      SELECT
        r.env, r.track,
        MIN(l.lap_ms) AS best_lap_ms,
        (ARRAY_AGG(l.nick ORDER BY l.lap_ms ASC))[1] AS best_lap_nick
      FROM laps l
      JOIN races r ON l.race_id = r.id
      WHERE l.nick IN (SELECT nickname FROM site_users WHERE nick_verified = TRUE AND nickname IS NOT NULL)
      GROUP BY r.env, r.track
    ) bl ON bl.env = t.env AND bl.track = t.track
    LEFT JOIN track_tags tt ON tt.track_id = t.id
    LEFT JOIN tags tg ON tg.id = tt.tag_id
    LEFT JOIN (
      SELECT track_id, COUNT(DISTINCT label) AS user_tag_count
      FROM track_user_tags
      GROUP BY track_id
    ) ut ON ut.track_id = t.id
    WHERE t.env = $1 AND t.track = $2
    GROUP BY t.id, ts.skip_count, ts.extend_count,
             rc.race_count, rc.last_played, lc.total_laps,
             bl.best_lap_ms, bl.best_lap_nick, ut.user_tag_count
  `, [env, track]);

  return row || null;
}

async function getTrackComments(trackId, { limit = 50, offset = 0 } = {}) {
  const { rows } = await getPool().query(`
    SELECT id, author_name, is_known_pilot, body, created_at
    FROM track_comments
    WHERE track_id = $1 AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `, [trackId, limit, offset]);

  const { rows: [{ total }] } = await getPool().query(`
    SELECT COUNT(*)::int AS total
    FROM track_comments
    WHERE track_id = $1 AND deleted_at IS NULL
  `, [trackId]);

  return { comments: rows, total };
}

async function isKnownPilotName(name) {
  const { rows: [row] } = await getPool().query(`
    SELECT EXISTS(
      SELECT 1 FROM laps WHERE LOWER(nick) = LOWER($1) LIMIT 1
    ) AS exists
  `, [name]);
  return row.exists;
}

async function addTrackComment(trackId, { authorName, isKnownPilot, body, ipHash }) {
  const { rows: [row] } = await getPool().query(`
    INSERT INTO track_comments (track_id, author_name, is_known_pilot, body, ip_hash)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, author_name, is_known_pilot, body, created_at
  `, [trackId, authorName, isKnownPilot, body, ipHash]);
  return row;
}

async function deleteTrackComment(commentId) {
  await getPool().query(`
    UPDATE track_comments SET deleted_at = NOW() WHERE id = $1
  `, [commentId]);
}

async function getRecentCommentCount(ipHash, windowMs) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { rows: [row] } = await getPool().query(`
    SELECT COUNT(*)::int AS count
    FROM track_comments
    WHERE ip_hash = $1 AND created_at >= $2
  `, [ipHash, since]);
  return row.count;
}

async function getTrackUserTags(trackId) {
  const { rows } = await getPool().query(`
    SELECT label::text, COUNT(*)::int AS votes
    FROM track_user_tags
    WHERE track_id = $1
    GROUP BY label
    ORDER BY votes DESC, label ASC
  `, [trackId]);
  return rows;
}

async function addOrVoteUserTag(trackId, label, ipHash) {
  const { rowCount } = await getPool().query(`
    INSERT INTO track_user_tags (track_id, label, ip_hash)
    VALUES ($1, $2, $3)
    ON CONFLICT (track_id, label, ip_hash) DO NOTHING
  `, [trackId, label.trim().toLowerCase(), ipHash]);

  const { rows: [row] } = await getPool().query(`
    SELECT label::text, COUNT(*)::int AS votes
    FROM track_user_tags
    WHERE track_id = $1 AND label = $2
    GROUP BY label
  `, [trackId, label.trim().toLowerCase()]);

  return { label: row ? row.label : label.trim().toLowerCase(), votes: row ? row.votes : 0, voted: rowCount > 0 };
}

async function getRecentTagCount(ipHash, windowMs) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { rows: [row] } = await getPool().query(`
    SELECT COUNT(*)::int AS count
    FROM track_user_tags
    WHERE ip_hash = $1 AND created_at >= $2
  `, [ipHash, since]);
  return row.count;
}

async function incrementSkipCount(env, track) {
  const pool = getPool();
  const { rows: [t] } = await pool.query(
    'SELECT id FROM tracks WHERE env = $1 AND track = $2',
    [env, track]
  );
  if (!t) return;
  await pool.query(`
    INSERT INTO track_stats (track_id, skip_count, updated_at)
    VALUES ($1, 1, NOW())
    ON CONFLICT (track_id) DO UPDATE
      SET skip_count = track_stats.skip_count + 1, updated_at = NOW()
  `, [t.id]);
}

async function incrementExtendCount(env, track) {
  const pool = getPool();
  const { rows: [t] } = await pool.query(
    'SELECT id FROM tracks WHERE env = $1 AND track = $2',
    [env, track]
  );
  if (!t) return;
  await pool.query(`
    INSERT INTO track_stats (track_id, extend_count, updated_at)
    VALUES ($1, 1, NOW())
    ON CONFLICT (track_id) DO UPDATE
      SET extend_count = track_stats.extend_count + 1, updated_at = NOW()
  `, [t.id]);
}

// ── Admin-facing functions ───────────────────────────────────────────────────

const ADMIN_SORTS = ['name', 'plays', 'last_played', 'steam_score'];

async function getAdminTrackList({ search = '', env = '', sort = 'name', limit = 50, offset = 0 } = {}) {
  const pool = getPool();
  const conditions = [];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(t.track ILIKE $${params.length} OR t.steam_title ILIKE $${params.length})`);
  }
  if (env) {
    params.push(env);
    conditions.push(`t.env = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeSort = ADMIN_SORTS.includes(sort) ? sort : 'name';
  const orderBy = {
    name: 't.track ASC, t.env ASC',
    plays: 'race_count DESC NULLS LAST, t.track ASC',
    last_played: 'last_played DESC NULLS LAST, t.track ASC',
    steam_score: 't.steam_score DESC NULLS LAST, t.track ASC',
  }[safeSort];

  const lp = params.length + 1;
  const op = params.length + 2;

  const { rows } = await pool.query(`
    SELECT
      t.id, t.env, t.track, t.steam_id, t.steam_title,
      t.steam_author_name, t.steam_preview_url, t.steam_score,
      t.steam_fetched_at, t.duration_ms,
      COALESCE(rc.race_count, 0)::int  AS race_count,
      rc.last_played,
      COALESCE(plc.playlist_count, 0)::int AS playlist_count,
      COALESCE(cc.comment_count, 0)::int   AS comment_count,
      COALESCE(utc.user_tag_count, 0)::int AS user_tag_count,
      COALESCE(tc.tag_count, 0)::int       AS tag_count
    FROM tracks t
    LEFT JOIN (
      SELECT env, track, COUNT(*)::int AS race_count, MAX(started_at) AS last_played
      FROM races GROUP BY env, track
    ) rc ON rc.env = t.env AND rc.track = t.track
    LEFT JOIN (
      SELECT env, track, COUNT(DISTINCT playlist_id)::int AS playlist_count
      FROM playlist_tracks WHERE env IS NOT NULL AND env <> ''
      GROUP BY env, track
    ) plc ON plc.env = t.env AND plc.track = t.track
    LEFT JOIN (
      SELECT track_id, COUNT(*)::int AS comment_count
      FROM track_comments WHERE deleted_at IS NULL GROUP BY track_id
    ) cc ON cc.track_id = t.id
    LEFT JOIN (
      SELECT track_id, COUNT(DISTINCT label)::int AS user_tag_count
      FROM track_user_tags GROUP BY track_id
    ) utc ON utc.track_id = t.id
    LEFT JOIN (
      SELECT track_id, COUNT(*)::int AS tag_count
      FROM track_tags GROUP BY track_id
    ) tc ON tc.track_id = t.id
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $${lp} OFFSET $${op}
  `, [...params, limit, offset]);

  const { rows: [{ total }] } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM tracks t ${whereClause}`,
    params
  );

  return { tracks: rows, total };
}

async function getTrackPlaylistMemberships(trackId) {
  const pool = getPool();
  const { rows: [track] } = await pool.query(
    'SELECT env, track FROM tracks WHERE id = $1',
    [trackId]
  );
  if (!track) return [];
  const { rows } = await pool.query(`
    SELECT pt.id AS playlist_track_id, pt.playlist_id, p.name AS playlist_name,
           pt.position, pt.race
    FROM playlist_tracks pt
    JOIN playlists p ON p.id = pt.playlist_id
    WHERE pt.env = $1 AND pt.track = $2
    ORDER BY p.name ASC
  `, [track.env, track.track]);
  return rows;
}

async function getAdminTrackComments(trackId) {
  const { rows } = await getPool().query(`
    SELECT id, author_name, is_known_pilot, body, created_at, deleted_at
    FROM track_comments
    WHERE track_id = $1
    ORDER BY created_at DESC
  `, [trackId]);
  return rows;
}

async function deleteUserTagLabel(trackId, label) {
  await getPool().query(
    'DELETE FROM track_user_tags WHERE track_id = $1 AND label = $2',
    [trackId, label.toLowerCase()]
  );
}

module.exports = {
  getBrowseTracks,
  getTrackDetailByEnvTrack,
  getTrackComments,
  isKnownPilotName,
  addTrackComment,
  deleteTrackComment,
  getRecentCommentCount,
  getTrackUserTags,
  addOrVoteUserTag,
  getRecentTagCount,
  incrementSkipCount,
  incrementExtendCount,
  getAdminTrackList,
  getTrackPlaylistMemberships,
  getAdminTrackComments,
  deleteUserTagLabel,
};
