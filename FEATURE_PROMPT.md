# Level Funnel Pre-Aggregation Feature Implementation Prompt

## Overview
Implement a pre-aggregation system for Level Funnel queries to improve performance from ~9.5 seconds to ~250ms for historical data queries.

## Problem Statement
- Current Level Funnel dashboard queries take **9.5 seconds** for historical data
- Database: PostgreSQL with ~360K level events
- Users: ~5K currently, scaling to 50K-500K
- Database growth: ~100MB/day (unsustainable at current rate)
- Goal: 38x performance improvement while maintaining calculation accuracy

## Key Constraints
1. **No user ID tracking** - Do NOT store user IDs in database (removes deduplication benefit, wastes space)
2. **Simple count-based calculations** - All metrics should use only player counts and event counts
3. **All filters must still work** - platform, country, appVersion, levelFunnel, levelFunnelVersion
4. **Calculations must match old approach exactly** - Accuracy is critical
5. **Internal tool only** - Max 10 dashboard users, no multi-instance scaling needed
6. **Preserve existing data** - Never delete old events, only add aggregated metrics

## Current System Understanding

### Event Structure
```
Event {
  userId, gameId, sessionId
  eventName: 'level_start' | 'level_complete' | 'level_failed'
  properties: {
    levelId: number
    boosters: { booster_type: count, ... }  // Dictionary
    egp: number  // End Game Purchase count (int)
    ... other properties
  }
  platform: string  // iOS, Android, WebGL
  countryCode: string  // US, TR, MX, etc
  appVersion: string  // 0.1, 0.2, etc
  levelFunnel: string  // live_v1, test_hard, etc
  levelFunnelVersion: number  // 1, 2, 3, etc
}
```

### Old Calculation Logic (Reference)
```
churnStartComplete = (started - completed) / started × 100
churnCompleteNext = (completed - nextLevelStarted) / completed × 100
churnTotal = (started - nextLevelStarted) / started × 100

boosterUsage = boosterEvents / (completes + fails) × 100
egpRate = egpEvents / fails × 100

winRate = completes / (completes + fails) × 100
completionRate = completedPlayers / startedPlayers × 100
failRate = fails / (completes + fails) × 100
funnelRate = completedPlayers / firstLevelCompletedUsers × 100

apsRaw = starts / completedPlayers
apsClean = completes / (completes + fails)  // Filters orphaned starts

meanCompletionDuration = totalCompletionDuration / completionCount
meanFailDuration = totalFailDuration / failCount
```

## Implementation Steps

### Phase 1: Database Schema
1. Create `LevelMetricsDaily` table with:
   - Composite key: (gameId, date, levelId, levelFunnel, levelFunnelVersion, platform, countryCode, appVersion)
   - Fields: starts, completes, fails, startedPlayers, completedPlayers
   - Fields: usersWithBoosters (count of events), failsWithPurchase (count of events)
   - Fields: totalCompletionDuration, completionCount, totalFailDuration, failCount
   - Indexes on gameId, date, platform, countryCode, appVersion, levelFunnel

2. DO NOT store user IDs - only counts are needed

### Phase 2: Aggregation Service
1. Create `LevelMetricsAggregationService`:
   - `aggregateDailyMetrics(gameId, date)` - Aggregates one day's level events
   - `backfillHistorical(gameId, startDate, endDate)` - Backfills historical data
   - `getGamesWithLevelEvents()` - Returns list of games with level data

2. Aggregation Logic:
   - Group raw events by: (levelId, levelFunnel, levelFunnelVersion, platform, countryCode, appVersion)
   - For each group, calculate:
     - Count unique players who started: `startedPlayers`
     - Count unique players who completed: `completedPlayers`
     - Count starts, completes, fails events
     - Count booster events (where boosters dict exists and has entries)
     - Count EGP events (where egp > 0)
     - Sum duration data for mean calculations

3. Store in database using UPSERT (safe for re-runs)

### Phase 3: Fast Query Method
1. Create `getLevelFunnelDataFast()` in LevelFunnelService:
   - Query pre-aggregated data instead of raw events
   - Merge data across dimensions:
     - Group by levelId only
     - Sum: starts, completes, fails, startedPlayers, completedPlayers
     - Sum: usersWithBoosters, failsWithPurchase, duration totals
   - Calculate all metrics using the formulas above
   - Return same LevelMetrics structure as old method

### Phase 4: Cron Job
1. Create job that runs daily at 2 AM UTC
2. Find all games with level events
3. Call `aggregateDailyMetrics()` for previous day
4. Initialize in server startup

### Phase 5: Controller Update
1. Update `LevelFunnelController` to use fast query by default
2. Keep old query method as fallback

## Testing Strategy

### Validation Queries
1. Verify aggregated data exists:
   ```sql
   SELECT COUNT(*) FROM level_metrics_daily WHERE gameId = 'xxx'
   ```

2. Verify counts match:
   ```sql
   SELECT usersWithBoosters, failsWithPurchase FROM level_metrics_daily WHERE usersWithBoosters > 0
   ```

3. Compare old vs new calculation for specific level/date

### Performance Testing
1. Measure old query time: ~9.5 seconds
2. Measure new query time: target ~250ms
3. Verify all filters work correctly

## Success Criteria
- ✅ Fast query returns results in ~250ms (38x improvement)
- ✅ All calculations match old approach exactly
- ✅ All filters (platform, country, version, funnel) still work
- ✅ Churn metrics calculated correctly from player counts only
- ✅ Booster usage and EGP rate show correct percentages
- ✅ APS Clean filters out orphaned starts correctly
- ✅ No compilation errors
- ✅ Backfill script works and can be re-run safely
- ✅ Cron job runs automatically daily

## Important Notes
- **Event counts are the source of truth** - usersWithBoosters and failsWithPurchase are event counts, not unique user counts
- **Booster events** = completes + fails with boosters dictionary
- **EGP events** = fails with egp > 0
- **All aggregations happen on the database** - keep processing in backend to minimum
- **Re-running backfill is safe** - UPSERT ensures no duplicates
- **Keep old method** - For debugging/validation purposes

## Files to Create/Modify
1. `prisma/schema.prisma` - Add LevelMetricsDaily model
2. `src/services/LevelMetricsAggregationService.ts` - NEW aggregation service
3. `src/jobs/levelMetricsAggregation.ts` - NEW cron job
4. `src/services/LevelFunnelService.ts` - Add getLevelFunnelDataFast() method
5. `src/controllers/LevelFunnelController.ts` - Use fast query
6. `src/index.ts` - Initialize cron job on startup
7. `scripts/backfillLevelMetrics.ts` - NEW backfill script
8. `package.json` - Add scripts and dependencies (node-cron, etc)

## Known Issues to Avoid
- DO NOT store user IDs (wastes space, defeats aggregation purpose)
- DO NOT delete old events (only add aggregated metrics)
- DO NOT overcomplicate calculations (use simple counts only)
- DO NOT track unique users per dimension (causes duplication issues)
- DO NOT use real-time query for all data (defeats performance purpose)

