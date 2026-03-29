-- Playlist queue: ordered list of playlists to play after the current one
CREATE TABLE IF NOT EXISTS playlist_queue (
  id           SERIAL PRIMARY KEY,
  position     INTEGER NOT NULL,
  playlist_id  INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  interval_ms  INTEGER NOT NULL DEFAULT 900000,
  shuffle      BOOLEAN NOT NULL DEFAULT FALSE,
  start_after  TEXT NOT NULL DEFAULT 'track',
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_playlist_queue_position ON playlist_queue(position);
