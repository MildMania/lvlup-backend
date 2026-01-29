# Level Funnel Pre-Aggregation Feature Implementation

## Overview

Implement a **daily pre-aggregation system** for Level Funnel queries to improve performance from ~9.5 seconds to ~250ms for historical data, while preserving calculation correctness and supporting live “today so far” data.

The system uses **daily aggregated metrics + raw-event delta for today**, enabling fast dashboards without losing analytical flexibility.

---

## Problem Statement

- Current Level Funnel dashboard queries take **~9.5 seconds**
- Database: PostgreSQL with ~360K level events
- Users: ~5K currently, scaling to 50K–500K
- Database growth: ~100MB/day (unsustainable for query performance)
- Goal: **~38× performance improvement** while keeping analytics accurate and trustworthy

---

## Key Constraints & Rules

1. **No user IDs stored in aggregated tables**
   - User IDs may be used *during aggregation only*
   - Aggregated tables must contain **counts only**

2. **Count-based calculations only**
   - All dashboard metrics must be derived from aggregated counts

3. **All filters must work**
   - platform
   - countryCode
   - appVersion
   - levelFunnel
   - levelFunnelVersion

4. **Metric semantics must be explicit**
   - Player-based metrics are **range-unique**
   - Funnel rate is **derived at query time**
   - No lifetime cohort guarantees

5. **Internal tool**
   - Max ~10 dashboard users
   - Single instance
   - No multi-region or sharding required

6. **Raw events are preserved**
   - Never delete raw events
   - Aggregation is additive and idempotent

---

## Event Structure (Source of Truth)

```ts
Event {
  userId
  gameId
  sessionId
  eventName: 'level_start' | 'level_complete' | 'level_failed'
  properties: {
    levelId: number
    boosters: { booster_type: number }
    egp: number
    duration: number
  }
  platform: string
  countryCode: string
  appVersion: string
  levelFunnel: string
  levelFunnelVersion: number
  createdAt: timestamp
}
```

Metric Definitions
Core Event Counts

starts
Count of level_start events

completes
Count of level_complete events

fails
Count of level_failed events

Player Counts (Daily Unique)

startedPlayers
Unique users who triggered level_start on that day

completedPlayers
Unique users who triggered level_complete on that day

Player counts are daily-unique, not deduplicated across multiple days.

Booster & Purchase Metrics

boosterUsed
Event count of level_complete + level_failed
Only when boosters property exists and is non-empty

egpUsed
Event count of level_failed
Only when egp > 0

These are event counts, not unique user counts.

winRate        = completes / (completes + fails) × 100
failRate       = fails / (completes + fails) × 100

completionRate = completedPlayers / startedPlayers × 100

apsRaw         = starts / completedPlayers
apsClean       = completes / (completes + fails)

boosterUsage   = boosterUsed / (completes + fails) × 100
egpRate        = egpUsed / fails × 100

Funnel Rate (Authoritative Definition)

Funnel rate is derived at query time, not stored.

funnelRate(level X) =
  completedPlayers(level X) /
  startedPlayers(level 1) × 100
“Out of users who started level 1 during this time range, how many completed level X?”

Notes
Funnel rate is time-window dependent
Users may enter or exit the window at different levels
This behavior is expected and intentional

Database Schema
Table: LevelMetricsDaily
Composite Primary Key

(gameId,
 date,
 levelId,
 levelFunnel,
 levelFunnelVersion,
 platform,
 countryCode,
 appVersion)

starts                   INT
completes                INT
fails                    INT

startedPlayers           INT
completedPlayers         INT

boosterUsed              INT
egpUsed                  INT

totalCompletionDuration  BIGINT
completionCount          INT

totalFailDuration        BIGINT
failCount                INT

Indexes

(gameId, date)

(gameId, levelFunnel, levelFunnelVersion, date)

(platform)

(countryCode)

(appVersion)

Phase 2: Aggregation Service
Service: LevelMetricsAggregationService
Methods

aggregateDailyMetrics(gameId, date)

backfillHistorical(gameId, startDate, endDate)

getGamesWithLevelEvents()

Aggregation Rules

Group raw events by:
levelId,
levelFunnel,
levelFunnelVersion,
platform,
countryCode,
appVersion

Use userId only in-memory to compute daily unique players

Never persist userId

Use UPSERT for idempotent writes

Phase 3: Fast Query (Hybrid Read)
Method: getLevelFunnelDataFast()
Query Flow

Historical Data

Query LevelMetricsDaily

Range: [startDate → yesterday]

Aggregate by levelId

Today (Live Data)

Query raw events

Range: [today 00:00 → now]

Aggregate in memory using the same rules

Merge

Sum historical + today delta

Derive Metrics

winRate, failRate

APS

boosterUsage, egpRate

funnelRate (level 1 as denominator)

Phase 4: Cron Job

Runs daily at 02:00 UTC

For each game:

Aggregate yesterday

Uses UPSERT

Safe to re-run

Phase 5: Controller Update
LevelFunnelController

Use fast aggregated query by default

Keep legacy raw-event query for:

Validation

Debugging

Metric verification

Testing Strategy
Validation

Compare old vs new results for:

Single-day range

7-day range

Filtered queries

Verify funnelRate correctness

Verify APS Clean behavior

Performance

Old query time: ~9.5s

New target: ~250ms

Today-only queries may be slightly slower (acceptable)

Data Retention Policy

Raw events are the source of truth

Do NOT delete raw events

Future option:

Archive old raw events to cold storage (S3 / Parquet)

Keep last N days in Postgres

Accepted Trade-offs

Player counts are range-unique, not lifetime cohorts

Funnel rate reflects time-window progression

Aggregated schema is opinionated and dashboard-focused

Exploratory analytics should use raw events

Files to Create / Modify

prisma/schema.prisma

src/services/LevelMetricsAggregationService.ts

src/jobs/levelMetricsAggregation.ts

src/services/LevelFunnelService.ts

src/controllers/LevelFunnelController.ts

src/index.ts

scripts/backfillLevelMetrics.ts

package.json

Final Notes

Aggregates are optimized for decision dashboards

Raw events remain for exploration and future metrics

This architecture intentionally separates speed from flexibility