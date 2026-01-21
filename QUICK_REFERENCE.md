# Remote Config System - Quick Reference

## Current Status
✅ **Phase 1 & 2 Complete** - Infrastructure and Foundational Services Ready

## What's Implemented

### Database Models (T002-T006)
```typescript
RemoteConfig      // Config values with type and environment
RuleOverwrite     // Conditional overrides with priority-based evaluation
ConfigHistory     // Audit trail of config changes
RuleHistory       // Audit trail of rule changes
ValidationRule    // Min/max/regex constraints
```

### Core Services

#### Rule Evaluation Engine
```typescript
import { evaluateRules } from 'src/services/ruleEvaluator';

const context = {
  platform: 'iOS',      // Optional
  version: '3.5.0',     // Optional
  country: 'DE',        // Optional
  segment: 'new_users', // Optional
  serverTime: new Date() // UTC server time
};

const matchedRule = evaluateRules(rules, context, metrics);
// Returns first matching rule or null
// All conditions must match (AND logic)
// Evaluates in priority order (1=highest)
```

#### Version Comparison
```typescript
import { compareVersions } from 'src/utils/semver';

compareVersions('3.5.0', 'greater_or_equal', '3.5.0') // true
compareVersions('3.4.0', 'greater_or_equal', '3.5.0') // false
```

#### Cache Service
```typescript
import * as cacheService from 'src/services/cacheService';

// Generate cache key
const key = cacheService.generateCacheKey({
  gameId: 'game123',
  environment: 'production',
  platform: 'iOS',
  version: '3.5.0'
});
// Result: "config:game123:production:iOS:3.5.0"

// Cache operations
await cacheService.setCacheValue(key, configs, 5 * 60);
const cached = await cacheService.getCacheValue(key);
await cacheService.invalidateGameCache(gameId, environment);
```

#### Config Service
```typescript
import * as configService from 'src/services/configService';

// Create config
const config = await configService.createConfig({
  gameId: 'game123',
  key: 'daily_reward_coins',
  value: 100,
  dataType: 'number',
  environment: 'production',
  description: 'Daily reward amount'
});

// Update config
await configService.updateConfig(configId, {
  value: 150,
  enabled: true
});

// Create rule
const rule = await configService.createRule({
  configId,
  priority: 1,
  overrideValue: 200,
  platformCondition: 'iOS',
  versionOperator: 'greater_or_equal',
  versionValue: '3.5.0'
});

// Reorder rules
await configService.reorderRules({
  configId,
  ruleOrder: [
    { ruleId: 'rule1', newPriority: 2 },
    { ruleId: 'rule2', newPriority: 1 }
  ]
});
```

### Validation

#### Config Validation
```typescript
import { validateConfigMiddleware, validateKeyFormat } from 'src/middleware/validateConfig';

// Express middleware
app.post('/api/admin/configs', validateConfigMiddleware, controller);

// Manual validation
validateKeyFormat('daily_reward_coins') // { valid: true }
validateKeyFormat('invalid-key') // { valid: false, error: '...' }
```

#### Rule Validation
```typescript
import { validateRuleMiddleware, validateVersionCondition } from 'src/middleware/validateRule';

// Express middleware
app.post('/api/admin/rules', validateRuleMiddleware, controller);

// Manual validation
validateVersionCondition('greater_or_equal', '3.5.0') // { valid: true }
validateVersionCondition('invalid', '3.5.0') // { valid: false, error: '...' }
```

## Test Coverage

### Running Tests
```bash
# All tests
npm test

# Specific test suite
npm test -- tests/semver.test.ts
npm test -- tests/ruleEvaluator.test.ts
npm test -- tests/versionComparator.test.ts
npm test -- tests/cacheService.test.ts

# Watch mode
npm test -- --watch
```

### Test Results Summary
- ✅ Semver Utility: 20 tests passing
- ✅ Rule Evaluation Engine: 20 tests passing
- ✅ Version Comparator: 13 tests passing
- ✅ Cache Service: 21 tests passing
- **Total: 74/74 tests passing (100%)**

## Rule Evaluation Examples

### Example 1: Platform-Specific Rules
```typescript
// Config: daily_reward_coins = 100
// Rule 1 (priority 1): iOS users >= 3.5.0 get 150
// Rule 2 (priority 2): Android users get 125

const iOSContext = {
  platform: 'iOS',
  version: '3.5.0'
};
// Result: Rule 1 matches, returns 150

const androidContext = {
  platform: 'Android',
  version: '2.0.0'
};
// Result: Rule 2 matches, returns 125

const webContext = {
  platform: 'Web'
};
// Result: No rule matches, returns default 100
```

### Example 2: Date-Based Activation
```typescript
// Rule: Country=DE, activeBetween Feb 1 - Feb 14, 2026
// Value: 200 coins (special promotion)

const context = {
  country: 'DE',
  serverTime: new Date('2026-02-05') // During range
};
// Result: Rule matches, returns 200

const afterContext = {
  country: 'DE',
  serverTime: new Date('2026-02-15') // After range
};
// Result: No match, returns default
```

### Example 3: Multi-Condition Rules
```typescript
// Rule: iOS AND version >= 3.5.0 AND country=US
// All conditions must match

const matchContext = {
  platform: 'iOS',
  version: '3.6.0',
  country: 'US'
};
// Result: Matches all conditions

const partialContext = {
  platform: 'iOS',
  version: '3.6.0',
  country: 'DE' // Country doesn't match
};
// Result: No match
```

## Error Handling

### Custom Errors
```typescript
import {
  ConfigNotFoundError,
  DuplicateConfigKeyError,
  MaxRulesExceededError,
  InvalidVersionFormatError
} from 'src/types/config.types';

try {
  await configService.createConfig({...});
} catch (error) {
  if (error instanceof DuplicateConfigKeyError) {
    res.status(409).json({ error: 'Key already exists' });
  } else if (error instanceof ConfigValueTooLargeError) {
    res.status(413).json({ error: 'Value too large' });
  }
}
```

## Constants & Limits

| Constraint | Value |
|-----------|-------|
| Max rules per config | 30 |
| Max value size | 100 KB |
| Cache TTL (default) | 5 minutes |
| Max key length | 64 chars |
| Max priority | 1000 |
| Min priority | 1 |

## Key Files Reference

| Component | File | Status |
|-----------|------|--------|
| Types | `src/types/config.types.ts` | ✅ Complete |
| API Types | `src/types/api.ts` | ✅ Complete |
| Rule Engine | `src/services/ruleEvaluator.ts` | ✅ Complete |
| Version Utils | `src/utils/semver.ts` | ✅ Complete |
| GeoIP Utils | `src/utils/geoip.ts` | ✅ Complete |
| Cache Service | `src/services/cacheService.ts` | ✅ Complete |
| Config Service | `src/services/configService.ts` | ✅ Complete |
| Config Validation | `src/middleware/validateConfig.ts` | ✅ Complete |
| Rule Validation | `src/middleware/validateRule.ts` | ✅ Complete |

## Next Phase: Controllers & Routes (Phase 3)

Ready to implement:
- Admin config controller
- Public config controller
- Express routes
- Auth middleware
- Rate limiting
- Integration tests

## Environment Variables

```bash
# Redis configuration
REDIS_URL=redis://localhost:6379

# Database
DATABASE_URL=postgresql://...

# Auth
JWT_SECRET=...
```

---

**For detailed implementation progress, see: PHASE_1_2_COMPLETE.md**

