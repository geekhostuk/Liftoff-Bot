-- Performance indexes for track change flow
CREATE INDEX IF NOT EXISTS idx_chat_templates_trigger
  ON chat_templates (trigger, enabled);
