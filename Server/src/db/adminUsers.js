const { getPool } = require('./connection');

async function createUser(username, passwordHash) {
  const { rows: [row] } = await getPool().query(`
    INSERT INTO admin_users (username, password_hash)
    VALUES ($1, $2)
    RETURNING id, username, role, created_at
  `, [username, passwordHash]);
  return row;
}

async function getUserByUsername(username) {
  const { rows: [row] } = await getPool().query('SELECT * FROM admin_users WHERE username = $1', [username]);
  return row || undefined;
}

async function getUsers() {
  const { rows } = await getPool().query('SELECT id, username, role, created_at FROM admin_users ORDER BY id');
  return rows;
}

async function deleteUser(id) {
  await getPool().query('DELETE FROM admin_users WHERE id = $1', [id]);
}

async function getUserCount() {
  const { rows: [{ count }] } = await getPool().query('SELECT COUNT(*) AS count FROM admin_users');
  return parseInt(count, 10);
}

module.exports = {
  createUser,
  getUserByUsername,
  getUsers,
  deleteUser,
  getUserCount,
};
