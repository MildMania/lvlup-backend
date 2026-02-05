# Multi-Variant A/B Testing: Visual Examples

## How Hash Bucketing Works with Multiple Variants

### The Math Behind It

```
Step 1: Hash the userId + experimentId
  Input: "user123:rule_abc"
  Output: "d4f2a8b1c3e5f7..."
  
Step 2: Convert hash to number and modulo 100
  Hash bytes → Integer → % 100
  Result: Bucket number 0-99
  
Step 3: Map bucket to variant based on percentages
  Variant A: buckets 0-24  (25%)
  Variant B: buckets 25-49 (25%)
  Variant C: buckets 50-74 (25%)
  Control:   buckets 75-99 (25%)
```

---

## Example 1: Equal Split (4 Variants)

### Experiment: Button Color Test

**Variants:**
- Red: 25%
- Blue: 25%
- Green: 25%
- Control (original): 25%

### Bucket Distribution:

```
 0                    25                   50                   75                  100
 |---------------------|---------------------|---------------------|---------------------|
 |       RED (25%)     |      BLUE (25%)     |     GREEN (25%)     |    CONTROL (25%)    |
 |---------------------|---------------------|---------------------|---------------------|

User Examples:
user1 (bucket 8)  → RED    ✅
user2 (bucket 31) → BLUE   ✅
user3 (bucket 67) → GREEN  ✅
user4 (bucket 88) → CONTROL ✅
```

### Code Implementation:

```typescript
const variants = [
  { name: 'red', percentage: 25 },
  { name: 'blue', percentage: 25 },
  { name: 'green', percentage: 25 },
];

function assignToVariant(userId: string, experimentId: string) {
  const hash = crypto.createHash('sha256')
    .update(`${userId}:${experimentId}`)
    .digest('hex');
  const bucket = parseInt(hash.substring(0, 8), 16) % 100;
  
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.percentage;
    if (bucket < cumulative) {
      return variant.name;
    }
  }
  
  return null; // Control
}

// Examples:
assignToVariant('user1', 'btn_color') // bucket 8  → 'red'
assignToVariant('user2', 'btn_color') // bucket 31 → 'blue'
assignToVariant('user3', 'btn_color') // bucket 67 → 'green'
assignToVariant('user4', 'btn_color') // bucket 88 → null (control)
```

---

## Example 2: Uneven Split (Conservative Rollout)

### Experiment: New Pricing Model

**Variants:**
- Discount 10%: 5%
- Discount 20%: 5%
- Discount 30%: 5%
- Control (no discount): 85%

### Bucket Distribution:

```
 0    5   10  15                                                                       100
 |----|----|---|-----------------------------------------------------------------------|
 | 10%| 20%|30%|                         CONTROL (85%)                                |
 |----|----|---|-----------------------------------------------------------------------|

User Examples:
user1 (bucket 2)  → 10% discount ✅ (rare)
user2 (bucket 8)  → 20% discount ✅ (rare)
user3 (bucket 13) → 30% discount ✅ (rare)
user4 (bucket 50) → Control ✅ (most users)
user5 (bucket 99) → Control ✅ (most users)
```

### Why This Is Useful:

- **Risk mitigation**: Only 15% of users see experimental pricing
- **Data collection**: Still get statistically significant results
- **Easy rollout**: Can increase percentages gradually (5% → 10% → 20%)

---

## Example 3: Many Variants (10 Options)

### Experiment: Tutorial Length Test

**Variants:**
- Skip: 10%
- 1 step: 9%
- 2 steps: 9%
- 3 steps: 9%
- 4 steps: 9%
- 5 steps: 9%
- 6 steps: 9%
- 7 steps: 9%
- 8 steps: 9%
- 9 steps: 9%
- Control (10 steps): 10%

### Bucket Distribution:

```
 0  10 19 28 37 46 55 64 73 82 91 100
 |---|-|-|-|-|-|-|-|-|-|--|
 |SKP|1|2|3|4|5|6|7|8|9|10|
 |---|-|-|-|-|-|-|-|-|-|--|
```

**Result:** Evenly distributed across 11 options (including control)

---

## Example 4: Real-World Daily Reward Test

### Experiment Setup:

```typescript
// Config: daily_reward
// Default: 100 coins

// Remote Config Rules:
[
  {
    priority: 1,
    overrideValue: 50,
    trafficPercentage: 15,
    variantName: "low_50"
  },
  {
    priority: 2,
    overrideValue: 100,
    trafficPercentage: 20,
    variantName: "baseline_100"
  },
  {
    priority: 3,
    overrideValue: 150,
    trafficPercentage: 15,
    variantName: "medium_150"
  },
  {
    priority: 4,
    overrideValue: 200,
    trafficPercentage: 15,
    variantName: "high_200"
  },
  {
    priority: 5,
    overrideValue: 500,
    trafficPercentage: 5,
    variantName: "whale_500"
  }
  // Remaining 30% get default (100)
]
```

### User Distribution:

```
 0      15      35      50      65     70                    100
 |------|-------|-------|-------|------|---------------------|
 |  50  |  100  |  150  |  200  | 500  |    100 (default)    |
 | 15%  |  20%  |  15%  |  15%  |  5%  |        30%          |
 |------|-------|-------|-------|------|---------------------|

Buckets:
- 0-14:   50 coins (15%)
- 15-34:  100 coins (20%)
- 35-49:  150 coins (15%)
- 50-64:  200 coins (15%)
- 65-69:  500 coins (5%)
- 70-99:  100 coins (30% - default)
```

### Expected Results (1000 users):

```
150 users → 50 coins
200 users → 100 coins (via rule)
150 users → 150 coins
150 users → 200 coins
50 users  → 500 coins
300 users → 100 coins (default)
```

### Analysis:

```typescript
// After 1 week, analyze retention by variant:
{
  "low_50": { users: 150, retention_d7: 35% },
  "baseline_100": { users: 500, retention_d7: 42% }, // Combined rule + default
  "medium_150": { users: 150, retention_d7: 48% },
  "high_200": { users: 150, retention_d7: 52% },
  "whale_500": { users: 50, retention_d7: 58% }
}

// Winner: 200 coins (best balance of retention vs cost)
// Action: Promote to production by changing default value
```

---

## Key Advantages of Hash-Based Multi-Variant

### 1. No Database Overhead

```
Traditional (Stateful):
- 1M users × 5 variants = 5M DB rows
- Each query: ~20ms
- Storage: ~250MB

Hash-Based (Stateless):
- 0 DB rows
- Each query: ~0.01ms  
- Storage: 0 bytes
```

### 2. Consistent Across Experiments

Same user always gets consistent bucket:

```typescript
// User "alice123" with experiment "daily_reward"
hash("alice123:exp_reward_001") → bucket 42

// Same user, same experiment, ALWAYS bucket 42
// Even if:
// - Different server
// - Different day
// - Different platform
// - App reinstall

// Different experiment = different bucket
hash("alice123:exp_button_color") → bucket 67
```

### 3. Easy Gradual Rollout

```typescript
// Week 1: Test with 10% traffic
{ trafficPercentage: 10, variantName: "new_feature_v1" }

// Week 2: Increase to 25% (same users + new users)
{ trafficPercentage: 25, variantName: "new_feature_v1" }

// Week 3: Increase to 50%
{ trafficPercentage: 50, variantName: "new_feature_v1" }

// Week 4: Full rollout
{ trafficPercentage: 100, variantName: "new_feature_v1" }

// Users in first 10% STAY in experiment (consistent hashing)
```

---

## Handling Edge Cases

### What if percentages don't add to 100?

```typescript
const variants = [
  { name: 'a', percentage: 20 },
  { name: 'b', percentage: 30 },
  // Total: 50%, remaining 50% → control
];

// Bucket 0-19: variant a
// Bucket 20-49: variant b
// Bucket 50-99: control (null)
```

### What if percentages exceed 100?

```typescript
const variants = [
  { name: 'a', percentage: 60 },
  { name: 'b', percentage: 60 }, // ❌ Total = 120%
];

// Should throw error: "Total cannot exceed 100%"
// OR: Normalize percentages automatically
```

### What if same user in multiple experiments?

```typescript
// User "bob456" is in 3 experiments simultaneously:

hash("bob456:exp_daily_reward")   → bucket 23 → Variant A
hash("bob456:exp_button_color")   → bucket 67 → Variant C
hash("bob456:exp_tutorial_length") → bucket 91 → Control

// Each experiment has independent bucketing
// No cross-contamination
```

---

## Production Tips

### 1. Log Variant Assignments

```typescript
// When rule matches, log the variant
await logEvent({
  eventName: "ab_variant_assigned",
  userId: userId,
  experimentId: rule.id,
  variantName: rule.variantName,
  configKey: config.key,
  overrideValue: rule.overrideValue,
  bucket: bucket  // Include bucket for debugging
});
```

### 2. Monitor Distribution

```sql
-- Check if variants are evenly distributed
SELECT 
  variantName,
  COUNT(*) as user_count,
  COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
FROM ab_variant_assigned
WHERE experimentId = 'daily_reward_test'
GROUP BY variantName;

-- Expected:
-- variant_a: ~25%
-- variant_b: ~25%
-- variant_c: ~25%
-- control: ~25%
```

### 3. Use Salt for Resets

```typescript
// If experiment needs to be reset (bug, incorrect config, etc.)
{
  id: "rule_123",
  trafficPercentage: 50,
  variantName: "new_feature",
  experimentSalt: "2026-01-27"  // ← Change date to rebucket all users
}

// Old: hash("user:rule_123") → bucket 42
// New: hash("user:rule_123:2026-01-27") → bucket 81
```

---

## Summary

✅ **Hash-based bucketing supports unlimited variants**  
✅ **Percentages can be uneven (5%, 10%, 85%)**  
✅ **Zero database overhead**  
✅ **Perfectly consistent**  
✅ **Easy to roll out gradually**  
✅ **Works with any number of experiments simultaneously**

**The same user ID + experiment ID always produces the same bucket, regardless of how many variants you have!** 🎯

