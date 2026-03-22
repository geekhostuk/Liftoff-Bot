-- Initial schema: core tables for sessions, races, laps, track catalog

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  started_at  TEXT NOT NULL,
  plugin_ver  TEXT
);

CREATE TABLE IF NOT EXISTS races (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  ordinal         INTEGER NOT NULL,
  started_at      TEXT NOT NULL,
  ended_at        TEXT,
  winner_actor    INTEGER,
  winner_nick     TEXT,
  winner_total_ms INTEGER,
  participants    INTEGER DEFAULT 0,
  completed       INTEGER DEFAULT 0,
  env             TEXT,
  track           TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS laps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  race_id     TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  actor       INTEGER NOT NULL,
  nick        TEXT,
  pilot_guid  TEXT,
  steam_id    TEXT,
  lap_number  INTEGER NOT NULL,
  lap_ms      INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (race_id) REFERENCES races(id)
);

CREATE TABLE IF NOT EXISTS track_catalog (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL,
  recorded_at  TEXT NOT NULL,
  catalog_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_templates (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger   TEXT NOT NULL,
  template  TEXT NOT NULL,
  enabled   INTEGER NOT NULL DEFAULT 1,
  delay_ms  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS playlists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,
  position    INTEGER NOT NULL,
  env         TEXT NOT NULL DEFAULT '',
  track       TEXT NOT NULL DEFAULT '',
  race        TEXT NOT NULL DEFAULT '',
  workshop_id TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for core tables
CREATE INDEX IF NOT EXISTS idx_laps_race ON laps(race_id);
CREATE INDEX IF NOT EXISTS idx_laps_race_recorded ON laps(race_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_laps_guid ON laps(pilot_guid);
CREATE INDEX IF NOT EXISTS idx_laps_steam ON laps(steam_id);
CREATE INDEX IF NOT EXISTS idx_races_session ON races(session_id);
