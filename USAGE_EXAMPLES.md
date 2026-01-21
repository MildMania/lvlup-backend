# Remote Config System - Usage Examples

## Example 1: Creating a Config

```typescript
import * as configService from 'src/services/configService';

// Create a basic config
const dailyReward = await configService.createConfig({
  gameId: 'my_game_123',
  key: 'daily_reward_coins',
  value: 100,
  dataType: 'number',
  environment: 'production',
  description: 'Daily login reward amount in coins',
}, 'user_admin_1');

// Result:
// {
//   id: 'cuid_123',
//   gameId: 'my_game_123',
//   key: 'daily_reward_coins',
//   value: 100,
//   dataType: 'number',
//   environment: 'production',
//   enabled: true,
//   description: 'Daily login reward amount in coins',
//   createdAt: 2026-01-21T...,
//   updatedAt: 2026-01-21T...
// }
```

---

## Example 2: Creating Rules with Priority

```typescript
// Create rule 1: iOS users get 150 coins
const rule1 = await configService.createRule({
  configId: 'config_123',
  priority: 1,
  enabled: true,
  overrideValue: 150,
  platformCondition: 'iOS',
  versionOperator: 'greater_or_equal',
  versionValue: '3.5.0',
}, 'user_admin_1');

// Create rule 2: Android users get 125 coins
const rule2 = await configService.createRule({
  configId: 'config_123',
  priority: 2,
  enabled: true,
  overrideValue: 125,
  platformCondition: 'Android',
}, 'user_admin_1');

// Create rule 3: Germany gets 200 coins (special promotion)
const rule3 = await configService.createRule({
  configId: 'config_123',
  priority: 3,
  enabled: true,
  overrideValue: 200,
  countryCondition: 'DE',
  activeBetweenStart: new Date('2026-02-01'),
  activeBetweenEnd: new Date('2026-02-14'),
}, 'user_admin_1');
```

---

## Example 3: Rule Evaluation

```typescript
import { evaluateRules } from 'src/services/ruleEvaluator';
import * as configService from 'src/services/configService';

// Get all rules for a config
const config = await configService.getConfig('config_123');
const rules = config.rules; // Already sorted by priority

// Evaluate for iOS user on v3.5.0
const iOSContext = {
  platform: 'iOS',
  version: '3.5.0',
  serverTime: new Date()
};

const matchedRule = evaluateRules(rules, iOSContext);
// Result: rule1 (priority 1) matches
// Returns override value: 150

// Evaluate for Android user
const androidContext = {
  platform: 'Android',
  serverTime: new Date()
};

const matchedRule2 = evaluateRules(rules, androidContext);
// Result: rule2 (priority 2) matches
// Returns override value: 125

// Evaluate for Germany user during promotion
const germanyContext = {
  country: 'DE',
  serverTime: new Date('2026-02-05')
};

const matchedRule3 = evaluateRules(rules, germanyContext);
// Result: rule3 (priority 3) matches
// Returns override value: 200

// Evaluate for user with no matching rules
const webContext = {
  platform: 'Web',
  version: '1.0.0'
};

const noMatch = evaluateRules(rules, webContext);
// Result: null (no match)
// Use default config value: 100
```

---

## Example 4: Caching

```typescript
import * as cacheService from 'src/services/cacheService';

// Generate cache key for specific user context
const cacheKey = cacheService.generateCacheKey({
  gameId: 'my_game_123',
  environment: 'production',
  platform: 'iOS',
  version: '3.5.0',
  country: 'US'
});
// Result: 'config:my_game_123:production:iOS:3.5.0:US'

// Cache the evaluated config
const configData = {
  daily_reward_coins: 150,
  max_health: 100,
  enable_pvp: true
};

await cacheService.setCacheValue(
  cacheKey,
  configData,
  5 * 60 // 5 minute TTL
);

// Later, retrieve from cache
const cached = await cacheService.getCacheValue(cacheKey);
// Result: configData (if still in cache)

// When config changes, invalidate all variants
await cacheService.invalidateGameCache(
  'my_game_123',
  'production'
);
// Clears all keys matching: config:my_game_123:production:*
```

---

## Example 5: Validation

```typescript
import { 
  validateKeyFormat, 
  validateVersionCondition,
  validatePriority 
} from 'src/middleware/validateConfig';
import { validateVersionCondition } from 'src/middleware/validateRule';

// Valid key
validateKeyFormat('daily_reward_coins')
// Result: { valid: true }

// Invalid key (special characters)
validateKeyFormat('daily-reward-coins')
// Result: { valid: false, error: 'Key must contain only alphanumeric characters and underscores' }

// Valid version condition
validateVersionCondition('greater_or_equal', '3.5.0')
// Result: { valid: true }

// Invalid version condition (mismatched operator/value)
validateVersionCondition('greater_or_equal', null)
// Result: { valid: false, error: 'versionOperator and versionValue must both be provided or both be null' }

// Valid priority
validatePriority(1)
// Result: { valid: true }

// Invalid priority (too high)
validatePriority(2000)
// Result: { valid: false, error: 'priority must be <= 1000' }
```

---

## Example 6: Updating Configs

```typescript
// Update config value
const updated = await configService.updateConfig(
  'config_123',
  {
    value: 120, // Changed from 100
    enabled: true
  },
  'user_admin_1'
);

// This automatically:
// ✓ Updates the value in database
// ✓ Records change in ConfigHistory
// ✓ Invalidates all cache entries for this config
```

---

## Example 7: Reordering Rules

```typescript
// Change priority order: rule3 becomes priority 1 (highest)
await configService.reorderRules({
  configId: 'config_123',
  ruleOrder: [
    { ruleId: 'rule3_id', newPriority: 1 },  // Germany promo now highest
    { ruleId: 'rule1_id', newPriority: 2 },  // iOS second
    { ruleId: 'rule2_id', newPriority: 3 }   // Android third
  ]
}, 'user_admin_1');

// Result: Rules now evaluated in new priority order
// Germany users now get 200 coins (promoted to priority 1)
```

---

## Example 8: Date-Based Rules

```typescript
// Create time-limited rule (Valentine's Day special)
const valentinesRule = await configService.createRule({
  configId: 'daily_reward_coins',
  priority: 1,
  overrideValue: 500, // Triple reward
  activeBetweenStart: new Date('2026-02-01T00:00:00Z'),
  activeBetweenEnd: new Date('2026-02-14T23:59:59Z'),
}, 'user_promo_1');

// Rule evaluation on Feb 5 (within range)
const context = {
  serverTime: new Date('2026-02-05T12:00:00Z')
};
const rule = evaluateRules([valentinesRule], context);
// Result: Matches, returns 500

// Rule evaluation on Feb 15 (after range)
const afterContext = {
  serverTime: new Date('2026-02-15T00:00:00Z')
};
const rule2 = evaluateRules([valentinesRule], afterContext);
// Result: No match (outside date range)
```

---

## Example 9: Error Handling

```typescript
import {
  DuplicateConfigKeyError,
  MaxRulesExceededError,
  ConfigNotFoundError
} from 'src/types/config.types';

try {
  // Try to create duplicate key
  await configService.createConfig({
    gameId: 'game1',
    key: 'daily_reward_coins', // Already exists
    value: 200,
    dataType: 'number',
    environment: 'production'
  });
} catch (error) {
  if (error instanceof DuplicateConfigKeyError) {
    console.log('Key already exists:', error.message);
    // Handle duplicate
  }
}

try {
  // Try to add 31st rule (max is 30)
  await configService.createRule({
    configId: 'config_with_30_rules',
    priority: 31,
    overrideValue: 100
  });
} catch (error) {
  if (error instanceof MaxRulesExceededError) {
    console.log('Too many rules:', error.message);
    // Handle max exceeded
  }
}

try {
  // Try to update non-existent config
  await configService.updateConfig('non_existent', { value: 100 });
} catch (error) {
  if (error instanceof ConfigNotFoundError) {
    console.log('Config not found:', error.message);
    // Handle not found
  }
}
```

---

## Example 10: Version Comparison

```typescript
import { compareVersions } from 'src/utils/semver';

// iOS v3.5.0 >= 3.5.0? YES
compareVersions('3.5.0', 'greater_or_equal', '3.5.0')
// Result: true

// iOS v3.4.0 >= 3.5.0? NO
compareVersions('3.4.0', 'greater_or_equal', '3.5.0')
// Result: false

// iOS v3.6.0 >= 3.5.0? YES
compareVersions('3.6.0', 'greater_or_equal', '3.5.0')
// Result: true

// Android v2.0.0 == 2.0.0? YES
compareVersions('2.0.0', 'equal', '2.0.0')
// Result: true

// Check prerelease versions
compareVersions('1.0.0-alpha', 'less_than', '1.0.0')
// Result: true
```

---

## Example 11: Complete Flow

```typescript
// 1. Create config
const config = await configService.createConfig({
  gameId: 'my_game',
  key: 'level_difficulty',
  value: 'normal',
  dataType: 'string',
  environment: 'production'
});

// 2. Create rules
await configService.createRule({
  configId: config.id,
  priority: 1,
  overrideValue: 'easy',
  platformCondition: 'Android'
});

await configService.createRule({
  configId: config.id,
  priority: 2,
  overrideValue: 'hard',
  platformCondition: 'iOS',
  versionOperator: 'greater_than',
  versionValue: '4.0.0'
});

// 3. Fetch and evaluate
const allConfigs = await configService.getConfigs('my_game', 'production');
const configWithRules = allConfigs[0];

// 4. Evaluate for Android user
const androidResult = evaluateRules(configWithRules.rules, { platform: 'Android' });
// Result: 'easy'

// 5. Evaluate for iOS user on v4.1.0
const iOSResult = evaluateRules(configWithRules.rules, { 
  platform: 'iOS', 
  version: '4.1.0' 
});
// Result: 'hard'

// 6. Cache the results
const cacheKey = cacheService.generateCacheKey({
  gameId: 'my_game',
  environment: 'production',
  platform: 'iOS',
  version: '4.1.0'
});

await cacheService.setCacheValue(cacheKey, {
  level_difficulty: 'hard'
});
```

---

## Test Commands

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- tests/semver.test.ts
npm test -- tests/ruleEvaluator.test.ts
npm test -- tests/versionComparator.test.ts
npm test -- tests/cacheService.test.ts

# Watch mode
npm test -- --watch

# With coverage
npm test -- --coverage
```

---

These examples demonstrate the complete feature set of Phases 1 & 2. Phase 3 will expose these services through REST API endpoints.

