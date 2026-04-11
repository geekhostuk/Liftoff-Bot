/**
 * Competition Scoring Engine
 *
 * Handles real-time per-race scoring (called on each race close) and
 * batch scoring at week finalisation (most improved, participation).
 *
 * Supports per-competition scoring config and room-aware routing
 * (scoring_mode: 'global' | 'room_only' | 'both').
 */

const db = require('./database');
const broadcast = require('./broadcast');

// F1-style position points (legacy constant, used when no scoring_config)
const POSITION_POINTS = [25, 18, 15, 12, 10, 8, 6, 4];

// ── Scoring config defaults & presets ──────────────────────────────────────

const DEFAULT_SCORING_CONFIG = {
  position_points: [25, 18, 15, 12, 10, 8, 6, 4],
  categories: {
    race_position: true,
    most_laps: true,
    lap_leader: true,
    hot_streak: true,
    consistency: true,
    most_improved: true,
    personal_best: true,
    participation: true,
  },
  lap_leader_bonus: 5,
  hot_streak_bonus: 3,
  consistency_points: 3,
  min_participants_for_bonus: 3,
  lap_volume_divisor: 5,
  lap_volume_cap: 10,
  most_improved_rewards: [15, 10, 5],
  participation_thresholds: { 7: 30, 5: 20, 3: 10 },
  track_variety_bonus: 5,
  track_variety_threshold: 3,
};

const SCORING_PRESETS = {
  f1_standard: { ...DEFAULT_SCORING_CONFIG },
  casual: {
    ...DEFAULT_SCORING_CONFIG,
    position_points: [10, 8, 6, 4, 3, 2, 1],
    lap_leader_bonus: 3,
    hot_streak_bonus: 2,
    consistency_points: 2,
    most_improved_rewards: [10, 6, 3],
  },
  weekend_challenge: {
    ...DEFAULT_SCORING_CONFIG,
    categories: {
      ...DEFAULT_SCORING_CONFIG.categories,
      most_improved: false,
      participation: false,
    },
  },
};

/** Merge a stored config with defaults so missing keys get sensible values. */
function resolveScoringConfig(stored) {
  if (!stored) return DEFAULT_SCORING_CONFIG;
  return {
    ...DEFAULT_SCORING_CONFIG,
    ...stored,
    categories: { ...DEFAULT_SCORING_CONFIG.categories, ...(stored.categories || {}) },
    participation_thresholds: { ...DEFAULT_SCORING_CONFIG.participation_thresholds, ...(stored.participation_thresholds || {}) },
  };
}

// ── Real-time scoring (per race close) ──────────────────────────────────────

/**
 * Find the target competition weeks for a race based on room scoring_mode.
 * Returns an array of { week, config } objects to score into.
 */
async function findTargetWeeks(race, overrideWeek) {
  // During recalculation, a specific week is provided — use it directly
  if (overrideWeek) {
    const comp = overrideWeek.competition_id != null
      ? await db.getCompetitionById?.(overrideWeek.competition_id) || null
      : null;
    return [{ week: overrideWeek, config: resolveScoringConfig(comp?.scoring_config) }];
  }

  const roomId = race.room_id || 'default';
  let scoringMode = 'global';
  if (typeof db.getRoomScoringMode === 'function') {
    scoringMode = await db.getRoomScoringMode(roomId) || 'global';
  }

  const targets = [];

  // Global competition (room_id IS NULL)
  if (scoringMode === 'global' || scoringMode === 'both') {
    let week = null;
    if (typeof db.getActiveWeekForGlobalComp === 'function') {
      week = await db.getActiveWeekForGlobalComp();
    }
    if (!week) {
      week = await db.getActiveWeek() || await db.getOrCreateCurrentWeek();
    }
    if (week && race.started_at >= week.starts_at && race.started_at <= week.ends_at) {
      const comp = week.competition_id != null
        ? (typeof db.getCompetitionById === 'function' ? await db.getCompetitionById(week.competition_id) : null)
        : null;
      targets.push({ week, config: resolveScoringConfig(comp?.scoring_config) });
    }
  }

  // Room-specific competition
  if ((scoringMode === 'room_only' || scoringMode === 'both') &&
      typeof db.getActiveCompetitionForRoom === 'function') {
    const roomComp = await db.getActiveCompetitionForRoom(roomId);
    if (roomComp && typeof db.getActiveWeekForCompetition === 'function') {
      const week = await db.getActiveWeekForCompetition(roomComp.id);
      if (week && race.started_at >= week.starts_at && race.started_at <= week.ends_at) {
        // Avoid double-scoring into the same week
        if (!targets.some(t => t.week.id === week.id)) {
          targets.push({ week, config: resolveScoringConfig(roomComp.scoring_config) });
        }
      }
    }
  }

  return targets;
}

async function processRaceClose(raceId, overrideWeek) {
  const race = await db.getRaceById(raceId);
  if (!race) return;

  const targets = await findTargetWeeks(race, overrideWeek);
  if (targets.length === 0) return;

  const pilots = await db.getRaceLapsGrouped(raceId);
  if (pilots.length === 0) return;

  for (const { week, config } of targets) {
    // Avoid double-processing (check per week for dual-scoring support)
    if (typeof db.hasRaceResultsForWeek === 'function') {
      if (await db.hasRaceResultsForWeek(raceId, week.id)) continue;
    } else if (await db.hasRaceResults(raceId)) {
      continue;
    }

    await scoreRaceIntoWeek(raceId, race, pilots, week, config);
  }
}

/**
 * Score a single race into a specific competition week using the given config.
 */
async function scoreRaceIntoWeek(raceId, race, pilots, week, config) {
  const participantCount = pilots.length;
  const awards = [];
  const cfg = config || DEFAULT_SCORING_CONFIG;
  const cats = cfg.categories || DEFAULT_SCORING_CONFIG.categories;
  const posPoints = cfg.position_points || POSITION_POINTS;
  const minBonus = cfg.min_participants_for_bonus ?? 3;

  // Determine point scale based on participant count
  let positionScale = 1.0;
  let awardPositionPoints = cats.race_position !== false;
  if (participantCount < 2) {
    awardPositionPoints = false;
  } else if (participantCount < 3) {
    positionScale = 0.5;
  }

  // Insert race results and award position points
  for (let i = 0; i < pilots.length; i++) {
    const pilot = pilots[i];
    const position = i + 1;

    await db.insertRaceResult(
      raceId, pilot.pilot_key, pilot.nick, position,
      pilot.best_lap_ms, pilot.total_laps,
      Math.round(pilot.avg_lap_ms), week.id
    );

    // Position points
    if (awardPositionPoints && i < posPoints.length) {
      const pts = Math.floor(posPoints[i] * positionScale);
      if (pts > 0) {
        await db.awardPoints(week.id, pilot.pilot_key, 'race_position', pts, {
          position, race_id: raceId, participants: participantCount,
        });
        awards.push({ pilot_key: pilot.pilot_key, display_name: pilot.nick, category: 'race_position', points: pts, detail: ordinal(position) + ' place' });
      }
    }

    // Lap volume points
    if (cats.most_laps !== false) {
      const divisor = cfg.lap_volume_divisor || 5;
      const cap = cfg.lap_volume_cap || 10;
      const lapPts = Math.min(Math.floor(pilot.total_laps / divisor), cap);
      if (lapPts > 0) {
        await db.awardPoints(week.id, pilot.pilot_key, 'most_laps', lapPts, {
          total_laps: pilot.total_laps, race_id: raceId,
        });
        awards.push({ pilot_key: pilot.pilot_key, display_name: pilot.nick, category: 'most_laps', points: lapPts, detail: `${pilot.total_laps} laps` });
      }
    }
  }

  // Lap leader bonus
  if (cats.lap_leader !== false && participantCount >= minBonus) {
    const bonus = cfg.lap_leader_bonus ?? 5;
    const lapLeader = pilots.reduce((max, p) => p.total_laps > max.total_laps ? p : max);
    await db.awardPoints(week.id, lapLeader.pilot_key, 'lap_leader', bonus, {
      reason: 'lap_leader', total_laps: lapLeader.total_laps, race_id: raceId,
    });
    awards.push({ pilot_key: lapLeader.pilot_key, display_name: lapLeader.nick, category: 'lap_leader', points: bonus, detail: 'Most laps' });
  }

  // Hot streak: fastest lap bonus
  if (cats.hot_streak !== false && participantCount >= minBonus) {
    const bonus = cfg.hot_streak_bonus ?? 3;
    const fastest = pilots[0]; // already sorted by best_lap_ms ASC
    await db.awardPoints(week.id, fastest.pilot_key, 'hot_streak', bonus, {
      reason: 'fastest_lap', best_lap_ms: fastest.best_lap_ms, race_id: raceId,
    });
    awards.push({ pilot_key: fastest.pilot_key, display_name: fastest.nick, category: 'hot_streak', points: bonus, detail: 'Fastest lap' });
  }

  // Consistency points
  if (cats.consistency !== false) {
    await calculateConsistencyPoints(raceId, pilots, week.id, awards, cfg);
  }

  // Refresh standings
  await db.refreshWeeklyStandings(week.id);

  // Broadcast updates
  const standings = await db.getWeeklyStandings(week.id);

  broadcast.broadcastAll({
    event_type: 'competition_points_awarded',
    race_id: raceId,
    week_id: week.id,
    awards: awards.map(a => ({
      pilot_key: a.pilot_key,
      display_name: a.display_name,
      category: a.category,
      points: a.points,
      detail: a.detail,
    })),
  });

  broadcast.broadcastAll({
    event_type: 'competition_standings_update',
    week_id: week.id,
    standings: standings.map(s => ({
      rank: s.rank,
      display_name: s.display_name,
      total_points: s.total_points,
      position_points: s.position_points,
      laps_points: s.laps_points,
      consistency_points: s.consistency_points,
      streak_points: s.streak_points,
    })),
  });
}

// ── Consistency calculation ─────────────────────────────────────────────────

async function calculateConsistencyPoints(raceId, pilots, weekId, awards, config) {
  if (pilots.length < 2) return;
  const cfg = config || DEFAULT_SCORING_CONFIG;
  const pts = cfg.consistency_points ?? 3;

  const deviations = [];
  for (const pilot of pilots) {
    const lapTimes = await db.getRaceLapsDetailed(raceId, pilot.pilot_key);
    if (lapTimes.length < 3) continue;

    // Drop worst 20% of laps
    const sorted = [...lapTimes].sort((a, b) => a - b);
    const keepCount = Math.ceil(sorted.length * 0.8);
    const kept = sorted.slice(0, keepCount);

    const mean = kept.reduce((a, b) => a + b, 0) / kept.length;
    const variance = kept.reduce((sum, t) => sum + (t - mean) ** 2, 0) / kept.length;
    const stddev = Math.sqrt(variance);

    deviations.push({ pilot_key: pilot.pilot_key, nick: pilot.nick, stddev });
  }

  if (deviations.length < 2) return;

  // Find median stddev
  const sortedDevs = [...deviations].sort((a, b) => a.stddev - b.stddev);
  const midIdx = Math.floor(sortedDevs.length / 2);
  const medianDev = sortedDevs.length % 2 === 0
    ? (sortedDevs[midIdx - 1].stddev + sortedDevs[midIdx].stddev) / 2
    : sortedDevs[midIdx].stddev;

  for (const d of deviations) {
    if (d.stddev <= medianDev) {
      await db.awardPoints(weekId, d.pilot_key, 'consistency', pts, {
        stddev: Math.round(d.stddev), median: Math.round(medianDev), race_id: raceId,
      });
      awards.push({ pilot_key: d.pilot_key, display_name: d.nick, category: 'consistency', points: pts, detail: 'Consistent flyer' });
    }
  }
}

// ── Batch scoring (week finalisation) ───────────────────────────────────────

async function finaliseWeek(weekId) {
  const week = await db.getWeekById(weekId);
  if (!week) return;

  // Load the competition's scoring config for batch scoring
  let config = DEFAULT_SCORING_CONFIG;
  if (week.competition_id != null && typeof db.getCompetitionById === 'function') {
    const comp = await db.getCompetitionById(week.competition_id);
    if (comp) config = resolveScoringConfig(comp.scoring_config);
  }
  const cats = config.categories || DEFAULT_SCORING_CONFIG.categories;

  if (cats.most_improved !== false || cats.personal_best !== false) {
    await calculateMostImproved(weekId, week, config);
  }
  if (cats.participation !== false) {
    await calculateParticipation(weekId, week, config);
  }

  await db.refreshWeeklyStandings(weekId);
  await db.updateWeekStatus(weekId, 'finalised');

  broadcast.broadcastAll({
    event_type: 'competition_week_finalised',
    week_id: weekId,
    standings: (await db.getWeeklyStandings(weekId)).map(s => ({
      rank: s.rank,
      display_name: s.display_name,
      total_points: s.total_points,
    })),
  });
}

async function calculateMostImproved(weekId, week, config) {
  const cfg = config || DEFAULT_SCORING_CONFIG;
  const cats = cfg.categories || DEFAULT_SCORING_CONFIG.categories;
  const pilots = await db.getWeekPilots(weekId);
  const improvements = [];

  for (const pilot of pilots) {
    const baselines = await db.getPilotBaselineBests(pilot.pilot_key, week.starts_at);
    const weekBests = await db.getPilotWeekBests(pilot.pilot_key, week.starts_at, week.ends_at);

    if (baselines.length === 0 || weekBests.length === 0) continue;

    const baselineMap = {};
    for (const b of baselines) baselineMap[`${b.env}|${b.track}`] = b.best_lap_ms;

    let totalImprovement = 0;
    let trackCount = 0;
    let personalBests = 0;

    for (const wb of weekBests) {
      const key = `${wb.env}|${wb.track}`;
      const baseline = baselineMap[key];
      if (!baseline) continue;

      if (wb.best_lap_ms < baseline) {
        const pctImprove = ((baseline - wb.best_lap_ms) / baseline) * 100;
        totalImprovement += pctImprove;
        trackCount++;
        personalBests++;
      }
    }

    // Award personal best points
    if (cats.personal_best !== false && personalBests > 0) {
      const pbPts = (cfg.personal_best_points_per_track ?? 3) * personalBests;
      await db.awardPoints(weekId, pilot.pilot_key, 'personal_best', pbPts, {
        tracks_improved: personalBests,
      });
    }

    if (trackCount > 0) {
      improvements.push({
        pilot_key: pilot.pilot_key,
        nick: pilot.nick,
        avg_improvement: totalImprovement / trackCount,
        tracks_improved: trackCount,
      });
    }
  }

  // Top 3 most improved by average percentage
  if (cats.most_improved !== false) {
    improvements.sort((a, b) => b.avg_improvement - a.avg_improvement);
    const topRewards = cfg.most_improved_rewards || [15, 10, 5];
    for (let i = 0; i < Math.min(topRewards.length, improvements.length); i++) {
      const imp = improvements[i];
      await db.awardPoints(weekId, imp.pilot_key, 'most_improved', topRewards[i], {
        rank: i + 1,
        avg_improvement_pct: Math.round(imp.avg_improvement * 100) / 100,
        tracks_improved: imp.tracks_improved,
      });
    }
  }
}

async function calculateParticipation(weekId, week, config) {
  const cfg = config || DEFAULT_SCORING_CONFIG;
  const thresholds = cfg.participation_thresholds || { 7: 30, 5: 20, 3: 10 };
  const varietyBonus = cfg.track_variety_bonus ?? 5;
  const varietyThreshold = cfg.track_variety_threshold ?? 3;

  const pilots = await db.getWeekPilots(weekId);

  // Sort thresholds descending by day count
  const sortedThresholds = Object.entries(thresholds)
    .map(([days, pts]) => [Number(days), pts])
    .sort((a, b) => b[0] - a[0]);

  for (const pilot of pilots) {
    const dayCount = await db.getPilotActiveDays(pilot.pilot_key, week.starts_at, week.ends_at);
    const trackCount = await db.getPilotDistinctTracks(pilot.pilot_key, week.starts_at, week.ends_at);

    let pts = 0;
    for (const [minDays, reward] of sortedThresholds) {
      if (dayCount >= minDays) { pts = reward; break; }
    }

    // Track variety bonus
    if (trackCount >= varietyThreshold) pts += varietyBonus;

    if (pts > 0) {
      await db.awardPoints(weekId, pilot.pilot_key, 'participation', pts, {
        days_active: dayCount,
        tracks_flown: trackCount,
      });
    }
  }
}

// ── Recalculate (admin tool) ────────────────────────────────────────────────

async function recalculateWeek(weekId) {
  const week = await db.getWeekById(weekId);
  if (!week) throw new Error('Week not found');

  // Load the competition's scoring config
  let config = DEFAULT_SCORING_CONFIG;
  if (week.competition_id != null && typeof db.getCompetitionById === 'function') {
    const comp = await db.getCompetitionById(week.competition_id);
    if (comp) config = resolveScoringConfig(comp.scoring_config);
  }

  // Clear existing points and results for this week
  await db.clearWeekData(weekId);

  // Find all races within this week's time range
  const races = await db.getRacesInRange(week.starts_at, week.ends_at);

  // Pass the week directly so processRaceClose uses it instead of looking up
  // the active week (which could be from a different competition)
  for (const race of races) {
    await processRaceClose(race.id, week);
  }

  // Run batch calculations
  const cats = config.categories || DEFAULT_SCORING_CONFIG.categories;
  if (cats.most_improved !== false || cats.personal_best !== false) {
    await calculateMostImproved(weekId, week, config);
  }
  if (cats.participation !== false) {
    await calculateParticipation(weekId, week, config);
  }
  await db.refreshWeeklyStandings(weekId);

  return { races_processed: races.length, standings: await db.getWeeklyStandings(weekId) };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

module.exports = {
  processRaceClose,
  finaliseWeek,
  recalculateWeek,
  DEFAULT_SCORING_CONFIG,
  SCORING_PRESETS,
  resolveScoringConfig,
};
