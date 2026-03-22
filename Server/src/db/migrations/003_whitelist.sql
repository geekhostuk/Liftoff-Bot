-- Persistent idle-kick whitelist (replaces in-memory / env-var approach)

CREATE TABLE IF NOT EXISTS idle_kick_whitelist (
  id         SERIAL PRIMARY KEY,
  nick       CITEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
