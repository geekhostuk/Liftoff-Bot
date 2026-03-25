#!/usr/bin/env node

/**
 * Import steam_id values into the tracks table from a CSV export.
 *
 * The CSV must have columns: local_id, workshop_id, version, type, name, file
 *
 * De-duplication: where a local_id appears more than once (possibly with different
 * workshop_ids), the row with the highest numeric version is used.
 *
 * Usage:
 *   node src/cli/importTrackSteamIds.js <path-to-csv> [--dry-run]
 */

require('dotenv').config();

const fs = require('fs');
const { initDatabase, getPool } = require('../db/connection');

const [,, csvPath, flag] = process.argv;
const dryRun = flag === '--dry-run';

if (!csvPath) {
  console.error('Usage: node src/cli/importTrackSteamIds.js <path-to-csv> [--dry-run]');
  process.exit(1);
}

if (!fs.existsSync(csvPath)) {
  console.error(`Error: File not found: ${csvPath}`);
  process.exit(1);
}

function parseCSV(content) {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  const headers = lines[0].replace(/"/g, '').split(',').map(h => h.trim());

  return lines.slice(1).map(line => {
    // Handle quoted fields (some values contain commas in path)
    const fields = [];
    let inQuote = false;
    let current = '';
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { fields.push(current); current = ''; continue; }
      current += ch;
    }
    fields.push(current);

    return Object.fromEntries(headers.map((h, i) => [h, fields[i] ?? '']));
  });
}

/** Pick the best row per local_id: highest numeric version wins. */
function deduplicate(rows) {
  const best = new Map();
  for (const row of rows) {
    const { local_id, version } = row;
    if (!local_id) continue;
    const v = parseInt(version, 10) || 0;
    if (!best.has(local_id) || v > best.get(local_id).v) {
      best.set(local_id, { v, row });
    }
  }
  return Array.from(best.values()).map(e => e.row);
}

async function main() {
  const content = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(content);
  console.log(`Parsed ${rows.length} rows from CSV`);

  const deduped = deduplicate(rows);
  console.log(`${deduped.length} unique local_ids after de-duplication`);

  await initDatabase();
  const pool = getPool();

  let updated = 0;
  let skipped = 0;  // local_id not found in DB
  let alreadySet = 0;

  for (const row of deduped) {
    const { local_id, workshop_id, name } = row;
    if (!local_id || !workshop_id) continue;

    const existing = await pool.query(
      'SELECT id, steam_id FROM tracks WHERE local_id = $1',
      [local_id]
    );

    if (existing.rows.length === 0) {
      skipped++;
      continue;
    }

    const track = existing.rows[0];

    if (track.steam_id === workshop_id) {
      alreadySet++;
      continue;
    }

    if (!dryRun) {
      await pool.query(
        'UPDATE tracks SET steam_id = $1 WHERE id = $2',
        [workshop_id, track.id]
      );
    }

    console.log(`${dryRun ? '[DRY RUN] Would update' : 'Updated'}: "${name}" local_id=${local_id} → steam_id=${workshop_id}${track.steam_id ? ` (was: ${track.steam_id})` : ''}`);
    updated++;
  }

  console.log('');
  console.log(`Done.`);
  console.log(`  Updated:     ${updated}`);
  console.log(`  Already set: ${alreadySet}`);
  console.log(`  Not in DB:   ${skipped}`);
  if (dryRun) console.log('  (dry run — no changes written)');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
