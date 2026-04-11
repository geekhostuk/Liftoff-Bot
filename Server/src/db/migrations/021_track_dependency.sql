-- 021: Add dependency column to tracks (Steam Workshop ID of required subscription)
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS dependency TEXT NOT NULL DEFAULT '';
