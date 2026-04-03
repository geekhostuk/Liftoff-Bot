-- Bot registry: maps API keys to bot identities
CREATE TABLE IF NOT EXISTS bots (
  id         TEXT PRIMARY KEY,
  api_key    TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL DEFAULT '',
  bot_nick   TEXT NOT NULL DEFAULT 'JMT_Bot',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add bot_id to sessions (nullable for backward compat with existing rows)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS bot_id TEXT DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_sessions_bot_id ON sessions(bot_id);
