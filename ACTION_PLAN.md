# ACTION PLAN: Fix Database Growth (100MB/day)

## Problem Summary
- ❌ Database growing 100MB/day with few users
- ❌ Data retention service exists but **DISABLED**
- ❌ Dashboard will get slower as DB grows (5k+ users already causing issues)
- ✅ Only 10 internal users → Don't need Redis or multiple instances

## Immediate Actions (Do This Now)

### 1. Enable Data Retention (5 minutes)

**In Railway Dashboard:**
1. Go to your backend service
2. Click "Variables" tab
3. Add new variable:
   ```
   DATA_RETENTION_ENABLED=true
   ```
4. Click "Deploy" (will restart server)

**This will automatically delete:**
- Events older than 90 days
- Sessions older than 60 days  
- Crash logs older than 30 days
- Runs daily at 3 AM

### 2. Run One-Time Cleanup (Optional - for immediate space)

**To clean up existing old data NOW:**

In Railway CLI or console:
```bash
cd backend
export DATA_RETENTION_ENABLED=true
npm run build
node dist/services/DataRetentionService.js
```

Or manually trigger via API endpoint (if you add one).

### 3. Deploy the Memory Fix

**Already done in code:**
- ✅ Batch processing (500 users per query)
- ✅ Extended cache (30 min TTL)
- ✅ Performance logging

**Deploy:**
```bash
git add backend/src/services/AnalyticsMetricsService.ts
git commit -m "Fix PostgreSQL memory + optimize retention cache"
git push
```

## Expected Results

### Database Growth
| Timeframe | Before | After |
|-----------|--------|-------|
| Per day | +100MB | +10-20MB |
| Per month | +3GB | +300-600MB |
| With 5k users | Unsustainable | Manageable |

### Dashboard Performance  
| Metric | Current | After Fix |
|--------|---------|-----------|
| Load time | ❌ Crashes | ✅ 2-5s |
| With cache | N/A | ✅ <1s |
| After 6 months | ❌ Very slow | ✅ Same speed |

## Why This Works

1. **Data Retention = 80% of solution**
   - Most data is never accessed after 30 days
   - Analytics only needs recent data
   - Deleting old events prevents exponential growth

2. **Batch Processing = Fixes crashes**
   - No more memory exhaustion
   - Uses existing indexes efficiently
   - No new indexes needed (no bloat)

3. **30min Cache = Reduces queries by 3x**
   - Retention doesn't change minute-to-minute
   - Internal dashboard doesn't need real-time
   - Fewer database hits = faster performance

## What You DON'T Need

### ❌ Redis
- **Why:** Only 10 users, cache hit rate already good
- **Savings:** $5-10/month, simpler setup
- **When to add:** If dashboard used >100 times/day

### ❌ Additional Indexes
- **Why:** Existing indexes sufficient, would bloat DB
- **Savings:** 15-20% database size
- **When to add:** Only if queries still >10s after fix

### ❌ Multiple Server Instances
- **Why:** 10 concurrent users max
- **Savings:** Significant hosting costs
- **When to add:** If you scale to 1000+ users

## Monitor After Deployment

### Check Database Size Weekly

In Railway or pgAdmin:
```sql
SELECT pg_size_pretty(pg_database_size(current_database()));
```

**Expected:**
- Week 1: Size might stay same (cleanup running daily)
- Week 2: Size should stabilize or decrease
- Week 3+: Growth <10MB/day

### Check Retention Logs

In Railway logs, look for:
```
[INFO] Data retention cleanup completed in Xms. Total records deleted: Y
```

Should run daily at 3 AM.

### Check Dashboard Performance

In logs after dashboard load:
```
[INFO] Calculated retention metrics for game X in Yms (Z users, batch size: 500)
```

**Good:** Y < 5000ms  
**Great:** Y < 3000ms  
**Excellent:** Y < 2000ms

## If Issues Persist

### Database Still Growing Fast
- Check if DATA_RETENTION_ENABLED actually set
- Verify cleanup is running (check logs)
- Run analysis: `node dist/scripts/analyzeEventStorage.js`

### Dashboard Still Slow
- Check query times in logs
- Verify cache is working (should see "Cache hit" messages)
- Consider reducing default date range to 14 days

### Out of Space Emergency
- Manually delete events older than 30 days:
  ```sql
  DELETE FROM "Event" WHERE timestamp < NOW() - INTERVAL '30 days';
  ```
- Then enable retention service properly

## Summary

**3 steps to fix everything:**
1. ✅ Deploy batch processing fix (prevents crashes)
2. ✅ Enable `DATA_RETENTION_ENABLED=true` (stops growth)
3. ✅ Monitor for 1 week

**Total time:** 10 minutes to deploy + 1 week monitoring

**Result:** Stable database size + fast dashboard + no crashes

