const { getDb } = require('./connection');

async function getChatTemplates() {
  return getDb().prepare('SELECT * FROM chat_templates ORDER BY id').all();
}

async function getChatTemplatesByTrigger(trigger) {
  return getDb().prepare('SELECT * FROM chat_templates WHERE trigger = ? AND enabled = 1').all(trigger);
}

async function createChatTemplate({ trigger, template, enabled = 1, delay_ms = 0 }) {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO chat_templates (trigger, template, enabled, delay_ms) VALUES (?, ?, ?, ?)'
  ).run(trigger, template, enabled ? 1 : 0, delay_ms || 0);
  return db.prepare('SELECT * FROM chat_templates WHERE id = ?').get(result.lastInsertRowid);
}

async function updateChatTemplate(id, { trigger, template, enabled, delay_ms }) {
  const db = getDb();
  db.prepare(`
    UPDATE chat_templates SET trigger = ?, template = ?, enabled = ?, delay_ms = ? WHERE id = ?
  `).run(trigger, template, enabled ? 1 : 0, delay_ms || 0, id);
  return db.prepare('SELECT * FROM chat_templates WHERE id = ?').get(id);
}

async function deleteChatTemplate(id) {
  getDb().prepare('DELETE FROM chat_templates WHERE id = ?').run(id);
}

module.exports = {
  getChatTemplates,
  getChatTemplatesByTrigger,
  createChatTemplate,
  updateChatTemplate,
  deleteChatTemplate,
};
