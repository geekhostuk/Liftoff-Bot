const { getPool } = require('./connection');

async function createSiteUser(email, passwordHash, verifyToken, verifyExpires) {
  const { rows: [row] } = await getPool().query(`
    INSERT INTO site_users (email, password_hash, email_verify_token, email_verify_expires)
    VALUES ($1, $2, $3, $4)
    RETURNING id, email, created_at
  `, [email, passwordHash, verifyToken, verifyExpires]);
  return row;
}

async function getSiteUserByEmail(email) {
  const { rows: [row] } = await getPool().query('SELECT * FROM site_users WHERE email = $1', [email]);
  return row || undefined;
}

async function getSiteUserByNickname(nickname) {
  const { rows: [row] } = await getPool().query('SELECT * FROM site_users WHERE nickname = $1', [nickname]);
  return row || undefined;
}

async function verifyEmail(token) {
  const { rows: [row] } = await getPool().query(`
    UPDATE site_users
    SET email_verified = TRUE, email_verify_token = NULL, email_verify_expires = NULL,
        updated_at = NOW()
    WHERE email_verify_token = $1 AND email_verify_expires > NOW() AND email_verified = FALSE
    RETURNING id, email
  `, [token]);
  return row || undefined;
}

async function setNickname(userId, nickname) {
  const { rows: [row] } = await getPool().query(`
    UPDATE site_users
    SET nickname = $1, nick_verified = FALSE, nick_verify_code = NULL, nick_verify_expires = NULL,
        updated_at = NOW()
    WHERE id = $2
    RETURNING id, nickname
  `, [nickname, userId]);
  return row || undefined;
}

async function setNickVerifyCode(userId, code, expires) {
  await getPool().query(`
    UPDATE site_users
    SET nick_verify_code = $1, nick_verify_expires = $2,
        nickname = NULL, nick_verified = FALSE, updated_at = NOW()
    WHERE id = $3
  `, [code, expires, userId]);
}

async function verifyNicknameByCode(code, inGameNick) {
  try {
    const { rows: [row] } = await getPool().query(`
      UPDATE site_users
      SET nickname = $2, nick_verified = TRUE, nick_verify_code = NULL,
          nick_verify_expires = NULL, updated_at = NOW()
      WHERE nick_verify_code = $1 AND nick_verify_expires > NOW()
        AND nick_verified = FALSE
      RETURNING id, nickname
    `, [code, inGameNick]);
    if (!row) return undefined;
    return { ok: true, id: row.id, nickname: row.nickname };
  } catch (err) {
    if (err.code === '23505') return { error: 'nickname_taken' };
    throw err;
  }
}

async function getVerifiedNicknames() {
  const { rows } = await getPool().query(
    "SELECT nickname FROM site_users WHERE nick_verified = TRUE AND nickname IS NOT NULL"
  );
  return rows.map(r => r.nickname);
}

async function getSiteUsers(limit = 50, offset = 0, search = '') {
  const params = [limit, offset];
  let where = '';
  if (search) {
    where = 'WHERE email ILIKE $3 OR nickname ILIKE $3';
    params.push(`%${search}%`);
  }
  const { rows } = await getPool().query(`
    SELECT id, email, nickname, nick_verified, email_verified, created_at, updated_at
    FROM site_users ${where}
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
  `, params);

  const countParams = search ? [`%${search}%`] : [];
  const countWhere = search ? 'WHERE email ILIKE $1 OR nickname ILIKE $1' : '';
  const { rows: [{ count }] } = await getPool().query(
    `SELECT COUNT(*) AS count FROM site_users ${countWhere}`, countParams
  );

  return { rows, total: parseInt(count, 10) };
}

async function deleteSiteUser(id) {
  await getPool().query('DELETE FROM site_users WHERE id = $1', [id]);
}

async function manualVerifyEmail(id) {
  await getPool().query(`
    UPDATE site_users
    SET email_verified = TRUE, email_verify_token = NULL, email_verify_expires = NULL,
        updated_at = NOW()
    WHERE id = $1
  `, [id]);
}

async function adminSetNickname(id, nickname) {
  const { rows: [row] } = await getPool().query(`
    UPDATE site_users
    SET nickname = $1, nick_verified = FALSE, nick_verify_code = NULL, nick_verify_expires = NULL,
        updated_at = NOW()
    WHERE id = $2
    RETURNING id, nickname
  `, [nickname, id]);
  return row || undefined;
}

async function manualVerifyNickname(id) {
  await getPool().query(`
    UPDATE site_users
    SET nick_verified = TRUE, nick_verify_code = NULL, nick_verify_expires = NULL,
        updated_at = NOW()
    WHERE id = $1 AND nickname IS NOT NULL
  `, [id]);
}

async function setResetToken(userId, token, expires) {
  await getPool().query(
    'UPDATE site_users SET reset_token = $1, reset_expires = $2, updated_at = NOW() WHERE id = $3',
    [token, expires, userId]
  );
}

async function resetPassword(token, newPasswordHash) {
  const { rows: [row] } = await getPool().query(`
    UPDATE site_users
    SET password_hash = $1, reset_token = NULL, reset_expires = NULL, updated_at = NOW()
    WHERE reset_token = $2 AND reset_expires > NOW()
    RETURNING id, email
  `, [newPasswordHash, token]);
  return row || undefined;
}

async function updateSiteUserPassword(userId, newPasswordHash) {
  await getPool().query(
    'UPDATE site_users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [newPasswordHash, userId]
  );
}

module.exports = {
  createSiteUser,
  getSiteUserByEmail,
  getSiteUserByNickname,
  verifyEmail,
  setNickname,
  setNickVerifyCode,
  verifyNicknameByCode,
  getVerifiedNicknames,
  getSiteUsers,
  deleteSiteUser,
  manualVerifyEmail,
  adminSetNickname,
  manualVerifyNickname,
  setResetToken,
  resetPassword,
  updateSiteUserPassword,
};
