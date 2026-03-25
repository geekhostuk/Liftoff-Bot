-- Track browser: skip/extend counters, public comments, and user-voted tags

-- Per-track skip/extend counters in a separate table to avoid row-level contention
-- on the tracks row during high-frequency vote events.
CREATE TABLE IF NOT EXISTS track_stats (
  track_id     INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  skip_count   INTEGER NOT NULL DEFAULT 0,
  extend_count INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Public comments: anonymous, name field with optional known-pilot indicator.
-- Soft-deleted by admins via deleted_at; ip_hash is SHA-256(ip+salt) for rate
-- limiting only and is never returned to clients.
CREATE TABLE IF NOT EXISTS track_comments (
  id              SERIAL PRIMARY KEY,
  track_id        INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  author_name     TEXT NOT NULL,
  is_known_pilot  BOOLEAN NOT NULL DEFAULT FALSE,
  body            TEXT NOT NULL,
  ip_hash         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_track_comments_track ON track_comments(track_id);
CREATE INDEX IF NOT EXISTS idx_track_comments_created ON track_comments(created_at DESC);

-- User/crowd-sourced tags: one vote per (track, label, ip) to prevent trivial
-- inflation without requiring accounts.
CREATE TABLE IF NOT EXISTS track_user_tags (
  id         SERIAL PRIMARY KEY,
  track_id   INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  label      CITEXT NOT NULL,
  ip_hash    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(track_id, label, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_user_tags_track ON track_user_tags(track_id);
