#!/usr/bin/env node

/**
 * Diagnose and clean up lap times mis-attributed during track transitions.
 *
 * Usage:
 *   node src/cli/cleanupTransitionLaps.js                    # diagnostic — show each track's stats
 *   node src/cli/cleanupTransitionLaps.js --threshold 0.5    # show suspect laps (< 50% of median)
 *   node src/cli/cleanupTransitionLaps.js --threshold 0.5 --apply   # delete them
 */

require('dotenv').config();

const { initDatabase, getPool } = require('../db/connection');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const thresholdIdx = args.indexOf('--threshold');
const threshold = thresholdIdx !== -1 ? parseFloat(args[thresholdIdx + 1]) : null;

async function main() {
  await initDatabase();
  const pool = getPool();

  // ── Step 1: Per-track stats ──────────────────────────────────────────────
  console.log('\n=== Track Lap Time Statistics ===\n');

  const { rows: trackStats } = await pool.query(`
    SELECT
      r.env,
      r.track,
      COUNT(l.id)                                       AS total_laps,
      COUNT(DISTINCT l.actor)                           AS pilots,
      MIN(l.lap_ms)                                     AS fastest_ms,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.lap_ms)::int AS median_ms,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY l.lap_ms)::int AS p25_ms,
      MAX(l.lap_ms)                                     AS slowest_ms
    FROM laps l
    JOIN races r ON l.race_id = r.id
    WHERE r.env IS NOT NULL AND r.track IS NOT NULL
      AND r.env != '' AND r.track != ''
    GROUP BY r.env, r.track
    HAVING COUNT(l.id) >= 3
    ORDER BY r.env, r.track
  `);

  if (trackStats.length === 0) {
    console.log('No track data found.');
    process.exit(0);
  }

  // Table header
  console.log(
    'Env'.padEnd(25) +
    'Track'.padEnd(35) +
    'Laps'.padStart(6) +
    'Pilots'.padStart(7) +
    'Fastest'.padStart(10) +
    'P25'.padStart(10) +
    'Median'.padStart(10) +
    'Slowest'.padStart(10) +
    '  50% Cutoff'
  );
  console.log('-'.repeat(123));

  for (const t of trackStats) {
    const cutoff = Math.round(t.median_ms * 0.5);
    const flag = t.fastest_ms < cutoff ? ' <<<' : '';
    console.log(
      t.env.slice(0, 24).padEnd(25) +
      t.track.slice(0, 34).padEnd(35) +
      String(t.total_laps).padStart(6) +
      String(t.pilots).padStart(7) +
      fmtMs(t.fastest_ms).padStart(10) +
      fmtMs(t.p25_ms).padStart(10) +
      fmtMs(t.median_ms).padStart(10) +
      fmtMs(t.slowest_ms).padStart(10) +
      fmtMs(cutoff).padStart(12) +
      flag
    );
  }

  console.log('\nTracks marked <<< have laps faster than 50% of their median.\n');

  // ── Step 2: If threshold given, show suspect laps ────────────────────────
  if (threshold === null) {
    console.log('To see suspect laps, re-run with --threshold <ratio>');
    console.log('  e.g. --threshold 0.5  (flag laps < 50% of track median)');
    console.log('  e.g. --threshold 0.6  (flag laps < 60% of track median)');
    process.exit(0);
  }

  console.log(`\n=== Suspect Laps (< ${Math.round(threshold * 100)}% of track median) ===\n`);

  const { rows: suspects } = await pool.query(`
    WITH track_medians AS (
      SELECT
        r.env, r.track,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.lap_ms)::int AS median_ms
      FROM laps l
      JOIN races r ON l.race_id = r.id
      WHERE r.env IS NOT NULL AND r.track IS NOT NULL
        AND r.env != '' AND r.track != ''
      GROUP BY r.env, r.track
      HAVING COUNT(l.id) >= 3
    )
    SELECT
      l.id AS lap_id,
      l.race_id,
      l.actor,
      l.nick,
      l.lap_ms,
      l.recorded_at,
      r.env,
      r.track,
      tm.median_ms,
      ROUND(l.lap_ms::numeric / tm.median_ms * 100)::int AS pct_of_median
    FROM laps l
    JOIN races r ON l.race_id = r.id
    JOIN track_medians tm ON r.env = tm.env AND r.track = tm.track
    WHERE l.lap_ms < tm.median_ms * $1
    ORDER BY r.env, r.track, l.lap_ms
  `, [threshold]);

  if (suspects.length === 0) {
    console.log('No suspect laps found at this threshold.');
    process.exit(0);
  }

  console.log(
    'Lap ID'.padStart(8) +
    '  Pilot'.padEnd(22) +
    'Lap Time'.padStart(10) +
    'Median'.padStart(10) +
    '  %'.padStart(5) +
    '  Env'.padEnd(22) +
    '  Track'.padEnd(35) +
    '  Recorded At'
  );
  console.log('-'.repeat(120));

  for (const s of suspects) {
    console.log(
      String(s.lap_id).padStart(8) +
      '  ' + (s.nick || `actor:${s.actor}`).slice(0, 19).padEnd(20) +
      fmtMs(s.lap_ms).padStart(10) +
      fmtMs(s.median_ms).padStart(10) +
      (s.pct_of_median + '%').padStart(5) +
      '  ' + s.env.slice(0, 19).padEnd(20) +
      '  ' + s.track.slice(0, 33).padEnd(33) +
      '  ' + new Date(s.recorded_at).toISOString().replace('T', ' ').slice(0, 19)
    );
  }

  console.log(`\nTotal suspect laps: ${suspects.length}`);

  // ── Step 3: If --apply, delete them ──────────────────────────────────────
  if (!apply) {
    console.log('\nDry run — no changes made.');
    console.log('To delete these laps, re-run with --apply');
    process.exit(0);
  }

  const lapIds = suspects.map(s => s.lap_id);
  const raceIds = [...new Set(suspects.map(s => s.race_id))];

  console.log(`\nDeleting ${lapIds.length} laps...`);
  await pool.query(`DELETE FROM laps WHERE id = ANY($1)`, [lapIds]);
  console.log('Done.');

  // Delete race_results for affected races so recalculate rebuilds them
  console.log(`Clearing race_results for ${raceIds.length} affected races...`);
  await pool.query(`DELETE FROM race_results WHERE race_id = ANY($1)`, [raceIds]);
  console.log('Done.');

  // ── Step 4: Show affected competition weeks ──────────────────────────────
  const { rows: affectedWeeks } = await pool.query(`
    SELECT DISTINCT cw.id, cw.week_number, cw.starts_at, cw.ends_at, c.name AS competition
    FROM competition_weeks cw
    JOIN competitions c ON c.id = cw.competition_id
    WHERE EXISTS (
      SELECT 1 FROM laps l
      JOIN races r ON l.race_id = r.id
      WHERE r.id = ANY($1)
        AND l.recorded_at >= cw.starts_at
        AND l.recorded_at <= cw.ends_at
    )
    ORDER BY cw.starts_at
  `, [raceIds]);

  if (affectedWeeks.length > 0) {
    console.log('\nAffected competition weeks (recalculate via admin UI):');
    for (const w of affectedWeeks) {
      console.log(`  Week ${w.week_number} (id: ${w.id}) — ${w.competition} — ${new Date(w.starts_at).toISOString().slice(0, 10)} to ${new Date(w.ends_at).toISOString().slice(0, 10)}`);
    }
  } else {
    console.log('\nNo competition weeks affected.');
  }
}

function fmtMs(ms) {
  if (ms == null) return '-';
  const s = (ms / 1000).toFixed(2);
  return s + 's';
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
