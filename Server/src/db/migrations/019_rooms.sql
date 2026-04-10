-- Rooms: logical groupings of bots that share overseer, voting, and optionally scoring
CREATE TABLE IF NOT EXISTS rooms (
  id           TEXT PRIMARY KEY,
  label        TEXT NOT NULL DEFAULT '',
  scoring_mode TEXT NOT NULL DEFAULT 'room',  -- 'room' = own competition, 'global' = feeds global
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default room (backward compat — all existing bots land here)
INSERT INTO rooms (id, label, scoring_mode)
VALUES ('default', 'Main Room', 'global')
ON CONFLICT DO NOTHING;

-- Assign bots to rooms
ALTER TABLE bots ADD COLUMN IF NOT EXISTS room_id TEXT DEFAULT 'default' REFERENCES rooms(id);
CREATE INDEX IF NOT EXISTS idx_bots_room_id ON bots(room_id);

-- Tag races with their room for scoring isolation
ALTER TABLE races ADD COLUMN IF NOT EXISTS room_id TEXT DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_races_room_id ON races(room_id);

-- Room-scoped track queue
ALTER TABLE track_queue ADD COLUMN IF NOT EXISTS room_id TEXT DEFAULT 'default';

-- Room-scoped track history
ALTER TABLE track_history ADD COLUMN IF NOT EXISTS room_id TEXT DEFAULT 'default';
