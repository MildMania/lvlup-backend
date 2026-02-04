# Level Funnel - AB Test Variant Split Implementation

## 📋 Current Status

**Backend**: ✅ Partially implemented
- `getLevelFunnelWithCohorts()` method exists in LevelFunnelService
- AB Test database models exist (ABTest, TestVariant, TestAssignment)
- Needs completion and testing

**Frontend**: ❌ Not implemented
- No AB test filter dropdown
- No split view UI
- No variant comparison table

---

## 🎯 Feature Requirements

### What We Need

When an AB test is selected from a dropdown:
1. Show metrics split by variant (side-by-side comparison)
2. Display all standard metrics for each variant
3. Highlight differences between variants
4. Show statistical significance (optional phase 2)

### Visual Layout

**Normal View** (No AB test selected):
```
┌─────────┬─────────┬──────────┬───────────┬────────┐
│ Level   │ Players │ Win Rate │ Fail Rate │ APS    │
├─────────┼─────────┼──────────┼───────────┼────────┤
│ Level 1 │ 10,000  │ 85%      │ 15%       │ 1.2    │
│ Level 2 │ 8,500   │ 84.7%    │ 15.3%     │ 1.3    │
└─────────┴─────────┴──────────┴───────────┴────────┘
```

**AB Test Split View**:
```
┌─────────┬────────────────────────────┬────────────────────────────┐
│ Level   │ Variant A (Control)        │ Variant B (Treatment)      │
│         │ Win Rate│ APS  │ Churn     │ Win Rate│ APS  │ Churn     │
├─────────┼─────────┼──────┼───────────┼─────────┼──────┼───────────┤
│ Level 1 │ 85%     │ 1.2  │ 15%       │ 87% ⬆   │ 1.1  │ 13% ⬇    │
│ Level 2 │ 84.7%   │ 1.3  │ 10%       │ 86% ⬆   │ 1.2  │ 8% ⬇     │
└─────────┴─────────┴──────┴───────────┴─────────┴──────┴───────────┘
```

---

## 🏗️ Implementation Plan

### Phase 1: Backend Completion

#### 1.1 Fix `getLevelFunnelWithCohorts()`
**File**: `backend/src/services/LevelFunnelService.ts`

**Current Issues**:
- Method exists but incomplete
- Needs to properly filter users by variant assignment
- Needs to call `getLevelFunnelData()` for each variant

**Implementation**:
```typescript
async getLevelFunnelWithCohorts(filters: LevelFunnelFilters): Promise<any> {
    if (!filters.abTestId) {
        return { default: await this.getLevelFunnelData(filters) };
    }

    // 1. Get AB test with variants
    const abTest = await prisma.aBTest.findUnique({
        where: { id: filters.abTestId },
        include: { variants: true }
    });

    // 2. For each variant, get user assignments
    const variantData: Record<string, LevelMetrics[]> = {};
    
    for (const variant of abTest.variants) {
        // Get users assigned to this variant
        const assignments = await prisma.testAssignment.findMany({
            where: {
                testId: filters.abTestId,
                variantId: variant.id
            },
            select: { userId: true }
        });
        
        const userIds = assignments.map(a => a.userId);
        
        // Get funnel data filtered by these users
        const events = await prisma.event.findMany({
            where: {
                gameId: filters.gameId,
                userId: { in: userIds },
                eventName: { in: ['level_start', 'level_complete', 'level_failed'] },
                // ... apply other filters
            }
        });
        
        // Calculate metrics for this variant
        variantData[variant.name] = this.calculateMetricsFromEvents(events);
    }
    
    return variantData;
}
```

#### 1.2 Add AB Test List Endpoint
**File**: `backend/src/controllers/LevelFunnelController.ts` or create `ABTestController.ts`

```typescript
// GET /api/analytics/ab-tests?gameId=xxx
async getABTests(req: Request, res: Response) {
    const { gameId } = req.query;
    
    const abTests = await prisma.aBTest.findMany({
        where: {
            gameId: gameId as string,
            status: 'RUNNING' // Only show active tests
        },
        include: {
            variants: true
        }
    });
    
    res.json({ success: true, data: abTests });
}
```

---

### Phase 2: Frontend Implementation

#### 2.1 Add AB Test Dropdown Filter
**File**: `frontend/src/components/LevelFunnel.tsx`

**Add State**:
```typescript
const [availableABTests, setAvailableABTests] = useState<any[]>([]);
const [selectedABTest, setSelectedABTest] = useState<string | null>(null);
const [variantData, setVariantData] = useState<Record<string, LevelMetrics[]>>({});
```

**Fetch AB Tests**:
```typescript
useEffect(() => {
    const fetchABTests = async () => {
        const response = await apiClient.get(`/analytics/ab-tests?gameId=${currentGame.id}`);
        if (response.data.success) {
            setAvailableABTests(response.data.data);
        }
    };
    
    if (currentGame && currentGame.id !== 'default') {
        fetchABTests();
    }
}, [currentGame?.id]);
```

**Add Dropdown to Filters**:
```tsx
<div className="filter-group">
    <label>AB Test</label>
    <select
        value={selectedABTest || 'none'}
        onChange={(e) => setSelectedABTest(e.target.value === 'none' ? null : e.target.value)}
    >
        <option value="none">No AB Test Selected</option>
        {availableABTests.map(test => (
            <option key={test.id} value={test.id}>{test.name}</option>
        ))}
    </select>
</div>
```

#### 2.2 Create Split View Table Component
**File**: `frontend/src/components/LevelFunnelSplitView.tsx`

```tsx
interface SplitViewProps {
    variantData: Record<string, LevelMetrics[]>;
    abTest: any;
}

export function LevelFunnelSplitView({ variantData, abTest }: SplitViewProps) {
    const variants = Object.keys(variantData);
    const levels = variantData[variants[0]] || [];
    
    return (
        <div className="split-view-container">
            <h3>AB Test: {abTest.name}</h3>
            <table className="split-view-table">
                <thead>
                    <tr>
                        <th rowSpan={2}>Level</th>
                        {variants.map(variantName => (
                            <th key={variantName} colSpan={5}>{variantName}</th>
                        ))}
                    </tr>
                    <tr>
                        {variants.map(variantName => (
                            <>
                                <th>Players</th>
                                <th>Win Rate</th>
                                <th>APS</th>
                                <th>Churn</th>
                                <th>Booster %</th>
                            </>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {levels.map((level, idx) => (
                        <tr key={level.levelId}>
                            <td>{level.levelName || `Level ${level.levelId}`}</td>
                            {variants.map(variantName => {
                                const variantLevel = variantData[variantName][idx];
                                return (
                                    <>
                                        <td>{variantLevel.players}</td>
                                        <td>{variantLevel.winRate.toFixed(1)}%</td>
                                        <td>{variantLevel.aps.toFixed(2)}</td>
                                        <td>{variantLevel.churnStartComplete.toFixed(1)}%</td>
                                        <td>{variantLevel.boosterUsage.toFixed(1)}%</td>
                                    </>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
```

#### 2.3 Update Main Component Logic
**File**: `frontend/src/components/LevelFunnel.tsx`

```typescript
const fetchLevelFunnelData = async () => {
    // ... existing code
    
    if (selectedABTest) {
        params.append('abTestId', selectedABTest);
        
        const response = await apiClient.get(`/analytics/level-funnel?${params}`);
        
        if (response.data.success) {
            if (response.data.data.cohorts) {
                // AB test split view
                setVariantData(response.data.data.cohorts);
                setLevels([]); // Clear normal view
            }
        }
    } else {
        // Normal view - existing logic
    }
};
```

**Conditional Rendering**:
```tsx
{!loading && !error && (
    selectedABTest && Object.keys(variantData).length > 0 ? (
        <LevelFunnelSplitView 
            variantData={variantData} 
            abTest={availableABTests.find(t => t.id === selectedABTest)} 
        />
    ) : (
        levels.length > 0 && <LevelFunnelTable levels={levels} />
    )
)}
```

---

## 📋 Implementation Tasks

| # | Task | File | Time | Status |
|---|------|------|------|--------|
| 1 | Complete `getLevelFunnelWithCohorts()` | LevelFunnelService.ts | 3h | ❌ TODO |
| 2 | Add AB test list endpoint | LevelFunnelController.ts | 1h | ❌ TODO |
| 3 | Add AB test routes | routes/level-funnel.ts | 0.5h | ❌ TODO |
| 4 | Fetch AB tests in frontend | LevelFunnel.tsx | 0.5h | ❌ TODO |
| 5 | Add AB test dropdown filter | LevelFunnel.tsx | 0.5h | ❌ TODO |
| 6 | Create SplitView component | LevelFunnelSplitView.tsx | 2h | ❌ TODO |
| 7 | Add split view CSS | LevelFunnel.css | 1h | ❌ TODO |
| 8 | Update fetch logic for cohorts | LevelFunnel.tsx | 1h | ❌ TODO |
| 9 | Add comparison indicators (⬆⬇) | LevelFunnelSplitView.tsx | 1h | ❌ TODO |
| 10 | Test with real AB test data | - | 2h | ❌ TODO |

**Total Estimated Time**: ~12 hours

---

## 🎨 UI Design

### Split View Table
- Two-level header (Variant names, then metric columns)
- Side-by-side comparison for each level
- Color coding for better/worse metrics
- Arrows showing improvement/degradation (⬆ green, ⬇ red)

### Comparison Indicators
```typescript
const getComparison = (variantA: number, variantB: number, metricType: 'higher-better' | 'lower-better') => {
    const diff = variantB - variantA;
    if (Math.abs(diff) < 0.5) return null; // No significant difference
    
    if (metricType === 'higher-better') {
        return diff > 0 ? { icon: '⬆', color: 'green' } : { icon: '⬇', color: 'red' };
    } else {
        return diff > 0 ? { icon: '⬆', color: 'red' } : { icon: '⬇', color: 'green' };
    }
};
```

---

## 🚀 Next Steps

**To implement AB test split view**:

1. **Backend**: Complete the `getLevelFunnelWithCohorts()` method
2. **Backend**: Add AB test list endpoint  
3. **Frontend**: Add AB test dropdown to filters
4. **Frontend**: Create split view component
5. **Frontend**: Update fetch logic to handle cohort data
6. **Testing**: Create test AB test data and verify split view

**Priority**: Medium (nice-to-have feature, not blocking)

---

## ✅ Summary

**Current State**:
- ✅ AB test database models exist
- ✅ Backend method skeleton exists
- ❌ Backend method incomplete
- ❌ No AB test endpoint
- ❌ No frontend UI

**When Complete**:
- Users can select an AB test from dropdown
- Table shows side-by-side metrics for each variant
- Visual indicators show which variant performs better
- Easy to identify winning variants for each level

This feature would provide powerful insights for game balance and A/B testing! 🎯

