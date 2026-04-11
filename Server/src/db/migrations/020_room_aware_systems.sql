-- 020: Room-aware auto messages + competition system
-- Adds interval support to chat templates, room-specific competitions,
-- per-competition scoring config, and flexible competition periods.

-- ── Auto Messages: interval support ────────────────────────────────────────
ALTER TABLE chat_templates ADD COLUMN IF NOT EXISTS interval_ms INTEGER DEFAULT NULL;

-- ── Competitions: room-specific + configurable scoring ─────────────────────
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS room_id TEXT DEFAULT NULL REFERENCES rooms(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_competitions_room ON competitions(room_id);

ALTER TABLE competitions ADD COLUMN IF NOT EXISTS scoring_config JSONB DEFAULT NULL;

-- Custom period labels (e.g. "Weekend Challenge", "Day 1")
ALTER TABLE competition_weeks ADD COLUMN IF NOT EXISTS period_label TEXT DEFAULT NULL;

-- Allow same race scored into multiple weeks (for scoring_mode='both')
-- The old UNIQUE(race_id, pilot_key) prevents dual-scoring; replace with week-scoped constraint
ALTER TABLE race_results DROP CONSTRAINT IF EXISTS race_results_race_id_pilot_key_key;
ALTER TABLE race_results ADD CONSTRAINT race_results_race_id_pilot_key_week_id_key UNIQUE (race_id, pilot_key, week_id);

-- Room_id on race_results for efficient public API filtering
ALTER TABLE race_results ADD COLUMN IF NOT EXISTS room_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_race_results_room ON race_results(room_id);
