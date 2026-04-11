#!/usr/bin/env node

/**
 * Bulk-import tracks into the database from a CSV file.
 *
 * CSV must have headers: env, track
 * Optional columns:      local_id, steam_id, dependency
 *
 * Upserts on (env, track) — only overwrites local_id / steam_id / dependency
 * when the existing value is empty and the new value is non-empty.
 * Use --force to overwrite existing values.
 * Tags, steam metadata, and all other data are preserved.
 *
 * Usage:
 *   node src/cli/importTracks.js <path-to-csv> [--dry-run] [--force]
 */

require('dotenv').config();

const fs = require('fs');
const { initDatabase, getPool } = require('../db/connection');

const BATCH_SIZE = 500;
const COLS = 5; // env, track, local_id, steam_id, dependency

const [,, csvPath, ...flags] = process.argv;
const flagSet = new Set(flags);
const dryRun = flagSet.has('--dry-run');
const force = flagSet.has('--force');

if (!csvPath) {
  console.error('Usage: node src/cli/importTracks.js <path-to-csv> [--dry-run] [--force]');
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
    const fields = [];
    let inQuote = false;
    let current = '';
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { fields.push(current); current = ''; continue; }
      current += ch;
    }
    fields.push(current);

    const keepWhitespace = new Set(['env', 'track']);
    return Object.fromEntries(headers.map((h, i) => {
      const val = fields[i] ?? '';
      return [h, keepWhitespace.has(h) ? val : val.trim()];
    }));
  });
}

async function main() {
  const content = fs.readFileSync(csvPath, 'utf8');
  const allRows = parseCSV(content);
  console.log(`Parsed ${allRows.length} rows from CSV`);

  // Validate required columns exist
  if (allRows.length > 0) {
    const sample = allRows[0];
    if (!('env' in sample) || !('track' in sample)) {
      console.error('Error: CSV must have "env" and "track" columns');
      process.exit(1);
    }
  }

  // Filter out rows missing required fields
  const rows = allRows.filter(r => r.env && r.track);
  const skipped = allRows.length - rows.length;
  if (skipped > 0) {
    console.log(`Skipped ${skipped} rows with missing env or track`);
  }

  console.log(`${rows.length} valid rows to import`);
  if (rows.length === 0) {
    console.log('Nothing to import.');
    return;
  }

  await initDatabase();
  const pool = getPool();
  const client = await pool.connect();

  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

  try {
    await client.query('BEGIN');

    for (let b = 0; b < totalBatches; b++) {
      const batch = rows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      const values = [];
      const params = [];

      batch.forEach((row, idx) => {
        const offset = idx * COLS;
        values.push(`($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5})`);
        params.push(
          row.env,
          row.track,
          row.local_id || '',
          row.steam_id || '',
          row.dependency || ''
        );
      });

      const onConflict = force
        ? `ON CONFLICT (env, track) DO UPDATE SET
          local_id   = CASE WHEN EXCLUDED.local_id   <> '' THEN EXCLUDED.local_id   ELSE tracks.local_id   END,
          steam_id   = CASE WHEN EXCLUDED.steam_id   <> '' THEN EXCLUDED.steam_id   ELSE tracks.steam_id   END,
          dependency = CASE WHEN EXCLUDED.dependency <> '' THEN EXCLUDED.dependency ELSE tracks.dependency END`
        : `ON CONFLICT (env, track) DO UPDATE SET
          local_id   = CASE WHEN tracks.local_id   = '' AND EXCLUDED.local_id   <> '' THEN EXCLUDED.local_id   ELSE tracks.local_id   END,
          steam_id   = CASE WHEN tracks.steam_id   = '' AND EXCLUDED.steam_id   <> '' THEN EXCLUDED.steam_id   ELSE tracks.steam_id   END,
          dependency = CASE WHEN tracks.dependency = '' AND EXCLUDED.dependency <> '' THEN EXCLUDED.dependency ELSE tracks.dependency END`;

      await client.query(`
        INSERT INTO tracks (env, track, local_id, steam_id, dependency)
        VALUES ${values.join(',')}
        ${onConflict}
      `, params);

      const from = b * BATCH_SIZE + 1;
      const to = from + batch.length - 1;
      console.log(`[batch ${b + 1}/${totalBatches}] Upserted rows ${from}-${to}`);
    }

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('\nDry run — all changes rolled back.');
    } else {
      await client.query('COMMIT');
      console.log('\nCommitted.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`\nDone.`);
  console.log(`  Processed: ${rows.length}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Batches:   ${totalBatches}`);
  if (dryRun) console.log('  (dry run — no changes written)');
  if (force) console.log('  (force — existing values overwritten)');

  await pool.end();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
