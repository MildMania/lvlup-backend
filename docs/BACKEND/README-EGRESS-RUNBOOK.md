# Postgres Egress Runbook (Local Worker Preserved)

This runbook is for the current architecture where:

- API runs in Railway
- Aggregation worker runs on a local machine
- Worker uses public Postgres URL

In this setup, some Postgres public egress is unavoidable.

## Goal

Reduce avoidable egress and DB load without changing analytics behavior.

## 1) Baseline snapshot

From `backend/`:

```bash
npm run ops:query-stats-snapshot -- 25
```

Collect at the same time:

- Railway Postgres: CPU, memory, public egress
- API service: request volume, response status mix

## 2) Isolate avoidable egress sources

Run these checks one-by-one for 20-30 minutes each:

1. Stop dashboard pages with auto-refresh (especially realtime events).
2. Close external DB clients (pgAdmin/DBeaver).
3. Stop local worker briefly (`RUN_JOBS=false`) to estimate unavoidable worker share.

If spikes disappear when one source is off, that source is the main contributor.

## 3) Keep behavior stable while reducing query cost

- Keep all hourly aggregation flags disabled unless explicitly needed.
- Keep daily jobs enabled.
- Keep auth cache enabled (`AUTH_GAME_*` vars) to reduce repeated game lookups.

## 4) Apply index pack (no semantic change)

Run indexes from:

- `backend/sql-utilities/egress-cost-indexes.sql`

Use `psql` (each statement runs outside transactions due to `CONCURRENTLY`):

```bash
psql "$DATABASE_URL" -f backend/sql-utilities/egress-cost-indexes.sql
```

## 5) Verify after changes

1. Capture another snapshot:

```bash
npm run ops:query-stats-snapshot -- 25
```

2. Compare before vs after:

- total exec time of top queries
- calls to `SELECT ... FROM games` (auth path)
- Postgres public egress trend

## 6) Fast rollback

If any issue appears:

1. Disable auth cache quickly:
   - `AUTH_GAME_CACHE_TTL_SECONDS=1`
   - `AUTH_GAME_CACHE_MAX_ENTRIES=100`
2. Revert env vars and restart API process.
3. Keep indexes in place unless there is clear write regression.

