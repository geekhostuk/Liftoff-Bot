const { getPool } = require('./connection');

async function getRoles() {
  const { rows } = await getPool().query(`
    SELECT r.id, r.name, r.created_at,
           COALESCE(array_agg(p.module ORDER BY p.module) FILTER (WHERE p.module IS NOT NULL), '{}') AS permissions
    FROM custom_roles r
    LEFT JOIN custom_role_permissions p ON p.role_id = r.id
    GROUP BY r.id
    ORDER BY r.name
  `);
  return rows;
}

async function getRoleById(id) {
  const { rows: [role] } = await getPool().query('SELECT * FROM custom_roles WHERE id = $1', [id]);
  if (!role) return null;
  const { rows: perms } = await getPool().query(
    'SELECT module FROM custom_role_permissions WHERE role_id = $1 ORDER BY module', [id]
  );
  role.permissions = perms.map(r => r.module);
  return role;
}

async function createRole(name, modules = []) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [role] } = await client.query(
      'INSERT INTO custom_roles (name) VALUES ($1) RETURNING id, name, created_at', [name]
    );
    for (const mod of modules) {
      await client.query(
        'INSERT INTO custom_role_permissions (role_id, module) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [role.id, mod]
      );
    }
    await client.query('COMMIT');
    role.permissions = modules;
    return role;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateRole(id, name, modules = []) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE custom_roles SET name = $1 WHERE id = $2', [name, id]);
    await client.query('DELETE FROM custom_role_permissions WHERE role_id = $1', [id]);
    for (const mod of modules) {
      await client.query(
        'INSERT INTO custom_role_permissions (role_id, module) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, mod]
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

async function deleteRole(id) {
  await getPool().query('DELETE FROM custom_roles WHERE id = $1', [id]);
}

async function getSiteUserWithRole(email) {
  const { rows: [user] } = await getPool().query(`
    SELECT su.id, su.email, su.password_hash, su.nickname,
           su.email_verified, su.nick_verified, su.role_id,
           cr.name AS role_name,
           COALESCE(array_agg(crp.module ORDER BY crp.module) FILTER (WHERE crp.module IS NOT NULL), '{}') AS permissions
    FROM site_users su
    LEFT JOIN custom_roles cr ON cr.id = su.role_id
    LEFT JOIN custom_role_permissions crp ON crp.role_id = cr.id
    WHERE su.email = $1
    GROUP BY su.id, cr.name
  `, [email]);
  return user || null;
}

async function assignRoleToSiteUser(siteUserId, roleId) {
  await getPool().query('UPDATE site_users SET role_id = $1, updated_at = NOW() WHERE id = $2', [roleId, siteUserId]);
}

async function removeRoleFromSiteUser(siteUserId) {
  await getPool().query('UPDATE site_users SET role_id = NULL, updated_at = NOW() WHERE id = $1', [siteUserId]);
}

module.exports = {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  getSiteUserWithRole,
  assignRoleToSiteUser,
  removeRoleFromSiteUser,
};
