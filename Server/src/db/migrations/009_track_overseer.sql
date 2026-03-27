-- Track play history for stats and diagnostics
CREATE TABLE IF NOT EXISTS track_history (
  id           SERIAL PRIMARY KEY,
  env          TEXT NOT NULL DEFAULT '',
  track        TEXT NOT NULL DEFAULT '',
  race         TEXT NOT NULL DEFAULT '',
  source       TEXT NOT NULL DEFAULT 'playlist',  -- 'playlist', 'tag', 'queue', 'vote'
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,
  skip_count   INTEGER NOT NULL DEFAULT 0,
  extend_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_track_history_started ON track_history(started_at DESC);

-- Admin track queue (FIFO, persisted across reboots)
CREATE TABLE IF NOT EXISTS track_queue (
  id           SERIAL PRIMARY KEY,
  position     INTEGER NOT NULL,
  env          TEXT NOT NULL DEFAULT '',
  track        TEXT NOT NULL DEFAULT '',
  race         TEXT NOT NULL DEFAULT '',
  workshop_id  TEXT NOT NULL DEFAULT '',
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_track_queue_position ON track_queue(position);
