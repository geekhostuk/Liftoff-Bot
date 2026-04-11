const { getPool } = require('./connection');

async function getChatTemplates() {
  const { rows } = await getPool().query('SELECT * FROM chat_templates ORDER BY id');
  return rows;
}

async function getChatTemplatesByTrigger(trigger) {
  const { rows } = await getPool().query('SELECT * FROM chat_templates WHERE trigger = $1 AND enabled = 1', [trigger]);
  return rows;
}

async function createChatTemplate({ trigger, template, enabled = 1, delay_ms = 0, interval_ms = null }) {
  const { rows: [row] } = await getPool().query(`
    INSERT INTO chat_templates (trigger, template, enabled, delay_ms, interval_ms)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [trigger, template, enabled ? 1 : 0, delay_ms || 0, interval_ms || null]);
  return row;
}

async function updateChatTemplate(id, { trigger, template, enabled, delay_ms, interval_ms }) {
  const { rows: [row] } = await getPool().query(`
    UPDATE chat_templates SET trigger = $1, template = $2, enabled = $3, delay_ms = $4, interval_ms = $5 WHERE id = $6
    RETURNING *
  `, [trigger, template, enabled ? 1 : 0, delay_ms || 0, interval_ms || null, id]);
  return row;
}

async function deleteChatTemplate(id) {
  await getPool().query('DELETE FROM chat_templates WHERE id = $1', [id]);
}

async function getIntervalTemplates() {
  const { rows } = await getPool().query(
    "SELECT * FROM chat_templates WHERE trigger = 'interval' AND enabled = 1 AND interval_ms > 0 ORDER BY id"
  );
  return rows;
}

module.exports = {
  getChatTemplates,
  getChatTemplatesByTrigger,
  createChatTemplate,
  updateChatTemplate,
  deleteChatTemplate,
  getIntervalTemplates,
};
