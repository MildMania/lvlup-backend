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

## Recommended low-cost production setup

If DB memory/cost is tight, use:

- `RUN_API=true`
- `RUN_JOBS=true`
- `ENABLE_LEVEL_METRICS_HOURLY=0`
- `LEVEL_CHURN_HOURLY_REFRESH=0`

This keeps daily aggregations and disables the heaviest hourly funnel path.

## Notes

- New D3/D7 churn columns may show `N/A` until rollups are backfilled.
- Backfill command (from `backend/`):
  - `npm run backfill:level-metrics -- <gameId> <startDate> <endDate>`
  - Example:
    - `npm run backfill:level-metrics -- cmkkteznd0076mn1m2dxl1ijd 2026-02-19 2026-03-04`
