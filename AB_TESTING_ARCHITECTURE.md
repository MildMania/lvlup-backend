# A/B Testing Architecture Decision: Stateless vs Stateful

## TL;DR: Use Stateless (Deterministic Hashing) ⭐

**Winner:** Option 2 - Deterministic hashing with no database storage

**Why:** Scales infinitely, zero overhead, privacy-friendly, and perfectly consistent

---

## The Question

When backend assigns a user to an A/B test variant, should it:
1. **Store the assignment in database** (stateful)?
2. **Calculate assignment on-the-fly using hash** (stateless)?

---

## Option 1: Stateful (Database Storage)

### How It Works
```sql
CREATE TABLE experiment_assignments (
  user_id VARCHAR(255),
  experiment_id VARCHAR(255),
  variant VARCHAR(255),
  assigned_at TIMESTAMP,
  PRIMARY KEY (user_id, experiment_id)
);
```

### Pros
- ✅ Can reassign users to different variants
- ✅ Easy to query "who's in which variant"
- ✅ Can do gradual rollouts (assign 10% today, 20% tomorrow)
- ✅ Works even without consistent userId

### Cons
- ❌ **Database overhead**: 1 million users × 10 experiments = 10M rows
- ❌ **Query on every request**: Adds 10-50ms latency per config fetch
- ❌ **Scaling nightmare**: Sharding needed for millions of users
- ❌ **Privacy concerns**: Persistent user tracking
- ❌ **Storage costs**: Each assignment = ~50 bytes × millions
- ❌ **Cleanup needed**: Old experiments accumulate data

### When to Use
- Small scale (< 100k users)
- Need to reassign users mid-experiment
- Don't have consistent userId

---

## Option 2: Stateless (Deterministic Hashing) ⭐ **RECOMMENDED**

### How It Works
```typescript
function shouldIncludeUser(userId, experimentId, trafficPercentage) {
  const hash = sha256(`${userId}:${experimentId}`);
  const bucket = parseInt(hash, 16) % 100;
  return bucket < trafficPercentage;
}

// Example:
// User "user123" + Experiment "daily_reward_test"
// → Hash: d4f2a8b1... → Bucket: 43
// → If trafficPercentage = 50, user IS included (43 < 50)
// → If trafficPercentage = 30, user NOT included (43 >= 30)
```

### Pros
- ✅ **Zero database overhead**: No storage needed at all
- ✅ **Instant**: Pure computation, no I/O
- ✅ **Scales infinitely**: Works for billions of users
- ✅ **Consistent**: Same userId → same variant, always
- ✅ **Privacy-friendly**: No persistent tracking
- ✅ **Cacheable**: Client can cache their variant
- ✅ **No cleanup**: Nothing to clean up

### Cons
- ⚠️ Can't reassign users mid-experiment (but you can add salt)
- ⚠️ Requires consistent userId from client

### When to Use
- **Always** (unless you need mid-experiment reassignment)
- Large scale (> 100k users)
- Performance matters
- Privacy matters

---

## Implementation in Your System

### Step 1: Add Fields to Rule Schema

```typescript
// In Prisma schema
model RuleOverwrite {
  // ...existing fields...
  trafficPercentage Int? @default(100) // 0-100
  variantName String? // "control", "variant_a", etc.
  experimentSalt String? // Optional salt for re-randomization
}
```

### Step 2: Update Rule Evaluator

```typescript
// In ruleEvaluator.ts
import { shouldIncludeUser } from '../utils/abTestBucketing';

export function evaluateRules(
  rules: RuleOverwrite[],
  context: RuleEvaluationContext,
  userId: string // ← NEW: Need userId for bucketing
): RuleOverwrite | null {
  for (const rule of sortedRules) {
    // Check if user is in A/B test bucket
    if (rule.trafficPercentage && rule.trafficPercentage < 100) {
      const isIncluded = shouldIncludeUser(
        userId,
        rule.id,
        rule.trafficPercentage,
        rule.experimentSalt || ''
      );
      
      if (!isIncluded) {
        continue; // Skip this rule, user not in bucket
      }
    }
    
    // Check other conditions (platform, country, etc.)
    if (evaluateRuleCondition(rule, context)) {
      return rule; // Match!
    }
  }
  
  return null;
}
```

### Step 3: Pass UserId in API Request

```typescript
// Unity SDK should send:
GET /api/config/configs?userId=user123&platform=iOS&country=TR

// Backend extracts:
const { userId, platform, country } = req.query;
```

---

## Practical Example: Multi-Variant in Remote Config

### Scenario: Testing 4 Different Daily Reward Values

**Config:** `daily_reward`  
**Default Value:** 100  
**Experiment:** Test 3 higher values to maximize retention

#### Setup in Your Remote Config:

```typescript
// Rule 1 - Variant A (20% of users)
{
  priority: 1,
  overrideValue: 150,
  trafficPercentage: 20,
  variantName: "variant_a_150",
  enabled: true
}

// Rule 2 - Variant B (20% of users)
{
  priority: 2,
  overrideValue: 200,
  trafficPercentage: 20,
  variantName: "variant_b_200",
  enabled: true
}

// Rule 3 - Variant C (20% of users)
{
  priority: 3,
  overrideValue: 250,
  trafficPercentage: 20,
  variantName: "variant_c_250",
  enabled: true
}

// Remaining 40% get default value (100) = Control
```

#### Backend Evaluation:

```typescript
// User makes request
GET /api/config/configs?userId=user456&platform=iOS

// Backend evaluates rules in priority order:
for (const rule of rules) {
  // Check if user is in this rule's bucket
  const bucket = hash(userId + rule.id) % 100;
  
  if (bucket < rule.trafficPercentage) {
    // User is in this bucket!
    return rule.overrideValue;
  }
}

// No rule matched, return default
return config.value; // 100
```

#### User Distribution:

```typescript
// user1 (bucket 5)  → Rule 1 → 150 ✅
// user2 (bucket 35) → Rule 2 → 200 ✅
// user3 (bucket 58) → Rule 3 → 250 ✅
// user4 (bucket 82) → No rule → 100 (control)
// user5 (bucket 91) → No rule → 100 (control)

// Result:
// - 20% see 150
// - 20% see 200
// - 20% see 250
// - 40% see 100 (control)
```

#### Advanced: Geo-Targeted Multi-Variant Test

```typescript
// Test different values per country AND variant

// Rule 1 - US Variant A (15% of US users)
{
  priority: 1,
  countryConditions: ["US"],
  overrideValue: 500,
  trafficPercentage: 15,
  variantName: "us_variant_a_500"
}

// Rule 2 - US Variant B (15% of US users)
{
  priority: 2,
  countryConditions: ["US"],
  overrideValue: 1000,
  trafficPercentage: 15,
  variantName: "us_variant_b_1000"
}

// Rule 3 - TR Variant A (20% of TR users)
{
  priority: 3,
  countryConditions: ["TR"],
  overrideValue: 150,
  trafficPercentage: 20,
  variantName: "tr_variant_a_150"
}

// Rule 4 - TR Variant B (20% of TR users)
{
  priority: 4,
  countryConditions: ["TR"],
  overrideValue: 200,
  trafficPercentage: 20,
  variantName: "tr_variant_b_200"
}

// Others get default value
```

**Result:**
- US users: 15% see $500, 15% see $1000, 70% see default
- TR users: 20% see 150₺, 20% see 200₺, 60% see default
- Other countries: 100% see default

**All without any database storage!** 🚀

---

## Comparison Example

**YES! Works with unlimited variants!**

### Example: 4-Variant Test (Control + 3 Variants)

```typescript
// Experiment: Daily Reward Optimization
// - Control (25%): $1 reward
// - Variant A (25%): $2 reward
// - Variant B (25%): $5 reward  
// - Variant C (25%): $10 reward

const variant = assignToVariant('user123', 'daily_reward_test', [
  { name: 'variant_a', percentage: 25 },
  { name: 'variant_b', percentage: 25 },
  { name: 'variant_c', percentage: 25 },
  // Remaining 25% = control (null)
]);

// Backend assigns based on hash bucket (0-99):
// - Bucket 0-24 (25%) → variant_a
// - Bucket 25-49 (25%) → variant_b
// - Bucket 50-74 (25%) → variant_c
// - Bucket 75-99 (25%) → null (control)
```

### How It Works

```typescript
function assignToVariant(userId, experimentId, variants) {
  // Hash userId + experimentId to get bucket (0-99)
  const hash = sha256(`${userId}:${experimentId}`);
  const bucket = parseInt(hash.substring(0, 8), 16) % 100;
  
  // Assign to variant based on cumulative percentages
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.percentage;
    if (bucket < cumulative) {
      return variant.name;
    }
  }
  
  return null; // Control group
}
```

### Real Example with 5 Variants

```typescript
// Test: Button Color Optimization
const variants = [
  { name: 'red', percentage: 15 },
  { name: 'blue', percentage: 15 },
  { name: 'green', percentage: 15 },
  { name: 'yellow', percentage: 15 },
  { name: 'purple', percentage: 15 },
  // Remaining 25% = control (original color)
];

// User distribution:
// user1 (bucket 8)  → red     (0-14)
// user2 (bucket 42) → green   (30-44)
// user3 (bucket 91) → control (75-99)
// user4 (bucket 15) → blue    (15-29)
// user5 (bucket 67) → purple  (60-74)
```

### Uneven Distribution Example

```typescript
// Test: Pricing Strategy (90% control, 10% experimental)
const variants = [
  { name: 'discount_10', percentage: 3 },   // 3% of users
  { name: 'discount_20', percentage: 3 },   // 3% of users
  { name: 'discount_30', percentage: 4 },   // 4% of users
  // Remaining 90% = control (no discount)
];

// Conservative rollout: Only 10% see discounts
```

### Benefits of Multi-Variant Hashing

1. **Unlimited variants** - Test 2, 3, 10, or 100 variants
2. **Flexible percentages** - Don't need equal splits (can do 60/20/10/10)
3. **Still stateless** - No database needed, even with 100 variants
4. **Consistent** - Same user always gets same variant
5. **No collisions** - Users deterministically distributed across all variants

---

## Comparison Example

### Scenario: 1 Million Users, 10 Experiments

**Stateful:**
```
Database Rows: 1M users × 10 experiments = 10M rows
Storage: 10M × 50 bytes = 500 MB
Query Time: ~20ms per config fetch
Cost: High (database scaling)
```

**Stateless:**
```
Database Rows: 0
Storage: 0 bytes
Query Time: ~0.01ms (hash computation)
Cost: Zero
```

---

## How Client Should Handle Assignment

### Client Responsibility: Store UserId Consistently

```csharp
// Unity SDK
public class LvlUpManager {
    private string GetOrCreateUserId() {
        string userId = PlayerPrefs.GetString("lvlup_user_id");
        
        if (string.IsNullOrEmpty(userId)) {
            userId = Guid.NewGuid().ToString();
            PlayerPrefs.SetString("lvlup_user_id", userId);
            PlayerPrefs.Save();
        }
        
        return userId;
    }
    
    public void FetchConfigs() {
        string userId = GetOrCreateUserId();
        string url = $"{baseUrl}/api/config/configs";
        url += $"?userId={userId}";
        url += $"&platform={platform}";
        url += $"&country={country}";
        
        // Backend will deterministically assign this user to variants
        // Same userId always gets same variants
    }
}
```

**Client should:**
- ✅ Generate userId once on first launch
- ✅ Store it locally (PlayerPrefs, SharedPreferences, etc.)
- ✅ Send it with every config fetch
- ❌ NOT generate new userId on each launch (breaks consistency)

---

## Advanced: Resetting Experiment Bucketing

If you need to re-randomize assignments (e.g., experiment failed, need fresh start):

```typescript
// Add salt to rule
{
  "id": "rule_123",
  "trafficPercentage": 50,
  "experimentSalt": "2026-01-27" // ← Change this to reset bucketing
}

// Now same userId gets different bucket:
// Hash("user123:rule_123:2026-01-27") ≠ Hash("user123:rule_123:2026-01-28")
```

---

## Tracking Results (Separate Concern)

**Important:** Assignment ≠ Tracking

You still need to **track which variant user saw** for analytics:

```typescript
// When rule matches, log an event
await logEvent({
  eventName: "ab_test_assigned",
  userId: "user123",
  experimentId: "daily_reward_test",
  variant: "variant_a",
  configKey: "daily_reward",
  value: 200
});

// Later, analyze in your analytics:
// - Variant A: 100 users saw value 200
// - Control: 100 users saw value 100
// - Compare conversion rates
```

But this is **event logging**, not **assignment storage**.

---

## Migration Path

### Phase 1: Start Stateless (Now)
```typescript
// Just implement deterministic hashing
// No database changes needed
```

### Phase 2: If You Need Stateful Later
```typescript
// Add experiment_assignments table
// Hybrid approach: Check DB first, fallback to hash
const dbAssignment = await getAssignment(userId, experimentId);
if (dbAssignment) {
  return dbAssignment.variant;
} else {
  return shouldIncludeUser(userId, experimentId, trafficPercentage);
}
```

---

## Final Recommendation

**Use stateless (deterministic hashing)** because:

1. **Your scale demands it** - You'll have thousands/millions of users
2. **Performance matters** - Config fetching is on hot path
3. **Privacy-first** - Don't store unnecessary user data
4. **Simpler** - No database tables, queries, or cleanup
5. **Proven** - Facebook, Google, Netflix all use this approach

**Only use stateful if:**
- You have < 10k users (then it doesn't matter)
- You absolutely need to reassign users mid-experiment
- You don't have consistent userId (but you should fix this)

---

## Summary Table

| Aspect | Stateful | Stateless |
|--------|----------|-----------|
| Database Rows | Millions | 0 |
| Query Latency | 20ms | 0.01ms |
| Storage Cost | High | Zero |
| Scalability | Limited | Infinite |
| Privacy | Lower | Higher |
| Complexity | Higher | Lower |
| Consistency | Perfect | Perfect |
| Can Reassign | Yes | With salt |
| **Winner** | ❌ | ✅ |

---

## Next Steps

1. ✅ Use the `abTestBucketing.ts` utility I created
2. ✅ Add `trafficPercentage` and `variantName` to RuleOverwrite schema
3. ✅ Update rule evaluator to call `shouldIncludeUser()`
4. ✅ Update Unity SDK to send consistent `userId`
5. ✅ Log variant assignments as events for analytics
6. ✅ Enjoy infinite scalability with zero overhead! 🚀

