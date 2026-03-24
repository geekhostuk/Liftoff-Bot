/**
 * Competition Runner
 *
 * Manages the weekly competition lifecycle:
 * - Activates scheduled weeks when their start time arrives
 * - Finalises active weeks when their end time passes
 * - Generates daily interleaved schedules from multiple playlists
 * - Each track from all playlists appears once per round (fair distribution)
 * - Shuffled with a deterministic seed per day (reboot-resilient)
 * - Handles day rollover and mid-week playlist changes
 *
 * Runs a 60-second interval check.
 */

const db = require('./database');
const playlistRunner = require('./playlistRunner');
const broadcast = require('./broadcast');
const { getCurrentTrack } = require('./state');
const { finaliseWeek } = require('./competitionScoring');

const CHECK_INTERVAL = 60_000; // 60 seconds
const DAY_MS = 86_400_000;

const state = {
  running: false,
  autoManaged: false,
  currentWeekId: null,
  currentDayNumber: null,
  weekPlaylists: [],
};

let _timer = null;

// ── Seeded PRNG (mulberry32) ────────────────────────────────────────────────

function seededRng(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(array, rng) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ── Persistence ─────────────────────────────────────────────────────────────

async function _persistState() {
  try {
    await db.saveRunnerState(state);
  } catch (err) {
    console.error('[competition] Failed to persist state:', err.message);
  }
}

async function _restoreState() {
  try {
    const saved = await db.loadRunnerState();
    if (saved.autoManaged) {
      state.autoManaged = true;
      state.currentWeekId = saved.currentWeekId;
      state.currentDayNumber = saved.currentDayNumber;
      console.log('[competition] Restored state from DB: auto_managed=true, week_id=' + saved.currentWeekId + ', day=' + saved.currentDayNumber);
    }
  } catch (err) {
    console.error('[competition] Failed to restore state:', err.message);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

async function start() {
  if (_timer) return;
  await _restoreState();
  _timer = setInterval(tick, CHECK_INTERVAL);
  console.log('[competition] Runner started (checking every 60s)');
  await tick();
}

async function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
  state.running = false;
  state.autoManaged = false;
  await _persistState();
  console.log('[competition] Runner stopped');
}

function getState() {
  return {
    running: state.running,
    auto_managed: state.autoManaged,
    current_week_id: state.currentWeekId,
    current_day_number: state.currentDayNumber,
    playlist_count: state.weekPlaylists.length,
  };
}

async function setAutoManaged(enabled) {
  state.autoManaged = enabled;
  if (enabled && state.currentWeekId) {
    const weekPlaylists = await db.getWeekPlaylists(state.currentWeekId);
    if (weekPlaylists.length > 0) {
      state.weekPlaylists = weekPlaylists;
      const week = await db.getWeekById(state.currentWeekId);
      if (week) {
        await resumeFromCalculatedPosition(week, weekPlaylists);
      }
    }
  }
  await _persistState();
  _broadcastState();
}

// ── Schedule generation ─────────────────────────────────────────────────────

function calculateDayNumber(weekStartsAt) {
  const elapsed = Date.now() - new Date(weekStartsAt).getTime();
  return Math.max(0, Math.floor(elapsed / DAY_MS));
}

/**
 * Generate a day's interleaved schedule from all week playlists.
 * Every track appears exactly once per round, shuffled deterministically.
 * Rounds repeat to fill 24 hours.
 */
async function generateDaySchedule(weekId, dayNumber, weekPlaylists, intervalMs) {
  // Collect all tracks from all playlists
  const pool = [];
  for (const wp of weekPlaylists) {
    const tracks = await db.getPlaylistTracks(wp.playlist_id);
    for (const t of tracks) {
      pool.push({
        env: t.env,
        track: t.track,
        race: t.race || '',
        workshop_id: t.workshop_id || '',
        source_playlist_id: wp.playlist_id,
        source_playlist_name: wp.playlist_name,
      });
    }
  }

  if (pool.length === 0) return [];

  // Calculate how many rounds needed to fill 24 hours
  const roundDurationMs = pool.length * intervalMs;
  const roundsNeeded = Math.max(1, Math.ceil(DAY_MS / roundDurationMs));

  // Generate schedule: each round is a fresh shuffle of the full pool
  const rng = seededRng(weekId * 1000 + dayNumber);
  const schedule = [];
  for (let r = 0; r < roundsNeeded; r++) {
    schedule.push(...seededShuffle(pool, rng));
  }

  // Persist to DB
  await db.saveWeekSchedule(weekId, dayNumber, schedule);

  console.log(`[competition] Generated day ${dayNumber} schedule: ${schedule.length} entries (${pool.length} tracks × ${roundsNeeded} rounds, ${Math.round(intervalMs / 60000)}min interval)`);
  return schedule;
}

async function getDaySchedule(weekId, dayNumber, weekPlaylists, intervalMs) {
  const existing = await db.getWeekSchedule(weekId, dayNumber);
  if (existing) return existing;
  return generateDaySchedule(weekId, dayNumber, weekPlaylists, intervalMs);
}

// ── Position calculation ────────────────────────────────────────────────────

/**
 * Calculate where in the day's schedule we should be right now.
 */
function calculateSchedulePosition(schedule, weekStartsAt, dayNumber, intervalMs) {
  if (schedule.length === 0) return null;

  const dayStartMs = new Date(weekStartsAt).getTime() + (dayNumber * DAY_MS);
  const elapsedInDay = Date.now() - dayStartMs;
  if (elapsedInDay < 0) return null;

  const totalScheduleMs = schedule.length * intervalMs;
  const positionInSchedule = elapsedInDay % totalScheduleMs;
  const scheduleIndex = Math.floor(positionInSchedule / intervalMs);
  const elapsedInTrack = positionInSchedule - (scheduleIndex * intervalMs);
  const remainingMs = intervalMs - elapsedInTrack;

  const clampedIndex = Math.min(scheduleIndex, schedule.length - 1);
  return {
    scheduleIndex: clampedIndex,
    remainingMs: Math.max(1000, remainingMs),
    expectedTrack: schedule[clampedIndex] || null,
  };
}

async function calculateCurrentPosition(week, weekPlaylists) {
  if (weekPlaylists.length === 0) return null;

  const intervalMs = week.interval_ms || 900000;
  const dayNumber = calculateDayNumber(week.starts_at);
  const schedule = await getDaySchedule(week.id, dayNumber, weekPlaylists, intervalMs);
  if (!schedule || schedule.length === 0) return null;

  const pos = calculateSchedulePosition(schedule, week.starts_at, dayNumber, intervalMs);
  if (!pos) return null;

  return {
    ...pos,
    schedule,
    intervalMs,
    dayNumber,
  };
}

// ── Resume at calculated position ───────────────────────────────────────────

async function resumeFromCalculatedPosition(week, weekPlaylists) {
  const pos = await calculateCurrentPosition(week, weekPlaylists);
  if (!pos) {
    console.log('[competition] Could not calculate position — no playlists or week not started');
    return;
  }

  state.currentDayNumber = pos.dayNumber;
  await _persistState();

  // Check if the in-game track already matches
  const current = getCurrentTrack();
  const expected = pos.expectedTrack;
  const trackAlreadyCorrect = expected && current &&
    current.env === expected.env && current.track === expected.track;

  try {
    playlistRunner.startSchedule(pos.schedule, pos.intervalMs, pos.scheduleIndex, pos.remainingMs, !trackAlreadyCorrect);
    console.log(
      `[competition] Resumed: day ${pos.dayNumber}, ` +
      `track ${pos.scheduleIndex + 1}/${pos.schedule.length}, ` +
      `next change in ${Math.round(pos.remainingMs / 1000)}s` +
      (trackAlreadyCorrect ? ' (track already correct)' : ' (track corrected)')
    );
  } catch (err) {
    console.error('[competition] Failed to resume schedule:', err.message);
    // Fall back to starting fresh at position 0
    try {
      playlistRunner.startSchedule(pos.schedule, pos.intervalMs);
    } catch (err2) {
      console.error('[competition] Fallback start also failed:', err2.message);
    }
  }

  _broadcastState();
}

// ── Core tick ───────────────────────────────────────────────────────────────

async function tick() {
  try {
    // Check for overdue active weeks that need finalisation
    const overdue = await db.getOverdueActiveWeek();
    if (overdue) {
      console.log(`[competition] Finalising week ${overdue.week_number} (${overdue.competition_name})`);
      await finaliseWeek(overdue.id);

      if (state.currentWeekId === overdue.id) {
        state.currentWeekId = null;
        state.weekPlaylists = [];
        state.currentDayNumber = null;
      }
    }

    // Check for scheduled weeks that should now be active
    const ready = await db.getNextScheduledWeek();
    if (ready) {
      await activateWeek(ready);
    }

    // If we have an active week, make sure state is current
    const active = await db.getActiveWeek();
    if (active) {
      state.running = true;
      state.currentWeekId = active.id;

      if (state.autoManaged) {
        // Day rollover detection
        const currentDay = calculateDayNumber(active.starts_at);
        if (state.currentDayNumber !== null && currentDay !== state.currentDayNumber) {
          console.log(`[competition] Day rollover: day ${state.currentDayNumber} → ${currentDay}`);
          state.currentDayNumber = currentDay;
          const weekPlaylists = await db.getWeekPlaylists(active.id);
          state.weekPlaylists = weekPlaylists;
          await resumeFromCalculatedPosition(active, weekPlaylists);
        }

        // If no playlist is running, resume at calculated position
        if (!playlistRunner.getState().running) {
          const weekPlaylists = await db.getWeekPlaylists(active.id);
          if (weekPlaylists.length > 0) {
            state.weekPlaylists = weekPlaylists;
            await resumeFromCalculatedPosition(active, weekPlaylists);
          }
        }
      }
    } else {
      state.running = false;
      state.currentWeekId = null;
    }
  } catch (err) {
    console.error('[competition] Tick error:', err.message);
  }
}

// ── Week activation ─────────────────────────────────────────────────────────

async function activateWeek(week) {
  console.log(`[competition] Activating week ${week.week_number} (${week.competition_name})`);
  await db.updateWeekStatus(week.id, 'active');

  state.running = true;
  state.currentWeekId = week.id;
  state.currentDayNumber = calculateDayNumber(week.starts_at);
  state.autoManaged = true;

  const weekPlaylists = await db.getWeekPlaylists(week.id);
  state.weekPlaylists = weekPlaylists;

  await _persistState();

  broadcast.broadcastAll({
    event_type: 'competition_week_started',
    week_id: week.id,
    week_number: week.week_number,
    competition_name: week.competition_name,
    starts_at: week.starts_at,
    ends_at: week.ends_at,
  });

  if (weekPlaylists.length > 0) {
    await resumeFromCalculatedPosition(week, weekPlaylists);
  }
}

// ── Broadcast ───────────────────────────────────────────────────────────────

function _broadcastState() {
  broadcast.broadcastAll({
    event_type: 'competition_runner_state',
    ...getState(),
  });
}

module.exports = {
  start,
  stop,
  getState,
  setAutoManaged,
  // No longer needed: onPlaylistStateChange removed (interleaved schedule handles it)
};
