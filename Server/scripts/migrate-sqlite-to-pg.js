#!/usr/bin/env node

/**
 * One-time migration: copy all data from an existing SQLite database into PostgreSQL.
 *
 * Prerequisites:
 *   - PostgreSQL must be running with the schema already applied
 *     (start the app once, or run `docker compose up postgres` + init).
 *   - Node.js 22+ (for the built-in node:sqlite module).
 *
 * Usage:
 *   node scripts/migrate-sqlite-to-pg.js --sqlite ./competition.db --pg postgresql://liftoff:liftoff@localhost:5432/liftoff
 *
 * Or using environment variables:
 *   SQLITE_PATH=./competition.db DATABASE_URL=postgresql://... node scripts/migrate-sqlite-to-pg.js
 */

const { DatabaseSync } = require('node:sqlite');
const { Pool } = require('pg');
const path = require('path');

// ── Parse args / env ────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let sqlitePath = process.env.SQLITE_PATH || './competition.db';
  let pgUrl = process.env.DATABASE_URL || 'postgresql://liftoff:liftoff@localhost:5432/liftoff';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sqlite' && args[i + 1]) sqlitePath = args[++i];
    if (args[i] === '--pg' && args[i + 1]) pgUrl = args[++i];
  }

  return { sqlitePath: path.resolve(sqlitePath), pgUrl };
}

// ── Tables in FK-safe insertion order ───────────────────────────────────────

const TABLES = [
  // No FK dependencies
  { name: 'sessions', serial: false },
  { name: 'competitions', serial: true },
  { name: 'chat_templates', serial: true },
  { name: 'playlists', serial: true },
  { name: 'admin_users', serial: true },
  { name: 'kv_store', serial: false },
  // Depend on sessions
  { name: 'races', serial: false },
  // Depend on races / sessions
  { name: 'laps', serial: true },
  { name: 'track_catalog', serial: true },
  // Depend on playlists
  { name: 'playlist_tracks', serial: true },
  // Depend on competitions
  { name: 'competition_weeks', serial: true },
  // Depend on competition_weeks / playlists
  { name: 'week_playlists', serial: true },
  // Depend on races / competition_weeks
  { name: 'race_results', serial: true },
  // Depend on competition_weeks
  { name: 'weekly_points', serial: true },
  { name: 'weekly_standings', serial: true },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function getColumns(sqliteDb, table) {
  const rows = sqliteDb.prepare(`PRAGMA table_info(${table})`).all();
  return rows.map(r => r.name);
}

async function migrateTable(sqliteDb, pgPool, table, hasSerial) {
  const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) {
    console.log(`  ${table}: 0 rows (skipped)`);
    return;
  }

  const columns = getColumns(sqliteDb, table);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const colList = columns.map(c => `"${c}"`).join(', ');
  const insertSql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      const values = columns.map(c => row[c] === undefined ? null : row[c]);
      await client.query(insertSql, values);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Reset sequence if table uses SERIAL
  if (hasSerial) {
    await pgPool.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 0))`);
  }

  console.log(`  ${table}: ${rows.length} rows migrated`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { sqlitePath, pgUrl } = parseArgs();

  console.log(`SQLite: ${sqlitePath}`);
  console.log(`PG:     ${pgUrl}`);
  console.log();

  const sqliteDb = new DatabaseSync(sqlitePath, { readOnly: true });
  const pgPool = new Pool({ connectionString: pgUrl });

  // Verify PG connection
  await pgPool.query('SELECT 1');
  console.log('Connected to PostgreSQL.\n');

  console.log('Migrating tables:');
  for (const { name, serial } of TABLES) {
    try {
      await migrateTable(sqliteDb, pgPool, name, serial);
    } catch (err) {
      // Table might not exist in older SQLite databases
      if (err.message && err.message.includes('no such table')) {
        console.log(`  ${name}: table not found in SQLite (skipped)`);
      } else {
        throw err;
      }
    }
  }

  console.log('\nMigration complete.');
  await pgPool.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
