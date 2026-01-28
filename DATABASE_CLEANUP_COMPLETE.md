# Database Cleanup - Redundant Fields Removal

## Date: January 28, 2026

## Summary

Removed 10 redundant/unused fields from Event table based on analysis of 358,239 events.

## Fields Removed

### Geographic Data (7 fields → 1 field)
- ✅ Kept: `countryCode` (ISO 3166-1 alpha-2, e.g., "US")
- 🗑️ Dropped: `country` (duplicate of countryCode)
- 🗑️ Dropped: `region` (98% filled but not used)
- 🗑️ Dropped: `city` (98% filled but not used)
- 🗑️ Dropped: `latitude` (94% filled but not used)
- 🗑️ Dropped: `longitude` (94% filled but not used)
- 🗑️ Dropped: `timezone` (98% filled but not used)

### App Metadata (4 fields)
- 🗑️ Dropped: `bundleId` (not needed)
- 🗑️ Dropped: `engineVersion` (not needed)
- 🗑️ Dropped: `appSignature` (only 4% filled)
- 🗑️ Dropped: `channelId` (53% filled, not used)

## Expected Results

### Immediate Benefits
- **Per Event:** ~80-120 bytes saved (10 fields × ~10 bytes average)
- **Current Data:** ~29-43 MB saved (358k events)
- **Ongoing:** ~10-15 MB/day less growth (assuming 100k events/day)

### Long-term Benefits (1 year)
- **Without cleanup:** ~36 GB database size
- **With cleanup:** ~30-32 GB database size
- **Savings:** ~4-6 GB per year

### Query Performance
- ✅ Slightly faster queries (fewer columns to scan)
- ✅ Smaller indexes
- ✅ Faster backups

## Files Modified

### 1. Schema
- `backend/prisma/schema.prisma` - Removed field definitions

### 2. TypeScript Types
- `backend/src/types/api.ts` - Removed from EventData and DeviceInfo interfaces

### 3. Services
- `backend/src/services/AnalyticsService.ts` - Removed field assignments in trackEvent, trackBatchEvents, getEvents
- `backend/src/services/HealthMetricsService.ts` - Removed from crash log interface

### 4. Controllers
- `backend/src/controllers/HealthMetricsController.ts` - Removed from crash data mapping

## Migration Steps

### Step 1: Deploy Code Changes
```bash
cd /Users/emre/Desktop/MM-Projects/lvlup-backend
git add backend/
git commit -m "Remove redundant Event table fields"
git push
```

Wait for Railway deployment to complete.

### Step 2: Run Database Migration

**Option A: Via pgAdmin (Recommended)**
1. Open pgAdmin and connect to your Railway database
2. Open the SQL file: `backend/prisma/migrations/drop_redundant_columns.sql`
3. Review the commands
4. Execute the migration
5. Verify columns are dropped

**Option B: Via Railway CLI**
```bash
railway run psql $DATABASE_URL < backend/prisma/migrations/drop_redundant_columns.sql
```

**Option C: Via Prisma**
```bash
cd backend
npx prisma db push
```

### Step 3: Verify

Check that columns are gone:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'Event' 
ORDER BY ordinal_position;
```

Should NOT see: country, region, city, latitude, longitude, timezone, bundleId, engineVersion, appSignature, channelId

### Step 4: Monitor

After migration:
- ✅ Check Railway logs for any errors
- ✅ Test event tracking still works
- ✅ Test dashboard loads correctly
- ✅ Monitor database size (should stabilize or slightly decrease)

## Rollback Plan

**If you need to restore these fields:**

1. Revert code changes:
   ```bash
   git revert HEAD
   git push
   ```

2. Re-add columns (will be NULL for all existing events):
   ```sql
   ALTER TABLE "Event" ADD COLUMN "country" TEXT;
   ALTER TABLE "Event" ADD COLUMN "region" TEXT;
   ALTER TABLE "Event" ADD COLUMN "city" TEXT;
   ALTER TABLE "Event" ADD COLUMN "latitude" DOUBLE PRECISION;
   ALTER TABLE "Event" ADD COLUMN "longitude" DOUBLE PRECISION;
   ALTER TABLE "Event" ADD COLUMN "timezone" TEXT;
   ALTER TABLE "Event" ADD COLUMN "bundleId" TEXT;
   ALTER TABLE "Event" ADD COLUMN "engineVersion" TEXT;
   ALTER TABLE "Event" ADD COLUMN "appSignature" TEXT;
   ALTER TABLE "Event" ADD COLUMN "channelId" TEXT;
   ```

**Note:** Old data in dropped columns is LOST and cannot be recovered (unless you have a database backup).

## Data Loss Assessment

### Lost Data
- Geographic details (region, city, lat/long, timezone) for 358k existing events
- bundleId, engineVersion for all existing events  
- appSignature for 14k events (4% of total)
- channelId for 190k events (53% of total)

### Retained Data
- ✅ countryCode (primary geographic identifier)
- ✅ All event metadata (eventName, properties, timestamp)
- ✅ User/device/platform information
- ✅ App version and build info

### Impact
- ❌ **Cannot do city-level analytics** on historical data
- ❌ **Cannot track precise geographic coordinates** for historical events
- ✅ **Country-level analytics still work** (via countryCode)
- ✅ **All core analytics unaffected**

## SDK Compatibility

### Backward Compatible
The SDK can still send these fields, they will just be ignored:
- Existing SDK versions continue working
- No SDK updates required
- Fields are simply not stored

### Future SDK Updates
Consider removing these fields from SDK to reduce payload size:
- Remove latitude/longitude from event tracking
- Remove bundleId, engineVersion from device info
- Keep countryCode for country-level analytics

## Next Steps

1. **Deploy the code changes** (commit and push)
2. **Wait for Railway deployment** (~2-3 minutes)
3. **Run the SQL migration** (via pgAdmin or Railway CLI)
4. **Monitor for 24 hours** (check logs, test dashboard)
5. **Mark as complete** if everything works correctly

---

**Status:** Ready to deploy
**Risk Level:** Low (no data dependencies found in code)
**Estimated Time:** 10 minutes deploy + 5 minutes migration

