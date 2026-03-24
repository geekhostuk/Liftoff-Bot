-- Pre-generated daily schedules for interleaved multi-playlist competition rotation

CREATE TABLE IF NOT EXISTS week_schedules (
  id          SERIAL PRIMARY KEY,
  week_id     INTEGER NOT NULL,
  day_number  INTEGER NOT NULL,
  schedule    JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (week_id) REFERENCES competition_weeks(id) ON DELETE CASCADE,
  UNIQUE(week_id, day_number)
);

-- Move interval_ms to per-week (uniform for all tracks in interleaved rotation)
ALTER TABLE competition_weeks ADD COLUMN IF NOT EXISTS interval_ms INTEGER NOT NULL DEFAULT 900000;
