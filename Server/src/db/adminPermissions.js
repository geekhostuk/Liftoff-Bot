const { getPool } = require('./connection');

async function getPermissions(adminUserId) {
  const { rows } = await getPool().query(
    'SELECT module FROM admin_permissions WHERE admin_user_id = $1 ORDER BY module',
    [adminUserId]
  );
  return rows.map(r => r.module);
}

async function setPermissions(adminUserId, modules) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM admin_permissions WHERE admin_user_id = $1', [adminUserId]);
    for (const mod of modules) {
      await client.query(
        'INSERT INTO admin_permissions (admin_user_id, module) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [adminUserId, mod]
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

async function hasPermission(adminUserId, module) {
  const { rows } = await getPool().query(
    'SELECT 1 FROM admin_permissions WHERE admin_user_id = $1 AND module = $2',
    [adminUserId, module]
  );
  return rows.length > 0;
}

async function getAllUsersWithPermissions() {
  const { rows } = await getPool().query(`
    SELECT a.id, a.username, a.role, a.created_at,
           COALESCE(array_agg(p.module ORDER BY p.module) FILTER (WHERE p.module IS NOT NULL), '{}') AS permissions
    FROM admin_users a
    LEFT JOIN admin_permissions p ON p.admin_user_id = a.id
    GROUP BY a.id
    ORDER BY a.id
  `);
  return rows;
}

module.exports = {
  getPermissions,
  setPermissions,
  hasPermission,
  getAllUsersWithPermissions,
};
