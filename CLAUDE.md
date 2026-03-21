# CLAUDE.md - LvlUp Backend

## Project Overview

Mobile game analytics platform (similar to GameAnalytics). Monorepo with separate `backend/` and `frontend/` directories.

## Tech Stack

- **Backend:** Express.js 5.1 + TypeScript
- **ORM:** Prisma 6 (shared singleton at `backend/src/prisma.ts`)
- **Primary DB:** PostgreSQL (Railway production), SQLite (local dev)
- **Optional Read DB:** ClickHouse (async sync from Postgres, feature-flagged per endpoint)
- **Cache:** Redis
- **Deployment:** Railway (auto-deploy on git push)
- **Memory limit:** 512MB (`--max-old-space-size=512`)

## Architecture

### Runtime Modes
- API service: `RUN_API=true`, `RUN_JOBS=false`
- Worker service: `RUN_API=false`, `RUN_JOBS=true`
- These should be separate Railway services in production.

### Data Flow
1. SDK clients → API ingestion (events, sessions, revenue) → Postgres
2. Worker cron jobs → Postgres aggregation rollups (daily, optionally hourly)
3. Optional: Postgres → ClickHouse sync → ClickHouse read path with Postgres fallback

### Session Lifecycle
1. `POST /analytics/sessions` — creates session with `startTime`, `platform`, `version`, `countryCode`
2. `POST /analytics/sessions/:id/heartbeat` — batched via `SessionHeartbeatBatchWriter`, updates `lastHeartbeat`
3. `PUT /analytics/sessions/:id` — ends session, calculates `duration`
4. `SessionHeartbeatService` — auto-closes sessions with no heartbeat for 3 minutes (every 2 min check)
5. Closed sessions can be re-extended within `SESSION_CLOSED_EXTENSION_WINDOW_SECONDS` (default 600s)

### Key Session Details
- `sessionNum` is client-provided in event payloads, NOT server-tracked
- Heartbeat coalescing: `HEARTBEAT_MIN_PERSIST_INTERVAL_SECONDS=60`
- Future tolerance: `SESSION_FUTURE_TOLERANCE_SECONDS=60`
- Duration = `floor((max(endTime, lastHeartbeat) - startTime) / 1000)` seconds

### Batch Writers
- `EventBatchWriter` — batches analytics events
- `RevenueBatchWriter` — batches revenue/IAP/ad events
- `SessionHeartbeatBatchWriter` — batches heartbeat UPDATEs with SQL VALUES clause

## Key Directories

```
backend/src/
├── controllers/     # API handlers (23 files)
├── services/        # Business logic (42 files)
├── routes/          # Endpoint definitions (18 files)
├── jobs/            # Cron jobs (8 files)
├── middleware/      # Auth, validation, etc. (8 files)
├── utils/           # Logging, caching, etc. (12 files)
├── types/           # Type definitions (3 files)
├── scripts/         # Operational scripts (11 files)
├── index.ts         # Main entry point
└── prisma.ts        # Prisma singleton
```

## Key Documentation
- `docs/BACKEND/SESSION-README.md` — Runtime architecture, cost levers, verification checklist
- `docs/BACKEND/README-JOBS-ENV.md` — All job environment flags
- `docs/BACKEND/EGRESS-ATTRIBUTION.md` — Postgres egress debugging
- `docs/BACKEND/PG-ZERO-DURATION-DIAGNOSTICS.md` — Debug zero-duration sessions

## Commands

```bash
# Build
cd backend && npm run build

# Run locally
npm start

# Run tests
npm test

# Backfill commands (from backend/)
npm run backfill:level-metrics -- <gameId> <startDate> <endDate>
npm run backfill:active-users -- <gameId> <startDate> <endDate>
npm run backfill:cohorts -- <gameId> <startDate> <endDate>
npm run backfill:monetization -- <gameId> <startDate> <endDate>

# Query stats snapshot
npm run ops:query-stats-snapshot
```

## Environment Switching
```bash
# From repo root
source ./env local    # Switch to local SQLite
source ./env prod     # Switch to production PostgreSQL
```

## Important Patterns
- All ClickHouse reads are feature-flagged: `ANALYTICS_READ_*_FROM_CLICKHOUSE`
- Hourly aggregation jobs are disabled by default (cost control)
- Daily aggregation jobs always run
- Session duration uses `lastHeartbeat` when available and newer than `endTime`
- Aggregation rollup tables: `LevelMetricsDaily`, `ActiveUsersDaily`, `CohortRetentionDaily`, `CohortSessionMetricsDaily`, `MonetizationDailyRollup`

## Cost-Sensitive Notes
- Keep API/Worker separated to avoid pool pressure
- All hourly jobs default to OFF
- ClickHouse sync is async and won't reduce Postgres write load
- Heartbeat batch writer coalesces writes to reduce UPDATE churn
- `DATA_RETENTION_ENABLED=true` for automatic old data cleanup
