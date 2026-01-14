# Level Funnel Implementation Plan

## 📋 Feature Overview

**Level Funnel** - Shows progression metrics across game levels with player counts, success rates, churn, and custom game-specific metrics.

### Visual Layout
```
┌────────────┬──────────┬──────────┬──────────┬──────────┬──────────┬─────────┐
│ Level      │ Players  │ Win Rate │ Fail Rate│ Churn    │ APS      │ Avg Time│
├────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼─────────┤
│ Level 1    │ 10,000   │ 85%      │ 15%      │ 15%      │ 1.2      │ 45s     │
│ Level 2    │ 8,500    │ 84.7%    │ 15.3%    │ 10%      │ 1.3      │ 52s     │
│ Level 3    │ 7,200    │ 84.7%    │ 20%      │ 14.5%    │ 1.5      │ 58s     │
└────────────┴──────────┴──────────┴──────────┴──────────┴──────────┴─────────┘
```

---

## 🎯 Metric Definitions (Confirmed)

### Core Metrics

1. **Players** - Unique users who started this level
2. **Win Rate** - (Completed levels / Started levels) × 100
3. **Fail Rate** - (Fail events / Start events) × 100
4. **APS (Attempts Per Success)** - Average level_start events per user per level
   - User with 1 start + 1 complete + 0 fails = APS of 1
   - User with 3 starts + 2 fails + 1 complete = APS of 3
5. **Level Churn (Start-Complete)** - % of users who started but never completed
   - (Users with start but no complete) / (Total users who started) × 100
6. **Level Churn (Complete-Next Start)** - % of users who completed level N but never started N+1
   - (Users who completed N but didn't start N+1) / (Users who completed N) × 100
7. **Mean Completion Duration** - Average time from level_start to level_complete (success)
8. **Mean Fail Duration** - Average time from level_start to level_failed
9. **Booster Usage %** - (Users who used boosters / Total users) × 100
10. **EGP (End Game Purchase) %** - (Users who made revive purchase / Users who failed) × 100

### Custom Metrics (Configurable)
- Pre-game boosters selected
- Coins earned from level
- Power-ups used
- etc.

---

## 📊 Data Structure

### Event Types
```typescript
// From Unity SDK
- level_start: { levelId, levelName?, ...custom }
- level_complete: { levelId, score, timeSeconds, stars?, boosters?, coins?, ...custom }
- level_failed: { levelId, reason, timeSeconds, attempts?, egp?, ...custom }
```

### Database Schema (Existing)
```prisma
model Event {
  eventName  String   // "level_start", "level_complete", "level_failed"
  properties Json     // { levelId, score, timeSeconds, boosters, etc }
  timestamp  DateTime
  userId     String
  gameId     String
  country    String?
  appVersion String?
  // ... other metadata
}
```

---

## 🏗️ Implementation Breakdown

### Phase 1: Backend API

#### 1.1 Create Level Funnel Service
**File**: `backend/src/services/LevelFunnelService.ts`

**Methods**:
- `getLevelFunnelData(gameId, filters)` - Main funnel query
- `calculateLevelMetrics(gameId, levelId, filters)` - Per-level metrics
- `getAPS(gameId, levelId, filters)` - Attempts per success
- `getChurnMetrics(gameId, levelId, filters)` - Churn calculations
- `getBoosterUsage(gameId, levelId, filters)` - Booster stats
- `getEGPRate(gameId, levelId, filters)` - End game purchase rate
- `getCustomMetrics(gameId, levelId, customFields)` - Custom properties

**Query Strategy**:
```sql
-- Get all level events grouped by level
SELECT 
  JSON_EXTRACT(properties, '$.levelId') as levelId,
  COUNT(DISTINCT userId) as uniquePlayers,
  COUNT(CASE WHEN eventName = 'level_start' THEN 1 END) as starts,
  COUNT(CASE WHEN eventName = 'level_complete' THEN 1 END) as completes,
  COUNT(CASE WHEN eventName = 'level_failed' THEN 1 END) as fails
FROM events
WHERE gameId = ? AND eventName IN ('level_start', 'level_complete', 'level_failed')
GROUP BY levelId
ORDER BY levelId
```

#### 1.2 Create Level Funnel Controller
**File**: `backend/src/controllers/LevelFunnelController.ts`

**Endpoints**:
- `GET /api/analytics/level-funnel` - Get full funnel data
  - Query params: `gameId, startDate, endDate, country, version, cohort, abTest`
- `GET /api/analytics/level-funnel/:levelId` - Get specific level details
- `GET /api/analytics/level-funnel/custom-metrics` - Get available custom metrics

#### 1.3 Create Routes
**File**: `backend/src/routes/level-funnel.ts`

#### 1.4 Add Filters Support
- Date range (startDate, endDate)
- Geography (country)
- App version (version)
- Cohort (install date cohort)
- AB Test variant (if experiments exist)

---

### Phase 2: Frontend Components

#### 2.1 Level Funnel Page
**File**: `frontend/src/components/LevelFunnel.tsx`

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│ 📊 Level Funnel                                    [Export] │
├─────────────────────────────────────────────────────────────┤
│ Filters: [Date Range] [Country] [Version] [AB Test]        │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────┐   │
│ │ Level Progression Table                               │   │
│ │ ┌─────┬────────┬─────────┬──────────┬────────┬──────┐│   │
│ │ │Level│Players │Win Rate │Fail Rate │Churn   │APS   ││   │
│ │ ├─────┼────────┼─────────┼──────────┼────────┼──────┤│   │
│ │ │  1  │ 10,000 │  85%    │  15%     │  15%   │ 1.2  ││   │
│ │ │  2  │  8,500 │  84.7%  │  15.3%   │  10%   │ 1.3  ││   │
│ │ └─────┴────────┴─────────┴──────────┴────────┴──────┘│   │
│ └───────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────┐   │
│ │ Funnel Visualization (Drop-off chart)                 │   │
│ │   10K ──▶ 8.5K ──▶ 7.2K ──▶ 6.1K ──▶ 5.4K           │   │
│ │   Level 1  Level 2  Level 3  Level 4  Level 5         │   │
│ └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### 2.2 Sub-Components
- `LevelFunnelTable.tsx` - Main data table
- `LevelFunnelFilters.tsx` - Filter controls
- `LevelFunnelChart.tsx` - Visual funnel chart
- `LevelDetailModal.tsx` - Drill-down into specific level
- `CohortBreakdown.tsx` - AB test variant comparison

#### 2.3 Custom Metrics Configuration
**File**: `frontend/src/components/LevelFunnelSettings.tsx`
- Allow adding/removing columns
- Save preferences per game

---

### Phase 3: Data Processing

#### 3.1 Calculations

**APS (Attempts Per Success)**:
```typescript
// For each user who completed a level:
// Count their level_start events for that level
// Average across all completing users
APS = totalStarts / uniqueCompletions
```

**Churn (Start-Complete)**:
```typescript
// Users who started but never completed
usersWithStart = COUNT(DISTINCT userId WHERE eventName = 'level_start')
usersWithComplete = COUNT(DISTINCT userId WHERE eventName = 'level_complete')
churnStartComplete = (usersWithStart - usersWithComplete) / usersWithStart * 100
```

**Churn (Complete-Next)**:
```typescript
// Users who completed level N but didn't start N+1
completedN = COUNT(DISTINCT userId WHERE eventName = 'level_complete' AND levelId = N)
startedN1 = COUNT(DISTINCT userId WHERE eventName = 'level_start' AND levelId = N+1)
churnCompleteNext = (completedN - startedN1) / completedN * 100
```

**Booster Usage**:
```typescript
// From properties in level_complete/level_failed
usersWithBoosters = COUNT(DISTINCT userId WHERE properties.boosters > 0)
totalUsers = COUNT(DISTINCT userId)
boosterUsage = usersWithBoosters / totalUsers * 100
```

**EGP (End Game Purchase)**:
```typescript
// From properties in level_failed
usersWithEGP = COUNT(DISTINCT userId WHERE properties.egp = true)
totalFails = COUNT(DISTINCT userId WHERE eventName = 'level_failed')
egpRate = usersWithEGP / totalFails * 100
```

---

## 🔄 AB Test / Cohort Breakdown

When AB test selected:
```
┌────────────┬──────────────────────────┬──────────────────────────┐
│ Level      │ Variant A                │ Variant B                │
│            │ Win Rate │ APS │ Churn   │ Win Rate │ APS │ Churn   │
├────────────┼──────────┼─────┼─────────┼──────────┼─────┼─────────┤
│ Level 1    │ 85%      │ 1.2 │ 15%     │ 87%      │ 1.1 │ 13%     │
│ Level 2    │ 84.7%    │ 1.3 │ 10%     │ 86%      │ 1.2 │ 8%      │
└────────────┴──────────┴─────┴─────────┴──────────┴─────┴─────────┘
```

---

## 📋 Task Breakdown

### Backend Tasks

| # | Task | File | Estimated Time |
|---|------|------|----------------|
| 1 | Create LevelFunnelService base | `services/LevelFunnelService.ts` | 2h |
| 2 | Implement level metrics calculations | LevelFunnelService | 3h |
| 3 | Implement APS calculation | LevelFunnelService | 1h |
| 4 | Implement churn calculations | LevelFunnelService | 2h |
| 5 | Implement booster/EGP metrics | LevelFunnelService | 1h |
| 6 | Add filter support (date, geo, version) | LevelFunnelService | 2h |
| 7 | Add AB test cohort breakdown | LevelFunnelService | 2h |
| 8 | Create LevelFunnelController | `controllers/LevelFunnelController.ts` | 1h |
| 9 | Create routes | `routes/level-funnel.ts` | 0.5h |
| 10 | Add custom metrics support | LevelFunnelService | 2h |
| 11 | Write unit tests | `tests/LevelFunnelService.test.ts` | 2h |

**Backend Total: ~18.5 hours**

### Frontend Tasks

| # | Task | File | Estimated Time |
|---|------|------|----------------|
| 12 | Create LevelFunnel page | `components/LevelFunnel.tsx` | 1h |
| 13 | Create LevelFunnelTable component | `components/LevelFunnelTable.tsx` | 3h |
| 14 | Create LevelFunnelFilters | `components/LevelFunnelFilters.tsx` | 2h |
| 15 | Create LevelFunnelChart (visualization) | `components/LevelFunnelChart.tsx` | 2h |
| 16 | Implement level detail drill-down | `components/LevelDetailModal.tsx` | 2h |
| 17 | Implement AB test breakdown view | `components/CohortBreakdown.tsx` | 2h |
| 18 | Add custom metrics configuration | `components/LevelFunnelSettings.tsx` | 2h |
| 19 | Add export functionality (CSV) | LevelFunnel.tsx | 1h |
| 20 | API integration & state management | `services/levelFunnelApi.ts` | 2h |
| 21 | Styling & responsive design | CSS/Tailwind | 2h |
| 22 | Add to navigation | `App.tsx` / Layout | 0.5h |

**Frontend Total: ~19.5 hours**

### Testing & Polish

| # | Task | Estimated Time |
|---|------|----------------|
| 23 | Backend API testing with real data | 2h |
| 24 | Frontend integration testing | 2h |
| 25 | Performance optimization (large datasets) | 2h |
| 26 | Documentation | 1h |

**Testing Total: ~7 hours**

---

## 🎯 Total Estimate: ~45 hours (5-6 days)

---

## 🚀 Implementation Order

### Phase 1: Core Backend (Day 1-2)
1. Create service structure
2. Implement basic level metrics
3. Add filters
4. Create controller & routes
5. Test with sample data

### Phase 2: Core Frontend (Day 3-4)
1. Create page structure
2. Implement table component
3. Add filters UI
4. Connect to API
5. Basic styling

### Phase 3: Advanced Features (Day 5)
1. AB test breakdown
2. Custom metrics
3. Visualization chart
4. Export functionality

### Phase 4: Polish & Test (Day 6)
1. Testing with production data
2. Performance optimization
3. Bug fixes
4. Documentation

---

## 🔍 Sample API Response

```json
{
  "success": true,
  "data": {
    "levels": [
      {
        "levelId": 1,
        "levelName": "Tutorial",
        "players": 10000,
        "winRate": 85.0,
        "failRate": 15.0,
        "churnStartComplete": 15.0,
        "churnCompleteNext": 10.0,
        "aps": 1.2,
        "meanCompletionDuration": 45.3,
        "meanFailDuration": 32.1,
        "boosterUsage": 23.5,
        "egpRate": 12.3,
        "customMetrics": {
          "preGameBoosters": 15.2,
          "coinsEarned": 1234
        }
      },
      {
        "levelId": 2,
        "players": 8500,
        "winRate": 84.7,
        // ... etc
      }
    ],
    "filters": {
      "dateRange": { "start": "2026-01-01", "end": "2026-01-14" },
      "country": null,
      "version": null,
      "abTest": null
    },
    "totalPlayers": 10000,
    "totalLevels": 50
  }
}
```

---

## ✅ Ready to Start?

This plan covers:
- ✅ All metric definitions clarified
- ✅ Data structure defined
- ✅ Backend architecture planned
- ✅ Frontend components designed
- ✅ Task breakdown with estimates
- ✅ Implementation order established

**Shall I start implementing?** I'll begin with:
1. Backend service (LevelFunnelService)
2. Then move to controller & routes
3. Then frontend components

Let me know if you want to adjust anything or if we should proceed! 🚀

