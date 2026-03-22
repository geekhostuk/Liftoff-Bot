const { getDb } = require('./connection');

async function createUser(username, passwordHash) {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO admin_users (username, password_hash) VALUES (?, ?)'
  ).run(username, passwordHash);
  return db.prepare(
    'SELECT id, username, role, created_at FROM admin_users WHERE id = ?'
  ).get(result.lastInsertRowid);
}

async function getUserByUsername(username) {
  return getDb().prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
}

async function getUsers() {
  return getDb().prepare('SELECT id, username, role, created_at FROM admin_users ORDER BY id').all();
}

async function deleteUser(id) {
  getDb().prepare('DELETE FROM admin_users WHERE id = ?').run(id);
}

async function getUserCount() {
  return getDb().prepare('SELECT COUNT(*) AS count FROM admin_users').get().count;
}

module.exports = {
  createUser,
  getUserByUsername,
  getUsers,
  deleteUser,
  getUserCount,
};
