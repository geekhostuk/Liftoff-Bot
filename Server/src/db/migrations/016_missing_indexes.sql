-- Performance indexes for frequently-queried columns missing coverage

-- Laps: nick is filtered in profileStats, queries.js, competitionScoring
CREATE INDEX IF NOT EXISTS idx_laps_nick ON laps(nick);

-- Laps: recorded_at alone (date range filters in profileStats, competition)
CREATE INDEX IF NOT EXISTS idx_laps_recorded ON laps(recorded_at);

-- Laps: composite for pilot rating speed CTE (nick + race_id grouping)
CREATE INDEX IF NOT EXISTS idx_laps_nick_race ON laps(nick, race_id);

-- Races: started_at (ORDER BY / WHERE in many queries)
CREATE INDEX IF NOT EXISTS idx_races_started ON races(started_at);

-- Races: env+track (subquery joins in trackBrowser, profileStats)
CREATE INDEX IF NOT EXISTS idx_races_env_track ON races(env, track);

-- Race results: race_id (getRaceResults, getRaceResultsWithPoints)
CREATE INDEX IF NOT EXISTS idx_race_results_race ON race_results(race_id);

-- Weekly standings: compound lookups
CREATE INDEX IF NOT EXISTS idx_weekly_standings_week_rank ON weekly_standings(week_id, rank);
CREATE INDEX IF NOT EXISTS idx_weekly_standings_comp_pilot ON weekly_standings(competition_id, pilot_key);

-- Track comments: partial index for active (non-deleted) comments
CREATE INDEX IF NOT EXISTS idx_track_comments_active
  ON track_comments(track_id, created_at DESC) WHERE deleted_at IS NULL;
