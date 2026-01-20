# How Session Filters Work in LvlUp Backend

## Overview
The system currently supports filtering sessions by **session length**, **session count**, and several other dimensions. These filters are applied through query parameters in the analytics API endpoints.

---

## Available Filter Parameters

### 1. **Date Range Filters**
- `startDate` - Start date in ISO format (YYYY-MM-DD)
- `endDate` - End date in ISO format (YYYY-MM-DD)
- **Default**: Last 30 days if not provided

### 2. **Demographic Filters**
- `country` - Country or countries to filter by (can be single value or comma-separated list)
  - Example: `country=Mexico` or `country=Mexico,US,TR`
  - Uses `countryCode` field from events
  
- `platform` - Platform or platforms to filter by (can be single value or comma-separated list)
  - Example: `platform=android` or `platform=android,ios`
  
- `version` - App version or versions to filter by (can be single value or comma-separated list)
  - Example: `version=1.0.0` or `version=1.0.0,1.0.1`

### 3. **Session-Specific Filters**
- **Session Duration Filter** - Automatically applied in cohort analytics
  - Only includes sessions with `duration > 0` seconds
  - Implemented in: `CohortAnalyticsService` and `EngagementMetricsService`
  
- **Session Count** - Calculated metrics per user per day
  - Shows distribution: `1`, `2-5`, `6-10`, `10+` sessions per user

### 4. **Grouping & Aggregation**
- `groupBy` - Optional grouping: `"day"`, `"week"`, `"month"`
- `days` - Comma-separated list of specific days to analyze
  - Example: `days=0,1,3,7,14,30` (for cohort analysis)
- `durationType` - Type of duration metric: `"average"`, `"total"`, `"distribution"`, `"all"`

---

## API Endpoints Using These Filters

### 1. **Session Count Metrics**
**Endpoint**: `GET /api/analytics/metrics/session-count`

**Query Parameters**:
```
?startDate=2026-01-01
&endDate=2026-01-19
&country=Mexico,US
&platform=android
&version=1.0.0
&days=1,7,14,30
&groupBy=day
```

**What it does**:
- Calculates how many sessions users have per day
- Returns average, median, and distribution (1, 2-5, 6-10, 10+)
- Groups sessions by userId and counts them

**Implementation**: `EngagementMetricsService.calculateSessionCounts()`

---

### 2. **Session Length Metrics**
**Endpoint**: `GET /api/analytics/metrics/session-length`

**Query Parameters**:
```
?startDate=2026-01-01
&endDate=2026-01-19
&country=Mexico
&platform=android
&version=1.0.0
&durationType=all
```

**What it does**:
- Calculates session duration metrics per day
- Returns average, median, total duration
- Provides distribution: `<1min`, `1-5min`, `5-15min`, `15-30min`, `30min+`
- **Automatically filters out sessions with null or zero duration**

**Implementation**: `EngagementMetricsService.calculateSessionLengths()`

**Session Length Filtering Logic**:
```typescript
const baseFilters = {
    gameId: gameId,
    endTime: { not: null },    // Only completed sessions
    duration: { not: null }     // Only sessions with duration
};
```

---

### 3. **Cohort Session Count**
**Endpoint**: `GET /api/analytics/cohort/session-count`

**Query Parameters**:
```
?startDate=2026-01-01
&endDate=2026-01-19
&country=Mexico
&platform=android
&version=1.0.0
&days=0,1,3,7,14,30
```

**What it does**:
- Cohort-based analysis of session count
- Tracks average sessions per user on specific days after signup (Day 0, 1, 3, 7, 14, 30)
- **Automatically excludes sessions with duration = 0**

**Implementation**: `CohortAnalyticsService.calculateCohortSessionCount()`

**Duration Filter**:
```typescript
const sessionFilters = {
    userId: { in: userIds },
    gameId: gameId,
    startTime: { gte: targetDateStart, lte: targetDateEnd },
    duration: { gt: 0 } // ⚠️ Exclude zero-duration sessions
};
```

---

### 4. **Cohort Session Length**
**Endpoint**: `GET /api/analytics/cohort/session-length`

**Query Parameters**:
```
?startDate=2026-01-01
&endDate=2026-01-19
&country=Mexico
&platform=android
&version=1.0.0
&days=0,1,3,7,14,30
```

**What it does**:
- Cohort-based analysis of session duration
- Tracks average session duration on specific days after signup
- **Automatically excludes sessions with duration = 0**

**Implementation**: `CohortAnalyticsService.calculateCohortSessionLength()`

**Duration Filter**:
```typescript
const sessionFilters = {
    userId: { in: userIds },
    gameId: gameId,
    startTime: { gte: targetDateStart, lte: targetDateEnd },
    duration: { gt: 0 } // ⚠️ Exclude zero-duration sessions
};
```

---

## Database Schema Relationships

Understanding how sessions relate to country data:

```
┌─────────┐      ┌─────────┐      ┌─────────┐
│  Game   │──┐   │  User   │──┐   │ Event   │
└─────────┘  │   └─────────┘  │   └─────────┘
             │   ├─ id       │   ├─ countryCode ✓
             │   ├─ country  │   ├─ platform
             │   ├─ platform │   ├─ appVersion
             │   └─ version  │   └─ sessionId
             │                │
             │   ┌─────────┐  │
             └──→│ Session │←─┘
                 └─────────┘
                 ├─ userId
                 ├─ duration
                 ├─ platform
                 ├─ version
                 └─ NO country field!
```

**Key Relationships:**
- `Session.userId` → `User.id` (many-to-one)
- `User.id` → `Event.userId` (one-to-many)
- `Event.countryCode` contains the actual country data used for filtering

**Why Events Store Country Data:**
- Events capture the user's location at the time of the event
- More reliable than user-level country (which may be stale or missing)
- Allows filtering by where users actually play, not just where they signed up

---

## How Filters Are Applied in Code

### Country Filter - The Relationship Chain

**🔑 KEY CONCEPT**: Sessions don't store country data directly. Country filtering works like this:

```
QUESTION: "Get sessions from Mexico users"
         ↓
STEP 1:  Find users who have events with countryCode = 'MX'
         ↓
STEP 2:  Get ALL sessions from those users
         ↓
RESULT:  Sessions from "Mexico users" (users who have played from Mexico)
```

**Data Flow**:
```
Session → User → Event → countryCode
```

Sessions link to Users, Users have Events, Events store the actual country data.

---

**Important**: Sessions don't have a `country` field directly. Country filtering works through a relationship chain:

```
Session → User → Event → countryCode
```

**The Process:**

1. **First**: Filter users by their events' country codes
   ```typescript
   const userFilters: any = {};
   
   if (filters?.country) {
       // Find users who have AT LEAST ONE event from these countries
       userFilters.events = {
           some: {
               countryCode: Array.isArray(filters.country)
                   ? { in: filters.country }
                   : filters.country
           }
       };
   }
   ```

2. **Then**: Filter sessions by those users
   ```typescript
   const sessionFilters = {
       gameId: gameId,
       startTime: { gte: dayStart, lte: dayEnd },
       // This attaches the user filter to the session query
       user: userFilters  // ← Links sessions to filtered users
   };
   
   const sessions = await prisma.session.findMany({
       where: sessionFilters
   });
   ```

**What this means in SQL (conceptually)**:
```sql
SELECT s.*
FROM sessions s
INNER JOIN users u ON s.userId = u.id
WHERE s.gameId = 'xxx'
  AND s.startTime BETWEEN 'start' AND 'end'
  AND EXISTS (
    SELECT 1 FROM events e 
    WHERE e.userId = u.id 
    AND e.countryCode IN ('MX', 'US', 'TR')
  );
```

**Key Points:**
- Uses Prisma's nested relation filtering (`user: { events: { some: {...} } }`)
- A user is included if they have **at least one event** from the filtered countries
- All sessions from that user are then included
- Uses `countryCode` field from events (ISO codes like "MX", "US", "TR")

**Note**: The `User` table has a `country` field, but it's not reliably populated. Event-based country filtering is more accurate because country data is captured with each event.

---

### Practical Example: Filtering Sessions by Country

Let's say you want to find all sessions from Mexico users on January 19, 2026.

**Step 1**: Find users who have events from Mexico
```typescript
// This finds users who have AT LEAST ONE event with countryCode = 'MX'
const mexicoUsers = await prisma.user.findMany({
    where: {
        gameId: 'cmk1phl2o0001pb1k2ubtq0fo',
        events: {
            some: {
                countryCode: 'MX'  // or 'Mexico'
            }
        }
    }
});
// Result: [user1, user2, user3, ...]
```

**Step 2**: Find ALL sessions from those users (on the specific date)
```typescript
// This gets ALL sessions from the Mexico users
const sessions = await prisma.session.findMany({
    where: {
        gameId: 'cmk1phl2o0001pb1k2ubtq0fo',
        startTime: {
            gte: new Date('2026-01-19T00:00:00Z'),
            lte: new Date('2026-01-19T23:59:59Z')
        },
        duration: { gt: 0 },
        // Prisma nested filtering - links to users with Mexico events
        user: {
            events: {
                some: {
                    countryCode: 'MX'
                }
            }
        }
    }
});
```

**Important Implications:**

1. **User-Level Filtering**: Once a user has ANY event from Mexico, ALL their sessions are included (as long as they match other filters like date/platform)

2. **Session-Level Country**: Sessions themselves don't store country. The country filter is a user-level attribute derived from their events.

3. **Edge Case**: If a user travels from Mexico to USA:
   - All their sessions will be included in "Mexico" filter (because they have Mexico events)
   - All their sessions will ALSO be included in "USA" filter (because they have USA events)
   - This is by design - it's user-centric, not session-centric

4. **Accuracy**: This approach assumes users primarily play from one country. For most mobile games, this is true.

---

### Alternative Approach: Session-Level Country Filtering

If you need more precise session-level country filtering, you would need to:

1. **Add country field to Session table** (requires schema change)
2. **OR use Event-based approach**: Filter sessions by events that occurred DURING that session from that country

Currently, the system uses the simpler user-level approach, which works well for cohort analysis where you're tracking "users from Mexico" over time.

### Platform & Version Filters
Applied directly to session queries:

```typescript
// Platform filter
if (filters?.platform) {
    sessionFilters.platform = Array.isArray(filters.platform)
        ? { in: filters.platform }
        : filters.platform;
}

// Version filter
if (filters?.version) {
    sessionFilters.version = Array.isArray(filters.version)
        ? { in: filters.version }
        : filters.version;
}
```

### Duration Filter (Implicit)
All cohort and engagement metrics **automatically exclude zero-duration sessions**:

```typescript
// In session queries
duration: { gt: 0 }  // Greater than 0 seconds

// OR for null safety
duration: { not: null, gt: 0 }

// OR for completed sessions
endTime: { not: null },
duration: { not: null }
```

---

## Example API Calls

### 1. Get session counts for Mexico users on Android
```bash
GET /api/analytics/metrics/session-count?country=Mexico&platform=android&startDate=2026-01-01&endDate=2026-01-19
```

### 2. Get session length distribution for multiple countries
```bash
GET /api/analytics/metrics/session-length?country=Mexico,US,TR&durationType=distribution&startDate=2026-01-01&endDate=2026-01-19
```

### 3. Get cohort session count for Day 0, 1, 7, 14, 30
```bash
GET /api/analytics/cohort/session-count?country=Mexico&days=0,1,7,14,30&startDate=2026-01-01&endDate=2026-01-19
```

### 4. Get unique users with sessions > 0 seconds (SQL)
```sql
-- Your specific use case from the earlier query
SELECT COUNT(DISTINCT s."userId") AS unique_user_count
FROM "sessions" s
INNER JOIN "users" u ON s."userId" = u.id
WHERE s."gameId" = 'cmk1phl2o0001pb1k2ubtq0fo'
  AND u."country" IN ('Mexico', 'MX')
  AND s."duration" > 0
  AND s."startTime" >= '2026-01-19 00:00:00'
  AND s."startTime" < '2026-01-20 00:00:00';
```

---

## Filter Options Endpoint

**Endpoint**: `GET /api/analytics/filters/options`

This endpoint returns all available filter values:
```json
{
  "success": true,
  "data": {
    "countries": ["MX", "US", "TR", "BR"],
    "platforms": ["android", "ios", "webgl"],
    "versions": ["1.0.0", "1.0.1", "1.0.2"]
  }
}
```

**Use this endpoint to populate filter dropdowns in your UI**

---

## Session Length Distribution Buckets

When you query session length with `durationType=distribution`, you get:

```typescript
{
  '<1min': 150,      // Sessions < 60 seconds
  '1-5min': 230,     // Sessions 60-299 seconds
  '5-15min': 180,    // Sessions 300-899 seconds
  '15-30min': 90,    // Sessions 900-1799 seconds
  '30min+': 45       // Sessions >= 1800 seconds
}
```

## Session Count Distribution Buckets

When you query session count, you get:

```typescript
{
  '1': 120,         // Users with exactly 1 session
  '2-5': 85,        // Users with 2-5 sessions
  '6-10': 40,       // Users with 6-10 sessions
  '10+': 25         // Users with 10+ sessions
}
```

---

## Important Notes

1. **Duration = 0 is Automatically Filtered**
   - All cohort analytics endpoints filter out sessions with `duration = 0`
   - This is hardcoded in `CohortAnalyticsService`

2. **Country Field Naming**
   - User table has `country` field (may contain full name like "Mexico")
   - Event table has `countryCode` field (ISO codes like "MX")
   - Filters use `countryCode` from events for more reliable filtering

3. **Date Handling**
   - All dates are converted to full day ranges (00:00:00 - 23:59:59.999)
   - Dates are in UTC timezone

4. **Multiple Values**
   - All filters support comma-separated values
   - Backend automatically splits and converts to array for `IN` queries

5. **Session State**
   - Session length metrics only include completed sessions (`endTime != null`)
   - Session count metrics include all sessions (ongoing and completed)

---

## Files to Reference

- **Routes**: `/backend/src/routes/analytics-enhanced.ts`
- **Controllers**: 
  - `/backend/src/controllers/EngagementMetricsController.ts`
  - `/backend/src/controllers/CohortAnalyticsController.ts`
- **Services**: 
  - `/backend/src/services/EngagementMetricsService.ts`
  - `/backend/src/services/CohortAnalyticsService.ts`
- **Types**: `/backend/src/types/api.ts`

