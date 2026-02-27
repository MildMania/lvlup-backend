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

## Recommended low-cost production setup

If DB memory/cost is tight, use:

- `RUN_API=true`
- `RUN_JOBS=true`
- `ENABLE_LEVEL_METRICS_HOURLY=0`
- `LEVEL_CHURN_HOURLY_REFRESH=0`
- `ENABLE_ACTIVE_USERS_HOURLY=0`
- `ENABLE_COHORT_HOURLY=0`
- `ENABLE_MONETIZATION_HOURLY=0`

This keeps daily aggregations and disables all hourly aggregation jobs.

## Monitoring workflow (recommended)

1. Start with all hourly flags set to `0` (baseline).
2. Enable one hourly flag at a time (`=1`) for a few hours.
3. Compare DB CPU/memory slope and egress before enabling the next one.

## Notes

- New D3/D7 churn columns may show `N/A` until rollups are backfilled.
- Backfill command (from `backend/`):
  - `npm run backfill:level-metrics -- <gameId> <startDate> <endDate>`
  - Example:
    - `npm run backfill:level-metrics -- cmkkteznd0076mn1m2dxl1ijd 2026-02-19 2026-03-04`
