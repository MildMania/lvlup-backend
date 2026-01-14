# AB Test - Implementation Approach

## How AB Tests Work (Optimized for Scale)

### ✅ Recommended Approach: Store AB Test Info in Events

**Event structure includes AB test assignments:**
```typescript
{
  userId: "user_123",
  eventName: "level_start",
  properties: { levelId: 1 },
  timestamp: "2026-01-14T10:00:00Z",
  
  // AB test info embedded directly in event
  abTests: {
    "test_difficulty_2025": "variant_easy",
    "test_tutorial_2025": "variant_long"
  }
}
```

**Database schema:**
```prisma
model Event {
  id         String   @id
  userId     String
  eventName  String
  properties Json?
  abTests    Json?    // ← AB test assignments stored here
  timestamp  DateTime
  // ... other fields
}
```

---

## Why This Approach is Better

### ✅ Performance at Scale
```typescript
// Single query - filter directly on event
const events = await prisma.event.findMany({
  where: {
    gameId: 'game_123',
    eventName: { in: ['level_start', 'level_complete'] },
    abTests: {
      path: ['test_difficulty_2025'],  // JSON path
      equals: 'variant_easy'            // Filter by variant
    }
  }
});
```

**Benefits:**
- ✅ **Single query** - no joins or lookups
- ✅ **Fast filtering** - direct JSON field query
- ✅ **Scales to millions** - indexed JSON queries are efficient
- ✅ **No memory overhead** - no large user ID arrays
- ✅ **No network overhead** - minimal data transfer

### ❌ Old Approach (Don't Use)
```typescript
// BAD: Two queries + large IN clause
const assignments = await prisma.testAssignment.findMany({ ... }); // Query 1
const userIds = assignments.map(a => a.userId); // 10,000+ IDs
const events = await prisma.event.findMany({
  where: { userId: { in: userIds } } // Query 2 - slow with large IN
});
```

**Problems:**
- ❌ Two separate database queries
- ❌ Large `IN` clause (thousands of user IDs)
- ❌ Database join overhead
- ❌ Memory overhead for user ID arrays
- ❌ Doesn't scale well

---

## How to Implement

### 1. Unity SDK - Send AB Test Info with Events

**When user is assigned to AB test:**
```csharp
// Store on device
PlayerPrefs.SetString("ab_tests", JsonUtility.ToJson(new {
    test_difficulty_2025 = "variant_easy",
    test_tutorial_2025 = "variant_long"
}));
```

**When sending events:**
```csharp
// Include AB test info in event
LvlUpManager.Instance.TrackEvent("level_start", new Dictionary<string, object> {
    { "levelId", 1 }
}, abTests: new Dictionary<string, string> {
    { "test_difficulty_2025", "variant_easy" },
    { "test_tutorial_2025", "variant_long" }
});
```

### 2. Backend - Filter by AB Test Field

**Service layer:**
```typescript
async getLevelFunnelData(filters: LevelFunnelFilters) {
    const whereClause: any = {
        gameId: filters.gameId,
        eventName: { in: ['level_start', 'level_complete', 'level_failed'] }
    };

    // Filter by AB test variant (embedded in event)
    if (filters.abTestId && filters.variantId) {
        whereClause.abTests = {
            path: [filters.abTestId],
            equals: filters.variantId
        };
    }

    const events = await prisma.event.findMany({ where: whereClause });
    return this.calculateMetrics(events);
}
```

### 3. Split View - Query Each Variant

```typescript
async getLevelFunnelWithCohorts(filters: LevelFunnelFilters) {
    const abTest = await prisma.aBTest.findUnique({
        where: { id: filters.abTestId },
        include: { variants: true }
    });

    const cohortData: Record<string, LevelMetrics[]> = {};

    // Query events for each variant (fast - single query per variant)
    for (const variant of abTest.variants) {
        const events = await prisma.event.findMany({
            where: {
                gameId: filters.gameId,
                eventName: { in: ['level_start', 'level_complete', 'level_failed'] },
                abTests: {
                    path: [filters.abTestId],
                    equals: variant.name
                }
            }
        });

        cohortData[variant.name] = this.calculateMetricsFromEvents(events);
    }

    return cohortData;
}
```

---

## TestAssignment Table - Still Useful

**Keep the `TestAssignment` table for:**
- ✅ Tracking when users were assigned
- ✅ Admin UI to see who's in which test
- ✅ Preventing duplicate assignments
- ✅ Historical record of assignments

**But DON'T use it for analytics queries** - use the embedded `abTests` field instead!

```prisma
model TestAssignment {
  id         String   @id
  testId     String
  variantId  String
  userId     String
  assignedAt DateTime
  
  @@unique([testId, userId])
}
```

---

## Migration Strategy

### Phase 1: Add abTests field to Event model
```prisma
model Event {
  // ...existing fields...
  abTests    Json?    // NEW field
}
```

**Migration command:**
```bash
cd backend
npx prisma migrate dev --name add_ab_tests_to_events
```

### Phase 2: Update Unity SDK
- Add `abTests` parameter to `TrackEvent()` method
- Store AB test assignments on device
- Include in all events

### Phase 3: Update Backend
- Use `abTests` field for filtering
- Keep `TestAssignment` for admin/tracking only

---

## Key Points

✅ **Store AB test info in events** - not in separate table  
✅ **Filter with single query** - fast and scalable  
✅ **Works with millions of events** - efficient JSON queries  
✅ **Keep TestAssignment** - for admin/tracking, not analytics  
✅ **No breaking changes** - field is optional (nullable)

