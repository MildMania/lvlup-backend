# ClickHouse Session Freshness v2 Runbook

This runbook implements mutable session sync so late session closures/duration updates are reflected in ClickHouse.

## Scope
- Source of truth remains Postgres.
- ClickHouse remains read path for cohort dashboards.
- No API schema changes.
- No ongoing 7-day rolling recompute.

## 1) Code Changes Included
- `sessions_raw_v2` table is created automatically by sync service.
- Sessions sync watermark uses `sessions.updatedAt` (not `startTime`).
- Sessions are written append-only to `sessions_raw_v2` (no id-existence skip for sessions).
- Engine is `ReplacingMergeTree(updatedAt)` with key `(gameId, id)`.

## 2) Worker Environment (local jobs machine)
Set these on the local worker machine that runs jobs:

```bash
export RUN_API=false
export RUN_JOBS=true
export ENABLE_CLICKHOUSE_PIPELINE=1
export CLICKHOUSE_SYNC_TABLES=events,revenue,sessions,users,cohort_retention_daily,cohort_session_metrics_daily,level_metrics_daily,level_metrics_daily_users,level_churn_cohort_daily
export CLICKHOUSE_SYNC_CRON='*/5 * * * *'
```

Keep your existing DB/ClickHouse connection env vars as-is.

## 3) One-Time 7-Day Session Repair (cutover)
Run on Postgres (same database used by worker):

```sql
INSERT INTO "analytics_sync_watermarks" ("pipeline", "lastTs", "lastId", "updatedAt")
VALUES ('clickhouse_sync_sessions', NOW() - INTERVAL '7 day', '', NOW())
ON CONFLICT ("pipeline")
DO UPDATE SET
  "lastTs" = EXCLUDED."lastTs",
  "lastId" = EXCLUDED."lastId",
  "updatedAt" = NOW();
```

Then let sync cycles run until caught up.

## 4) Ongoing Recompute Strategy
- Hourly at `:15`: today incremental + yesterday recompute.
- Daily at `03:00 UTC`: yesterday finalization pass.
- No hourly rolling 7-day recompute.

## 5) Validation Gate (before trusting dashboards)
Use the same game/date window in both DBs and compare:
- `endTime IS NULL` session counts
- zero/NULL duration session counts
- D0/D1 users with sessions

If parity is still off, allow more sync cycles before investigating query semantics.

## 6) Rollback
If needed, disable ClickHouse cohort reads without changing ingestion:

```bash
export ANALYTICS_READ_COHORT_FROM_CLICKHOUSE=0
```

This keeps writes/sync intact and serves cohort reads from Postgres.
