# Backend Session README (Current Runtime Truth)

Use this file as the first read for any new work session.

Last verified against code on: 2026-03-10

## Documentation Rule (Required)

After each implementation/debug iteration:

- Update existing docs when behavior/flags/flows changed.
- Do **not** create new docs unless explicitly requested.
- Keep this file as the first entry point and update links/references here when needed.

## 1) Runtime Architecture

- `backend/src/index.ts` controls process mode with:
  - `RUN_API` (serve HTTP)
  - `RUN_JOBS` (run cron jobs)
- Recommended deployment split:
  - API service: `RUN_API=true`, `RUN_JOBS=false`
  - Worker service: `RUN_API=false`, `RUN_JOBS=true`

This isolates user-facing latency from aggregation/sync load.

## 2) ClickHouse vs Postgres (Important)

Even when ClickHouse is enabled, Postgres can still be the main cost/memory driver because:

1. All ingestion writes still go to Postgres first (`events`, `sessions`, `revenue`).
2. ClickHouse sync reads data from Postgres (`ClickHouseSyncService`).
3. Read endpoints can fall back to Postgres unless strict mode is enabled.

So "we switched to ClickHouse" does **not** mean Postgres is idle.

## 3) Aggregation Job Source of Truth

- If `ENABLE_CLICKHOUSE_AGGREGATION_JOBS=1`:
  - ClickHouse-native aggregation jobs run.
  - Postgres aggregation cron jobs are skipped (see startup logs).
- If `ENABLE_CLICKHOUSE_AGGREGATION_JOBS=0`:
  - Postgres aggregation cron jobs run.

Always confirm from startup logs (do not assume from env templates alone).

## 4) Endpoint Read Paths

See: `docs/BACKEND/FRONTEND-ENDPOINT-DB-MAP.md`

Interpretation:
- "ClickHouse or Postgres fallback" means fallback is active unless strict mode blocks it.
- Strict mode flag:
  - `ANALYTICS_CLICKHOUSE_STRICT=1`

## 5) Known Cost/Memory Levers

### Biggest immediate levers

1. Keep API and worker separated (avoid `RUN_API=true` + `RUN_JOBS=true` in one service).
2. Use shared Prisma singleton only (`backend/src/prisma.ts`).
3. Keep non-required hourly jobs disabled.
4. Ensure retention deletion is actually enabled (`DATA_RETENTION_ENABLED=true`).
5. Avoid accidental Postgres fallback for heavy read endpoints.

### Verification checklist after any infra/env change

1. Check startup logs for mode and started jobs.
2. Hit one endpoint per analytics page and inspect logs for fallback warnings.
3. Validate connection pressure:
   - Active vs idle connections
   - `P2024` pool timeout errors
4. Compare 2-hour trend:
   - Postgres memory slope
   - API p95 latency
   - 5xx rate

## 6) Current Backfill Commands

Run from `backend/`:

```bash
npm run backfill:level-metrics -- <gameId> <startDate> <endDate>
npm run backfill:active-users -- <gameId> <startDate> <endDate>
npm run backfill:cohorts -- <gameId> <startDate> <endDate>
npm run backfill:cohort-payers -- <gameId> <startDate> <endDate>
npm run backfill:monetization -- <gameId> <startDate> <endDate>
```

Date format: `YYYY-MM-DD` (UTC day boundaries).

## 7) If You Need to Debug "Why Postgres Is High"

Check in this order:

1. Is Postgres still primary ingest path? (usually yes)
2. Is ClickHouse sync running and scanning large tables?
3. Are heavy endpoints falling back to Postgres?
4. Are hourly jobs enabled unexpectedly?
5. Are there extra Prisma clients / excessive idle connections?
