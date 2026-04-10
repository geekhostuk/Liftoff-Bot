-- Gate competition scoring and lap visibility behind pilot registration.
-- The `registered` column is set at insert time: TRUE if the pilot had a
-- verified site_users account when the lap was recorded.  Competition
-- scoring queries filter on this column so only "while-registered" laps
-- earn points.  Display / leaderboard queries use a live subquery against
-- site_users instead, giving retroactive visibility once a pilot registers.

ALTER TABLE laps ADD COLUMN registered BOOLEAN NOT NULL DEFAULT FALSE;

-- Back-fill: mark every existing lap from a currently-verified pilot as
-- registered so historical competition data stays intact.
UPDATE laps SET registered = TRUE
WHERE nick IN (
  SELECT nickname FROM site_users
  WHERE nick_verified = TRUE AND nickname IS NOT NULL
);

-- Partial index speeds up competition scoring queries that filter
-- WHERE registered = TRUE within a single race.
CREATE INDEX idx_laps_registered ON laps (race_id) WHERE registered = TRUE;
