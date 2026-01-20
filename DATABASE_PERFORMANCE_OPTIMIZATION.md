# Database Performance Optimization Guide

## Critical Database Indexes for Performance

This document outlines the essential database indexes needed to optimize query performance for the analytics dashboard, especially when dealing with 1000+ users.

## Why Indexes Matter

Without proper indexes, queries will perform **full table scans**, which means:
- Query time grows linearly with data size (O(n))
- With 1000 users × 100 events each = 100,000 events to scan
- Dashboard load time: 5-10 seconds or more
- **With indexes**: Query time becomes logarithmic (O(log n))
- Dashboard load time: < 500ms

## Required Indexes

### 1. Event Table Indexes

These are the most critical since events are queried most frequently:

```sql
-- Composite index for game + timestamp queries (most common)
CREATE INDEX idx_event_game_timestamp ON "Event"("gameId", "timestamp" DESC);

-- Composite index for game + timestamp + userId (for retention queries)
CREATE INDEX idx_event_game_timestamp_user ON "Event"("gameId", "timestamp", "userId");

-- Index for userId lookups
CREATE INDEX idx_event_user ON "Event"("userId");

-- Index for session-based queries
CREATE INDEX idx_event_session ON "Event"("sessionId") WHERE "sessionId" IS NOT NULL;

-- Index for country filtering (analytics)
CREATE INDEX idx_event_country ON "Event"("countryCode") WHERE "countryCode" IS NOT NULL;
```

### 2. Session Table Indexes

```sql
-- Composite index for game + startTime queries
CREATE INDEX idx_session_game_start ON "Session"("gameId", "startTime" DESC);

-- Index for duration queries (analytics)
CREATE INDEX idx_session_duration ON "Session"("gameId", "duration") WHERE "duration" IS NOT NULL;

-- Index for userId lookups
CREATE INDEX idx_session_user ON "Session"("userId");

-- Index for platform filtering
CREATE INDEX idx_session_platform ON "Session"("platform") WHERE "platform" IS NOT NULL;
```

### 3. User Table Indexes

```sql
-- Composite index for game + createdAt (for retention/new user queries)
CREATE INDEX idx_user_game_created ON "User"("gameId", "createdAt" DESC);

-- Unique composite index (should already exist from schema)
-- This handles gameId + externalId lookups efficiently
CREATE UNIQUE INDEX idx_user_game_external ON "User"("gameId", "externalId");

-- Index for platform filtering
CREATE INDEX idx_user_platform ON "User"("platform") WHERE "platform" IS NOT NULL;
```

### 4. Player Checkpoint Indexes (for funnels)

```sql
-- Composite index for game + checkpoint queries
CREATE INDEX idx_checkpoint_game_checkpoint ON "PlayerCheckpoint"("gameId", "checkpointId");

-- Composite index for game + timestamp
CREATE INDEX idx_checkpoint_game_timestamp ON "PlayerCheckpoint"("gameId", "timestamp" DESC);

-- Index for userId lookups
CREATE INDEX idx_checkpoint_user ON "PlayerCheckpoint"("userId");
```

## How to Apply These Indexes

### For PostgreSQL (Production)

1. Connect to your database
2. Run each CREATE INDEX command
3. Indexes will be created in the background (won't lock the table)

### For Prisma Schema

Add these to your `schema.prisma` file:

```prisma
model Event {
  // ... existing fields ...

  @@index([gameId, timestamp(sort: Desc)])
  @@index([gameId, timestamp, userId])
  @@index([userId])
  @@index([sessionId])
  @@index([countryCode])
}

model Session {
  // ... existing fields ...

  @@index([gameId, startTime(sort: Desc)])
  @@index([gameId, duration])
  @@index([userId])
  @@index([platform])
}

model User {
  // ... existing fields ...

  @@index([gameId, createdAt(sort: Desc)])
  @@unique([gameId, externalId])
  @@index([platform])
}

model PlayerCheckpoint {
  // ... existing fields ...

  @@index([gameId, checkpointId])
  @@index([gameId, timestamp(sort: Desc)])
  @@index([userId])
}
```

Then run:
```bash
npx prisma migrate dev --name add_performance_indexes
```

## Expected Performance Improvements

### Before Indexes (1000 users, 100k events):
- Dashboard load: 5-10 seconds
- Retention query: 3-5 seconds (1000+ individual queries)
- Active users query: 2-3 seconds
- **Total**: 10-18 seconds

### After Indexes + Optimizations:
- Dashboard load: 0.3-0.8 seconds (first load)
- Retention query: 0.2-0.5 seconds (batch query with index)
- Active users query: 0.1-0.3 seconds
- **With cache**: 0.05-0.1 seconds (subsequent loads)
- **Total improvement**: 95-98% faster

## Cache Strategy

### Backend Cache (In-Memory)
- **Dashboard Summary**: 5 minutes TTL
- **Retention Data**: 10 minutes TTL (most expensive)
- **Active Users**: 5 minutes TTL
- **Player Journey**: 15 minutes TTL

### Why These TTLs?
- Balance between performance and data freshness
- Most analytics dashboards don't need real-time data
- Users won't notice 5-10 minute delay in metrics
- Can be adjusted per business needs

### Cache Invalidation
- Time-based expiration (TTL)
- Manual invalidation via API endpoint (future)
- Different cache keys per date range

## Monitoring Query Performance

### Check if indexes are being used:

```sql
-- PostgreSQL
EXPLAIN ANALYZE SELECT * FROM "Event" WHERE "gameId" = 'xxx' AND "timestamp" > '2024-01-01';

-- Look for "Index Scan" in the output
-- Avoid "Seq Scan" (full table scan)
```

### Monitor slow queries:

```sql
-- Enable slow query logging in PostgreSQL
ALTER DATABASE your_db SET log_min_duration_statement = 1000; -- Log queries > 1 second
```

## Additional Optimization Tips

1. **Limit Date Ranges**: Default to 30 days, warn users about >90 days
2. **Pagination**: Add pagination to chart data (30-90 data points max)
3. **Progressive Loading**: Load summary first, then charts
4. **Background Refresh**: Use stale-while-revalidate pattern
5. **Database Connection Pooling**: Already handled by Prisma

## Future Optimizations (10,000+ users)

When you reach 10,000+ users, consider:

1. **Materialized Views**: Pre-aggregate daily metrics
2. **Redis Cache**: Replace in-memory cache with Redis
3. **Read Replicas**: Separate read/write databases
4. **Data Warehouse**: Move old data to separate analytics database
5. **Incremental Updates**: Update aggregates incrementally instead of full recalculation

## Testing Performance

Use these queries to test performance:

```typescript
// Test with timing
console.time('Dashboard Load');
const data = await AnalyticsService.getDashboardSummary(gameId, startDate, endDate);
console.timeEnd('Dashboard Load');
```

## Troubleshooting

### Still slow after adding indexes?

1. **Check if indexes exist**:
   ```sql
   SELECT * FROM pg_indexes WHERE tablename = 'Event';
   ```

2. **Analyze table statistics**:
   ```sql
   ANALYZE "Event";
   ```

3. **Check query plans**:
   ```sql
   EXPLAIN ANALYZE your_slow_query;
   ```

4. **Monitor cache hit rate**:
   - Add logging to see cache hits vs misses
   - Adjust TTLs based on hit rate

### Database connection issues?

- Check Prisma connection pool settings
- Default is 10 connections, may need to increase for high traffic
- Set in `DATABASE_URL`: `?connection_limit=20`

## Summary

Applying these indexes and optimizations will provide:
- **95-98% faster dashboard loads**
- **Reduced database load** by 80-90%
- **Better user experience** with <1 second load times
- **Scalability** to handle 10,000+ users

Start with the indexes, then add caching, then optimize queries. This gives you the biggest bang for your buck.

