-- Competition system tables

CREATE TABLE IF NOT EXISTS competitions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS competition_weeks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id  INTEGER NOT NULL,
  week_number     INTEGER NOT NULL,
  starts_at       TEXT NOT NULL,
  ends_at         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'scheduled',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (competition_id) REFERENCES competitions(id),
  UNIQUE(competition_id, week_number)
);

CREATE TABLE IF NOT EXISTS week_playlists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id     INTEGER NOT NULL,
  playlist_id INTEGER NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  interval_ms INTEGER NOT NULL DEFAULT 900000,
  FOREIGN KEY (week_id) REFERENCES competition_weeks(id) ON DELETE CASCADE,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id)
);

CREATE TABLE IF NOT EXISTS race_results (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  race_id      TEXT NOT NULL,
  pilot_key    TEXT NOT NULL,
  display_name TEXT,
  position     INTEGER NOT NULL,
  best_lap_ms  INTEGER NOT NULL,
  total_laps   INTEGER NOT NULL,
  avg_lap_ms   INTEGER,
  week_id      INTEGER,
  FOREIGN KEY (race_id) REFERENCES races(id),
  UNIQUE(race_id, pilot_key)
);

CREATE TABLE IF NOT EXISTS weekly_points (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id     INTEGER NOT NULL,
  pilot_key   TEXT NOT NULL,
  category    TEXT NOT NULL,
  points      INTEGER NOT NULL DEFAULT 0,
  detail      TEXT,
  awarded_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (week_id) REFERENCES competition_weeks(id)
);

CREATE TABLE IF NOT EXISTS weekly_standings (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id              INTEGER NOT NULL,
  competition_id       INTEGER NOT NULL,
  pilot_key            TEXT NOT NULL,
  display_name         TEXT NOT NULL,
  total_points         INTEGER NOT NULL DEFAULT 0,
  position_points      INTEGER NOT NULL DEFAULT 0,
  laps_points          INTEGER NOT NULL DEFAULT 0,
  improved_points      INTEGER NOT NULL DEFAULT 0,
  consistency_points   INTEGER NOT NULL DEFAULT 0,
  participation_points INTEGER NOT NULL DEFAULT 0,
  streak_points        INTEGER NOT NULL DEFAULT 0,
  rank                 INTEGER,
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (week_id) REFERENCES competition_weeks(id),
  UNIQUE(week_id, pilot_key)
);

CREATE TABLE IF NOT EXISTS kv_store (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Competition indexes
CREATE INDEX IF NOT EXISTS idx_weekly_points_week_pilot ON weekly_points(week_id, pilot_key);
CREATE INDEX IF NOT EXISTS idx_race_results_week ON race_results(week_id);
CREATE INDEX IF NOT EXISTS idx_race_results_pilot ON race_results(pilot_key);
CREATE INDEX IF NOT EXISTS idx_comp_weeks_dates ON competition_weeks(starts_at, ends_at);
