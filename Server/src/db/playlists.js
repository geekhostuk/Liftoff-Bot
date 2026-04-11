const { getPool } = require('./connection');

async function getPlaylists() {
  const { rows } = await getPool().query(`
    SELECT p.*, COUNT(pt.id)::int AS track_count
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
    GROUP BY p.id
    ORDER BY p.id
  `);
  return rows;
}

async function getPlaylistById(id) {
  const { rows: [row] } = await getPool().query('SELECT * FROM playlists WHERE id = $1', [id]);
  return row || null;
}

async function createPlaylist(name) {
  const { rows: [row] } = await getPool().query(`
    INSERT INTO playlists (name, created_at) VALUES ($1, NOW())
    RETURNING *
  `, [name]);
  return row;
}

async function renamePlaylist(id, name) {
  const { rows: [row] } = await getPool().query(`
    UPDATE playlists SET name = $1 WHERE id = $2
    RETURNING *
  `, [name, id]);
  return row;
}

async function deletePlaylist(id) {
  const pool = getPool();
  await pool.query('DELETE FROM playlist_tracks WHERE playlist_id = $1', [id]);
  await pool.query('DELETE FROM playlists WHERE id = $1', [id]);
}

async function getPlaylistTracks(playlistId) {
  const { rows } = await getPool().query(
    'SELECT * FROM playlist_tracks WHERE playlist_id = $1 ORDER BY position', [playlistId]
  );
  return rows;
}

async function addPlaylistTrack(playlistId, { env = '', track = '', race = '', workshop_id = '' }) {
  const pool = getPool();
  const { rows: [{ m }] } = await pool.query(
    'SELECT COALESCE(MAX(position), -1) AS m FROM playlist_tracks WHERE playlist_id = $1', [playlistId]
  );
  const { rows: [row] } = await pool.query(`
    INSERT INTO playlist_tracks (playlist_id, position, env, track, race, workshop_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [playlistId, parseInt(m, 10) + 1, env, track, race, workshop_id]);
  return row;
}

async function removePlaylistTrack(trackId) {
  const pool = getPool();
  const { rows: [row] } = await pool.query('SELECT * FROM playlist_tracks WHERE id = $1', [trackId]);
  if (!row) return;
  await pool.query('DELETE FROM playlist_tracks WHERE id = $1', [trackId]);
  const { rows: tracks } = await pool.query(
    'SELECT id FROM playlist_tracks WHERE playlist_id = $1 ORDER BY position', [row.playlist_id]
  );
  for (let i = 0; i < tracks.length; i++) {
    await pool.query('UPDATE playlist_tracks SET position = $1 WHERE id = $2', [i, tracks[i].id]);
  }
}

async function movePlaylistTrack(trackId, direction) {
  const pool = getPool();
  const { rows: [row] } = await pool.query('SELECT * FROM playlist_tracks WHERE id = $1', [trackId]);
  if (!row) return;
  const { rows: tracks } = await pool.query(
    'SELECT * FROM playlist_tracks WHERE playlist_id = $1 ORDER BY position', [row.playlist_id]
  );
  const idx = tracks.findIndex(t => t.id === trackId);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= tracks.length) return;
  const a = tracks[idx], b = tracks[swapIdx];
  await pool.query('UPDATE playlist_tracks SET position = $1 WHERE id = $2', [b.position, a.id]);
  await pool.query('UPDATE playlist_tracks SET position = $1 WHERE id = $2', [a.position, b.id]);
}

async function getPlaylistTrackWorkshopIds(playlistId) {
  const { rows } = await getPool().query(`
    SELECT t.steam_id, t.dependency
    FROM playlist_tracks pt
    JOIN tracks t ON t.env = pt.env AND t.track = pt.track
    WHERE pt.playlist_id = $1
    ORDER BY pt.position
  `, [playlistId]);
  return rows;
}

module.exports = {
  getPlaylists,
  getPlaylistById,
  createPlaylist,
  renamePlaylist,
  deletePlaylist,
  getPlaylistTracks,
  getPlaylistTrackWorkshopIds,
  addPlaylistTrack,
  removePlaylistTrack,
  movePlaylistTrack,
};
