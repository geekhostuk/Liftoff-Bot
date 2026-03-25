-- Steam Workshop metadata cache on the tracks table

ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS steam_title        TEXT,
  ADD COLUMN IF NOT EXISTS steam_author_id    TEXT,
  ADD COLUMN IF NOT EXISTS steam_author_name  TEXT,
  ADD COLUMN IF NOT EXISTS steam_preview_url  TEXT,
  ADD COLUMN IF NOT EXISTS steam_description  TEXT,
  ADD COLUMN IF NOT EXISTS steam_subscriptions INTEGER,
  ADD COLUMN IF NOT EXISTS steam_votes_up     INTEGER,
  ADD COLUMN IF NOT EXISTS steam_votes_down   INTEGER,
  ADD COLUMN IF NOT EXISTS steam_score        NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS steam_tags         TEXT[],
  ADD COLUMN IF NOT EXISTS steam_time_created TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS steam_time_updated TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS steam_fetched_at   TIMESTAMPTZ;
