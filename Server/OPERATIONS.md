# Operations Guide

## Database Backup

Create a timestamped SQL dump of the full database:

```bash
docker compose exec postgres pg_dump -U liftoff liftoff > /home/joe/backups/liftoff_$(date +%Y%m%d_%H%M%S).sql
```

Restore from a backup:

```bash
docker compose exec -T postgres psql -U liftoff liftoff < /home/joe/backups/liftoff_20260411_143022.sql
```

## Bulk Track Import (CSV)

Import tracks directly into the database from a CSV file, bypassing the plugin catalog scanner. Safe to re-run with updated lists — existing tags, steam metadata, and other data are never overwritten.

### CSV Format

```csv
env,track,local_id,steam_id,dependency
RoadCourse,chicane,abc123,2876543210,2812345678
```

| Column | Required | Description |
|--------|----------|-------------|
| `env` | Yes | Environment/map internal name |
| `track` | Yes | Track name within that environment |
| `local_id` | No | Workshop local ID used by the plugin |
| `steam_id` | No | Steam Workshop item ID |
| `dependency` | No | Steam Workshop ID of a required subscription |

### Running the Import

```bash
# Copy CSV into the container
docker compose cp /path/to/tracks.csv api:/app/tracks.csv

# Dry run (validates data, rolls back — no changes written)
docker compose exec api node src/cli/importTracks.js /app/tracks.csv --dry-run

# Real import
docker compose exec api node src/cli/importTracks.js /app/tracks.csv
```

### Upsert Behaviour

- Rows are matched by `(env, track)` — the unique key
- `local_id`, `steam_id`, `dependency` are only updated when the existing value is empty and the CSV provides a non-empty value
- Tags, duration, steam metadata, comments, stats, and user tags are never touched
- Processes in batches of 500 rows inside a single transaction (all-or-nothing)

### Re-importing an Updated List

Same steps — copy the new CSV in and run the import again. New tracks are inserted, existing tracks get any empty fields filled in. To force-overwrite existing values, the script would need a `--force` flag (not yet implemented).
