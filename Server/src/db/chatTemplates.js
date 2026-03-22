const { getPool } = require('./connection');

async function getChatTemplates() {
  const { rows } = await getPool().query('SELECT * FROM chat_templates ORDER BY id');
  return rows;
}

async function getChatTemplatesByTrigger(trigger) {
  const { rows } = await getPool().query('SELECT * FROM chat_templates WHERE trigger = $1 AND enabled = 1', [trigger]);
  return rows;
}

async function createChatTemplate({ trigger, template, enabled = 1, delay_ms = 0 }) {
  const { rows: [row] } = await getPool().query(`
    INSERT INTO chat_templates (trigger, template, enabled, delay_ms)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [trigger, template, enabled ? 1 : 0, delay_ms || 0]);
  return row;
}

async function updateChatTemplate(id, { trigger, template, enabled, delay_ms }) {
  const { rows: [row] } = await getPool().query(`
    UPDATE chat_templates SET trigger = $1, template = $2, enabled = $3, delay_ms = $4 WHERE id = $5
    RETURNING *
  `, [trigger, template, enabled ? 1 : 0, delay_ms || 0, id]);
  return row;
}

async function deleteChatTemplate(id) {
  await getPool().query('DELETE FROM chat_templates WHERE id = $1', [id]);
}

module.exports = {
  getChatTemplates,
  getChatTemplatesByTrigger,
  createChatTemplate,
  updateChatTemplate,
  deleteChatTemplate,
};
