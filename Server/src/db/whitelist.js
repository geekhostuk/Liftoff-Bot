const { getPool } = require('./connection');

async function getWhitelist() {
  const { rows } = await getPool().query('SELECT nick FROM idle_kick_whitelist ORDER BY nick');
  return rows.map(r => r.nick);
}

async function addToWhitelist(nick) {
  const { rows: [row] } = await getPool().query(`
    INSERT INTO idle_kick_whitelist (nick)
    VALUES ($1)
    ON CONFLICT (nick) DO NOTHING
    RETURNING id, nick, created_at
  `, [nick]);
  return row;
}

async function removeFromWhitelist(nick) {
  await getPool().query('DELETE FROM idle_kick_whitelist WHERE nick = $1', [nick]);
}

module.exports = {
  getWhitelistDB: getWhitelist,
  addToWhitelistDB: addToWhitelist,
  removeFromWhitelistDB: removeFromWhitelist,
};
