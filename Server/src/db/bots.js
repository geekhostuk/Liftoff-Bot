const { getPool } = require('./connection');

async function getAllBots() {
  const { rows } = await getPool().query('SELECT id, api_key, label, bot_nick, created_at FROM bots ORDER BY created_at');
  return rows;
}

async function getBotByApiKey(apiKey) {
  const { rows } = await getPool().query('SELECT id, label, bot_nick FROM bots WHERE api_key = $1', [apiKey]);
  return rows[0] || null;
}

async function addBot(id, apiKey, label, botNick) {
  await getPool().query(
    'INSERT INTO bots (id, api_key, label, bot_nick) VALUES ($1, $2, $3, $4)',
    [id, apiKey, label || '', botNick || 'JMT_Bot'],
  );
}

async function removeBot(id) {
  const { rowCount } = await getPool().query('DELETE FROM bots WHERE id = $1', [id]);
  return rowCount > 0;
}

async function updateBot(id, fields) {
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, val] of Object.entries(fields)) {
    if (['label', 'bot_nick'].includes(key)) {
      sets.push(`${key} = $${i++}`);
      values.push(val);
    }
  }
  if (sets.length === 0) return false;
  values.push(id);
  const { rowCount } = await getPool().query(
    `UPDATE bots SET ${sets.join(', ')} WHERE id = $${i}`,
    values,
  );
  return rowCount > 0;
}

module.exports = { getAllBots, getBotByApiKey, addBot, removeBot, updateBot };
