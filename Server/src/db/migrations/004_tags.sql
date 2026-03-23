-- Track tagging system: canonical tracks table, managed tags, and track-tag assignments

-- Canonical tracks table: assigns stable IDs to (env, track) pairs
-- Only populated from track_catalog events (plugin discovery)
CREATE TABLE IF NOT EXISTS tracks (
  id          SERIAL PRIMARY KEY,
  env         TEXT NOT NULL,
  track       TEXT NOT NULL,
  workshop_id TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(env, track)
);

-- Managed tag definitions
CREATE TABLE IF NOT EXISTS tags (
  id          SERIAL PRIMARY KEY,
  name        CITEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Many-to-many: tracks <-> tags
CREATE TABLE IF NOT EXISTS track_tags (
  id        SERIAL PRIMARY KEY,
  track_id  INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  UNIQUE(track_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_track_tags_track ON track_tags(track_id);
CREATE INDEX IF NOT EXISTS idx_track_tags_tag ON track_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_tracks_env_track ON tracks(env, track);
