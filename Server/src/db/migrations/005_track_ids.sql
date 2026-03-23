-- Rename workshop_id to local_id (auto-populated from catalog local_id field)
-- Add steam_id for manual entry via admin UI (for Steam API lookups)

ALTER TABLE tracks RENAME COLUMN workshop_id TO local_id;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS steam_id TEXT NOT NULL DEFAULT '';
