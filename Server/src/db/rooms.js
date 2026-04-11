const { getPool } = require('./connection');

async function getAllRooms() {
  const { rows } = await getPool().query(
    'SELECT id, label, scoring_mode, created_at FROM rooms ORDER BY created_at'
  );
  return rows;
}

async function getRoom(id) {
  const { rows } = await getPool().query(
    'SELECT id, label, scoring_mode, created_at FROM rooms WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function addRoom(id, label, scoringMode) {
  await getPool().query(
    'INSERT INTO rooms (id, label, scoring_mode) VALUES ($1, $2, $3)',
    [id, label || '', scoringMode || 'room']
  );
}

async function updateRoom(id, fields) {
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, val] of Object.entries(fields)) {
    if (['label', 'scoring_mode'].includes(key)) {
      sets.push(`${key} = $${i++}`);
      values.push(val);
    }
  }
  if (sets.length === 0) return false;
  values.push(id);
  const { rowCount } = await getPool().query(
    `UPDATE rooms SET ${sets.join(', ')} WHERE id = $${i}`,
    values
  );
  return rowCount > 0;
}

async function removeRoom(id) {
  if (id === 'default') throw new Error('Cannot delete the default room');
  // Check no bots assigned
  const { rows } = await getPool().query(
    'SELECT COUNT(*)::int AS count FROM bots WHERE room_id = $1', [id]
  );
  if (rows[0].count > 0) throw new Error('Room still has bots assigned — reassign them first');
  const { rowCount } = await getPool().query('DELETE FROM rooms WHERE id = $1', [id]);
  return rowCount > 0;
}

async function assignBotToRoom(botId, roomId) {
  const { rowCount } = await getPool().query(
    'UPDATE bots SET room_id = $1 WHERE id = $2',
    [roomId, botId]
  );
  return rowCount > 0;
}

async function getBotsForRoom(roomId) {
  const { rows } = await getPool().query(
    'SELECT id, api_key, label, bot_nick, room_id, created_at FROM bots WHERE room_id = $1 ORDER BY created_at',
    [roomId]
  );
  return rows;
}

async function getRoomForBot(botId) {
  const { rows } = await getPool().query(
    'SELECT room_id FROM bots WHERE id = $1', [botId]
  );
  return rows[0]?.room_id || 'default';
}

module.exports = {
  getAllRooms,
  getRoom,
  addRoom,
  updateRoom,
  removeRoom,
  assignBotToRoom,
  getBotsForRoom,
  getRoomForBot,
};
