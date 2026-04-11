const { getPool } = require('./connection');

// ── Tag CRUD ────────────────────────────────────────────────────────────────

async function getTags() {
  const { rows } = await getPool().query('SELECT * FROM tags ORDER BY name');
  return rows;
}

async function createTag(name) {
  const { rows: [row] } = await getPool().query(
    'INSERT INTO tags (name) VALUES ($1) RETURNING *',
    [name.trim()]
  );
  return row;
}

async function renameTag(id, name) {
  const { rows: [row] } = await getPool().query(
    'UPDATE tags SET name = $1 WHERE id = $2 RETURNING *',
    [name.trim(), id]
  );
  return row || null;
}

async function deleteTag(id) {
  await getPool().query('DELETE FROM tags WHERE id = $1', [id]);
}

// ── Track queries ───────────────────────────────────────────────────────────

async function getTracks() {
  const { rows } = await getPool().query(`
    SELECT t.*,
           COALESCE(json_agg(json_build_object('id', tg.id, 'name', tg.name))
                    FILTER (WHERE tg.id IS NOT NULL), '[]') AS tags
    FROM tracks t
    LEFT JOIN track_tags tt ON tt.track_id = t.id
    LEFT JOIN tags tg ON tg.id = tt.tag_id
    GROUP BY t.id
    ORDER BY t.env, t.track
  `);
  return rows;
}

async function getTrackById(id) {
  const { rows: [row] } = await getPool().query('SELECT * FROM tracks WHERE id = $1', [id]);
  return row || null;
}

async function getTrackByEnvTrack(env, track) {
  const { rows: [row] } = await getPool().query(
    'SELECT * FROM tracks WHERE env = $1 AND track = $2',
    [env, track]
  );
  return row || null;
}

async function upsertTrack(env, track, local_id = '', steam_id = '', dependency = '') {
  const { rows: [row] } = await getPool().query(`
    INSERT INTO tracks (env, track, local_id, steam_id, dependency)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (env, track) DO UPDATE SET
      local_id   = CASE WHEN tracks.local_id   = '' AND EXCLUDED.local_id   <> '' THEN EXCLUDED.local_id   ELSE tracks.local_id   END,
      steam_id   = CASE WHEN tracks.steam_id   = '' AND EXCLUDED.steam_id   <> '' THEN EXCLUDED.steam_id   ELSE tracks.steam_id   END,
      dependency = CASE WHEN tracks.dependency = '' AND EXCLUDED.dependency <> '' THEN EXCLUDED.dependency ELSE tracks.dependency END
    RETURNING *
  `, [env, track, local_id, steam_id, dependency]);
  return row;
}

async function upsertTracksFromCatalog(environments) {
  const pool = getPool();
  for (const envObj of environments) {
    // Catalog uses internal_name for the environment key
    const envName = envObj.internal_name || envObj.name || envObj.caption || '';
    if (!envName) continue;
    for (const t of envObj.tracks || []) {
      const trackName = t.name || '';
      if (!trackName) continue;
      await pool.query(`
        INSERT INTO tracks (env, track, local_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (env, track) DO UPDATE SET local_id = CASE
          WHEN tracks.local_id = '' AND EXCLUDED.local_id <> '' THEN EXCLUDED.local_id
          ELSE tracks.local_id
        END
      `, [envName, trackName, t.local_id || t.track_dependency || '']);
    }
  }
}

async function updateTrackLocalId(trackId, local_id) {
  const { rows: [row] } = await getPool().query(
    'UPDATE tracks SET local_id = $1 WHERE id = $2 RETURNING *',
    [local_id, trackId]
  );
  return row || null;
}

async function updateTrackSteamId(trackId, steam_id) {
  const { rows: [row] } = await getPool().query(
    'UPDATE tracks SET steam_id = $1 WHERE id = $2 RETURNING *',
    [steam_id, trackId]
  );
  return row || null;
}

async function updateTrackDuration(trackId, duration_ms) {
  const { rows: [row] } = await getPool().query(
    'UPDATE tracks SET duration_ms = $1 WHERE id = $2 RETURNING *',
    [duration_ms, trackId]
  );
  return row || null;
}

async function updateTrackSteamData(trackId, data) {
  const { rows: [row] } = await getPool().query(`
    UPDATE tracks SET
      steam_title        = $1,
      steam_author_id    = $2,
      steam_author_name  = $3,
      steam_preview_url  = $4,
      steam_description  = $5,
      steam_subscriptions = $6,
      steam_votes_up     = $7,
      steam_votes_down   = $8,
      steam_score        = $9,
      steam_tags         = $10,
      steam_time_created = $11,
      steam_time_updated = $12,
      steam_fetched_at   = NOW()
    WHERE id = $13
    RETURNING *
  `, [
    data.title,
    data.authorId,
    data.authorName ?? null,
    data.previewUrl,
    data.description,
    data.subscriptions,
    data.votesUp,
    data.votesDown,
    data.score,
    data.tags ?? [],
    data.timeCreated,
    data.timeUpdated,
    trackId,
  ]);
  return row || null;
}

// ── Track-tag assignment ────────────────────────────────────────────────────

async function getTagsForTrack(trackId) {
  const { rows } = await getPool().query(`
    SELECT tg.* FROM tags tg
    JOIN track_tags tt ON tt.tag_id = tg.id
    WHERE tt.track_id = $1
    ORDER BY tg.name
  `, [trackId]);
  return rows;
}

async function getTracksForTag(tagId) {
  const { rows } = await getPool().query(`
    SELECT t.* FROM tracks t
    JOIN track_tags tt ON tt.track_id = t.id
    WHERE tt.tag_id = $1
    ORDER BY t.env, t.track
  `, [tagId]);
  return rows;
}

async function getTracksByTagName(tagName) {
  const { rows } = await getPool().query(`
    SELECT t.* FROM tracks t
    JOIN track_tags tt ON tt.track_id = t.id
    JOIN tags tg ON tg.id = tt.tag_id
    WHERE tg.name = $1
    ORDER BY t.env, t.track
  `, [tagName]);
  return rows;
}

async function getTracksByTagNames(tagNames) {
  if (!tagNames || tagNames.length === 0) return [];
  const { rows } = await getPool().query(`
    SELECT DISTINCT t.* FROM tracks t
    JOIN track_tags tt ON tt.track_id = t.id
    JOIN tags tg ON tg.id = tt.tag_id
    WHERE tg.name = ANY($1)
    ORDER BY t.env, t.track
  `, [tagNames]);
  return rows;
}

async function addTagToTrack(trackId, tagId) {
  await getPool().query(
    'INSERT INTO track_tags (track_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [trackId, tagId]
  );
}

async function removeTagFromTrack(trackId, tagId) {
  await getPool().query(
    'DELETE FROM track_tags WHERE track_id = $1 AND tag_id = $2',
    [trackId, tagId]
  );
}

async function setTrackTags(trackId, tagIds) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM track_tags WHERE track_id = $1', [trackId]);
    for (const tagId of tagIds) {
      await client.query(
        'INSERT INTO track_tags (track_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [trackId, tagId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Random selection ────────────────────────────────────────────────────────

async function getRandomTrackByTags(tagNames, excludeRecent = [], catalogEnvTracks = null) {
  if (!tagNames || tagNames.length === 0) return null;

  let query = `
    SELECT DISTINCT t.* FROM tracks t
    JOIN track_tags tt ON tt.track_id = t.id
    JOIN tags tg ON tg.id = tt.tag_id
    WHERE tg.name = ANY($1)
  `;
  const params = [tagNames];
  let paramIdx = 2;

  // Exclude recently played tracks
  if (excludeRecent.length > 0) {
    const exclusions = excludeRecent.map((r, i) => {
      params.push(r.env, r.track);
      return `(t.env = $${paramIdx++} AND t.track = $${paramIdx++})`;
    });
    query += ` AND NOT (${exclusions.join(' OR ')})`;
  }

  // Filter to catalog-present tracks if provided
  if (catalogEnvTracks && catalogEnvTracks.length > 0) {
    const catalogPairs = catalogEnvTracks.map((c, i) => {
      params.push(c.env, c.track);
      return `(t.env = $${paramIdx++} AND t.track = $${paramIdx++})`;
    });
    query += ` AND (${catalogPairs.join(' OR ')})`;
  }

  query += ' ORDER BY RANDOM() LIMIT 1';

  const { rows: [row] } = await getPool().query(query, params);

  // If no results (all excluded), fall back to unrestricted random
  if (!row && excludeRecent.length > 0) {
    return getRandomTrackByTags(tagNames, [], catalogEnvTracks);
  }

  return row || null;
}

// ── KV helpers (for tag runner persistence) ─────────────────────────────────

async function getKvValue(key) {
  const { rows: [row] } = await getPool().query('SELECT value FROM kv_store WHERE key = $1', [key]);
  return row ? row.value : null;
}

async function setKvValue(key, value) {
  await getPool().query(
    'INSERT INTO kv_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [key, value]
  );
}

module.exports = {
  // KV store
  getKvValue,
  setKvValue,
  // Tag CRUD
  getTags,
  createTag,
  renameTag,
  deleteTag,
  // Track queries
  getTracks,
  getTrackById,
  getTrackByEnvTrack,
  upsertTrack,
  upsertTracksFromCatalog,
  updateTrackLocalId,
  updateTrackSteamId,
  updateTrackDuration,
  updateTrackSteamData,
  // Track-tag assignment
  getTagsForTrack,
  getTracksForTag,
  getTracksByTagName,
  getTracksByTagNames,
  addTagToTrack,
  removeTagFromTrack,
  setTrackTags,
  // Random selection
  getRandomTrackByTags,
};
