# Jobs Environment Flags

This file documents background-job environment variables used by the backend.

## Core runtime flags

- `RUN_API`
  - Default: `true` (unless explicitly set to `false`)
  - Controls whether the HTTP API server starts.

- `RUN_JOBS`
  - Default: `true` (unless explicitly set to `false`)
  - Controls whether cron/background jobs start.

Typical modes:

- API + jobs (normal app): `RUN_API=true`, `RUN_JOBS=true`
- Worker-only (jobs only): `RUN_API=false`, `RUN_JOBS=true`
- API-only (no cron): `RUN_API=true`, `RUN_JOBS=false`

## Cost-control flags (hourly load)

- `ENABLE_LEVEL_METRICS_HOURLY`
  - Default: `false` (hourly level metrics job is skipped unless explicitly enabled)
  - Set `ENABLE_LEVEL_METRICS_HOURLY=1` to enable the hourly `level-metrics-hourly-today` job.
  - Daily level metrics job still runs even when this is disabled.

- `LEVEL_CHURN_HOURLY_REFRESH`
  - Default: `false`
  - Controls whether `level_churn_cohort_daily` refresh runs inside hourly level-metrics aggregation.
  - Set `LEVEL_CHURN_HOURLY_REFRESH=1` only if you need near-real-time D3/D7 churn updates.
  - Daily aggregation always refreshes churn rollups.

- `LEVEL_METRICS_DAILY_CHUNKED`
  - Default: `true`
  - Controls daily level-metrics execution strategy.
  - `1` (default): process daily aggregation in 24 hourly windows (lower peak memory, slower runtime).
  - `0`: revert to legacy single full-day in-memory scan (higher peak memory, usually faster).

- `ENABLE_ACTIVE_USERS_HOURLY`
  - Default: `false`
  - Set `ENABLE_ACTIVE_USERS_HOURLY=1` to enable hourly active users aggregation.
  - Daily active users aggregation still runs.

- `ENABLE_COHORT_HOURLY`
  - Default: `false`
  - Set `ENABLE_COHORT_HOURLY=1` to enable hourly cohort aggregation.
  - Daily cohort aggregation still runs.

- `ENABLE_MONETIZATION_HOURLY`
  - Default: `false`
  - Set `ENABLE_MONETIZATION_HOURLY=1` to enable hourly monetization aggregation.
  - Daily monetization aggregation still runs.

- `ACTIVE_USERS_DAILY_CHUNKED`
  - Default: `true`
  - `1`: computes exact DAU via hourly chunked de-dup (lower peak memory).
  - `0`: legacy one-shot exact `COUNT(DISTINCT)` query (usually faster, can spike memory more).

- `COHORT_DAYINDEX_CHUNK_SIZE`
  - Default: `8`
  - Number of cohort day indices processed per chunk before throttle hook.
  - Lower values smooth resource usage but increase wall-clock duration.

- `MONETIZATION_DAILY_CHUNKED`
  - Default: `true`
  - `1`: recomputes daily rollup by 24 hourly increments (lower peak memory).
  - `0`: legacy one-shot full-day aggregation query.

- `AGGREGATION_PAUSE_MS`
  - Default: `0`
  - Optional pause between per-game/per-day aggregation iterations.
  - Helps flatten CPU/memory spikes at the cost of longer total runtime.

- `AGGREGATION_FORCE_GC`
  - Default: `false`
  - If enabled, tries to call `global.gc()` between aggregation iterations.
  - Requires Node to run with `--expose-gc`; otherwise it logs a warning and skips.

## Heartbeat write-load controls

- `HEARTBEAT_MIN_PERSIST_INTERVAL_SECONDS`
  - Default: `60`
  - Minimum interval between persisted heartbeats per session.
  - Client can still send every 30s; server coalesces writes to reduce update churn.

- `HEARTBEAT_PERSIST_DURATION`
  - Default: `false`
  - If enabled, heartbeat writes also persist session `duration`.
  - If disabled, heartbeat writes update `lastHeartbeat` (+ optional first country code) only.

- `HEARTBEAT_BATCH_UPDATE_CHUNK_SIZE`
  - Default: `250`
  - Batch size for SQL heartbeat update chunks in the batch writer.

## API read-load controls

- `AUTH_GAME_CACHE_TTL_SECONDS`
  - Default: `60`
  - TTL for API-key -> game auth cache entries.
  - Reduces repeated `SELECT ... FROM games WHERE apiKey = ?` lookups on high request rates.

- `AUTH_GAME_NEG_CACHE_TTL_SECONDS`
  - Default: `10`
  - TTL for invalid API key cache entries.
  - Reduces repeated DB hits from repeated invalid keys.

- `AUTH_GAME_CACHE_MAX_ENTRIES`
  - Default: `10000`
  - Maximum API-key cache entry count before FIFO eviction.

## Recommended low-cost production setup

If DB memory/cost is tight, use:

- `RUN_API=true`
- `RUN_JOBS=true`
- `ENABLE_LEVEL_METRICS_HOURLY=0`
- `LEVEL_CHURN_HOURLY_REFRESH=0`
- `ENABLE_ACTIVE_USERS_HOURLY=0`
- `ENABLE_COHORT_HOURLY=0`
- `ENABLE_MONETIZATION_HOURLY=0`
- `ACTIVE_USERS_DAILY_CHUNKED=1`
- `COHORT_DAYINDEX_CHUNK_SIZE=8`
- `MONETIZATION_DAILY_CHUNKED=1`
- `AGGREGATION_PAUSE_MS=0`
- `AGGREGATION_FORCE_GC=0`

This keeps daily aggregations and disables all hourly aggregation jobs.

## Monitoring workflow (recommended)

1. Start with all hourly flags set to `0` (baseline).
2. Enable one hourly flag at a time (`=1`) for a few hours.
3. Compare DB CPU/memory slope and egress before enabling the next one.

### Query stats snapshots

- Capture top queries before/after a change:
  - `npm run ops:query-stats-snapshot`
- Optional limit:
  - `npm run ops:query-stats-snapshot -- 50`
- Output file:
  - `backend/logs/query-stats/query-stats-<timestamp>.json`

## Notes

- New D3/D7 churn columns may show `N/A` until rollups are backfilled.
- Egress runbook:
  - See `backend/README-EGRESS-RUNBOOK.md`
- Backfill command (from `backend/`):
  - `npm run backfill:level-metrics -- <gameId> <startDate> <endDate>`
  - Example:
    - `npm run backfill:level-metrics -- cmkkteznd0076mn1m2dxl1ijd 2026-02-19 2026-03-04`
