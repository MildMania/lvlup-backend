# Implementation Plan: Remote Config System with Rule Overwrites

**Branch**: `001-remote-config` | **Date**: January 21, 2026 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/001-remote-config/spec.md`

## Summary

Build a comprehensive Remote Config System enabling game developers to modify game parameters remotely without app updates. System includes server-side rule evaluation engine supporting platform, version, country, date, and segment-based targeting with priority-based rule evaluation. Features admin dashboard for config management, Unity SDK integration, version history, and multi-environment support (dev/staging/production). Technical approach: Express.js API with Prisma/PostgreSQL for persistence, Redis for caching (5-min TTL), server-side rule evaluation with <50ms p95 latency, and Unity SDK with offline fallback support.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 18+, C# (Unity SDK)  
**Primary Dependencies**: Express.js, Prisma, PostgreSQL, Redis, React (admin UI), Unity 2021.3+  
**Storage**: PostgreSQL (configs, rules, audit history), Redis (caching, rate limiting)  
**Testing**: Jest (backend unit/integration), Unity Test Framework (SDK)  
**Target Platform**: Railway (backend), Unity games (iOS/Android/WebGL)  
**Project Type**: Web application (backend + frontend admin dashboard) + Unity SDK  
**Performance Goals**: <100ms p95 config fetch latency, 5-min cache TTL, <50ms rule evaluation  
**Constraints**: Max 30 rules per config, 100KB max value size, 100 req/min per gameId rate limit  
**Scale/Scope**: ~200-300 configs per game, 20-30 rules per config, multi-tenant (gameId isolation)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with LvlUp Analytics Platform Constitution (v1.0.0):

- [x] **Type Safety (I):** Explicit TypeScript types for all config/rule models, API contracts, SDK interfaces. No `any` usage.
- [x] **Data Integrity (II):** Timestamps for all config/rule changes, validation logic for semantic versions, date ranges, JSON syntax, unique constraints on keys and priorities.
- [x] **Testing (III):** Unit tests for rule evaluation engine, version comparison, date logic. Integration tests for API endpoints, cache invalidation, SDK fetch/cache behavior.
- [x] **Performance (IV):** Redis caching with 5-min TTL, cache key includes context (gameId, env, platform, version, country). Database indexes on gameId, environment, configId+priority. Max 30 rules limit ensures <50ms evaluation.
- [x] **API Design (V):** Public fetch endpoint backward compatible (optional query params). Admin endpoints versioned under /api/admin. ETag support for efficient caching.
- [x] **Security (VI):** Multi-tenant isolation via gameId filtering in all queries. JWT auth + gameAccess middleware on admin endpoints. Input validation for all config/rule fields. Rate limiting (100 req/min per gameId).
- [x] **Observability (VII):** Logging for rule evaluation decisions, cache hits/misses, validation errors, rule evaluation timeout warnings (>50ms). Audit trail for all config/rule changes.
- [x] **Documentation (VIII):** Inline documentation for rule evaluation algorithm, semantic version comparison logic, cache key generation strategy.

**Violations Requiring Justification:**
- None. All constitution principles are satisfied.

## Project Structure

### Documentation (this feature)

```text
specs/001-remote-config/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file (implementation plan)
├── research.md          # Phase 0 output (technical research)
├── data-model.md        # Phase 1 output (database schema design)
├── quickstart.md        # Phase 1 output (integration guide)
├── contracts/           # Phase 1 output (API request/response schemas)
│   ├── fetch-configs.md
│   ├── admin-configs.md
│   └── admin-rules.md
└── tasks.md             # Phase 2 output (NOT created by this plan)
```

### Source Code (repository root)

```text
# Backend structure (Web application pattern)
backend/
├── src/
│   ├── controllers/
│   │   ├── configController.ts      # Admin CRUD operations
│   │   └── publicConfigController.ts # Public fetch endpoint
│   ├── services/
│   │   ├── configService.ts         # Config business logic
│   │   ├── ruleEvaluator.ts         # Rule evaluation engine
│   │   ├── versionComparator.ts     # Semantic version comparison
│   │   └── cacheService.ts          # Redis cache abstraction
│   ├── middleware/
│   │   ├── validateConfig.ts        # Config validation middleware
│   │   └── validateRule.ts          # Rule validation middleware
│   ├── routes/
│   │   ├── configRoutes.ts          # Admin routes
│   │   └── publicConfigRoutes.ts    # Public routes
│   ├── types/
│   │   ├── config.types.ts          # Config/Rule TypeScript types
│   │   └── api.types.ts             # API request/response types
│   └── utils/
│       ├── semver.ts                # Semantic version utilities
│       └── geoip.ts                 # Country detection utilities
├── prisma/
│   ├── schema.prisma                # Enhanced with RemoteConfig, RuleOverwrite, ConfigHistory, RuleHistory
│   └── migrations/
└── tests/
    ├── unit/
    │   ├── ruleEvaluator.test.ts
    │   ├── versionComparator.test.ts
    │   └── configService.test.ts
    └── integration/
        ├── configApi.test.ts
        └── ruleEvaluation.test.ts

# Frontend structure
frontend/
├── src/
│   ├── pages/
│   │   └── RemoteConfig/
│   │       ├── ConfigList.tsx       # Config list with search/filter
│   │       ├── ConfigEditor.tsx     # Create/edit config form
│   │       ├── RuleEditor.tsx       # Create/edit rule form
│   │       ├── RuleList.tsx         # Draggable rule priority list
│   │       └── ConfigHistory.tsx    # Version history viewer
│   ├── components/
│   │   ├── ConfigForm.tsx
│   │   ├── RuleForm.tsx
│   │   └── DraggableRuleList.tsx   # Drag-and-drop component
│   ├── services/
│   │   └── configApi.ts            # API client for config endpoints
│   └── types/
│       └── config.types.ts         # Shared types with backend
└── tests/
    └── RemoteConfig/

# Unity SDK structure
Assets/lvlup-unity-sdk/
└── Runtime/
    └── Scripts/
        ├── RemoteConfigManager.cs   # Main SDK class
        ├── RemoteConfigModels.cs    # Config data models
        ├── RemoteConfigCache.cs     # Local caching logic
        └── RemoteConfigService.cs   # HTTP client for fetch
```

**Structure Decision**: Web application pattern (backend + frontend) with separate Unity SDK project. Backend follows existing lvlup-backend structure with controllers, services, middleware pattern. Frontend integrates into existing admin dashboard under RemoteConfig section. Unity SDK follows existing LvlUp SDK structure under Runtime/Scripts.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations detected. Plan adheres to all constitution principles.

---

## Phase 0: Research & Technical Discovery

### Research Questions

1. **Semantic Version Comparison**: How to reliably parse and compare semantic versions (3.5.0, 1.0.0-beta)? Research npm `semver` library for Node.js implementation patterns.

2. **Rule Evaluation Performance**: What's the optimal data structure for rule evaluation? Research strategies: early exit on first match, indexing by priority, pre-filtering rules by non-null conditions.

3. **Cache Invalidation Strategy**: How to invalidate cache for specific context combinations? Research Redis pattern matching (e.g., `remoteconfig:{gameId}:*` for all environments) vs. tracking cache keys.

4. **GeoIP Country Detection**: How to detect user country from IP? Research free GeoIP databases (MaxMind GeoLite2) and integration approaches.

5. **Unity PlayerPrefs Performance**: What's the performance impact of storing large JSON configs in PlayerPrefs? Research serialization overhead and alternative storage (StreamingAssets, custom cache file).

6. **Drag-and-Drop Implementation**: Which React library for drag-and-drop rule reordering? Research `react-beautiful-dnd` vs. `@dnd-kit` for accessibility and performance.

7. **Date Condition Evaluation**: How to handle timezone-independent scheduled activations? Confirm UTC server time usage and ISO 8601 timestamp format.

8. **Concurrent Rule Updates**: How to prevent race conditions when multiple admins reorder rules simultaneously? Research optimistic locking with version fields vs. database transactions.

### Research Deliverables

Document findings in `research.md`:
- Recommended libraries/approaches for each research question
- Code examples for semantic version comparison
- Cache invalidation pseudocode
- Performance benchmarks for rule evaluation (target: <50ms for 30 rules)
- Unity caching strategy recommendation
- Drag-and-drop library comparison table

---

## Phase 1: Design & Contracts

### 1.1 Database Schema Design

Create `data-model.md` with Prisma schema definitions:

**RemoteConfig Model**
```prisma
model RemoteConfig {
  id          String   @id @default(cuid())
  gameId      String
  key         String   // alphanumeric + underscores, max 64 chars
  value       Json     // Supports string, number, boolean, object
  dataType    String   // "string", "number", "boolean", "json"
  environment String   // "development", "staging", "production"
  enabled     Boolean  @default(true)
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  game           Game             @relation(fields: [gameId], references: [id], onDelete: Cascade)
  rules          RuleOverwrite[]
  history        ConfigHistory[]
  validationRules ValidationRule[]
  
  @@unique([gameId, environment, key])
  @@index([gameId, environment, enabled])
  @@map("remote_configs")
}
```

**RuleOverwrite Model**
```prisma
model RuleOverwrite {
  id                  String    @id @default(cuid())
  configId            String
  priority            Int       // Unique per config, ascending order
  enabled             Boolean   @default(true)
  overrideValue       Json      // Must match config dataType
  
  // Conditions (all nullable, null = "any")
  platformCondition   String?   // "iOS", "Android", "Web"
  versionOperator     String?   // "equal", "not_equal", "greater_than", etc.
  versionValue        String?   // Semantic version string
  countryCondition    String?   // ISO 3166-1 alpha-2 code
  segmentCondition    String?   // "new_users", "all_users", custom segment ID
  activeAfter         DateTime?
  activeBetweenStart  DateTime?
  activeBetweenEnd    DateTime?
  
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  
  config              RemoteConfig @relation(fields: [configId], references: [id], onDelete: Cascade)
  history             RuleHistory[]
  
  @@unique([configId, priority])
  @@index([configId, priority, enabled])
  @@map("rule_overwrites")
}
```

**ConfigHistory Model**
```prisma
model ConfigHistory {
  id            String   @id @default(cuid())
  configId      String
  changeType    String   // "created", "updated", "deleted", "rollback"
  previousValue Json?
  newValue      Json
  changedBy     String   // User ID or "system"
  changedAt     DateTime @default(now())
  
  config        RemoteConfig @relation(fields: [configId], references: [id], onDelete: Cascade)
  
  @@index([configId, changedAt])
  @@map("config_history")
}
```

**RuleHistory Model**
```prisma
model RuleHistory {
  id             String   @id @default(cuid())
  ruleId         String?  // Nullable (preserved after rule deletion)
  configId       String
  action         String   // "created", "updated", "deleted", "reordered"
  previousState  Json?
  newState       Json?
  changedBy      String
  changedAt      DateTime @default(now())
  
  rule           RuleOverwrite? @relation(fields: [ruleId], references: [id], onDelete: SetNull)
  
  @@index([configId, changedAt])
  @@map("rule_history")
}
```

**ValidationRule Model**
```prisma
model ValidationRule {
  id        String @id @default(cuid())
  configId  String
  ruleType  String // "min", "max", "regex", "maxLength"
  ruleValue String
  
  config    RemoteConfig @relation(fields: [configId], references: [id], onDelete: Cascade)
  
  @@map("validation_rules")
}
```

### 1.2 API Contract Specifications

Create `contracts/` directory with detailed request/response schemas:

**contracts/fetch-configs.md**
- `GET /api/configs/:gameId`
- Query params: `environment`, `platform`, `version`, `country`, `userId`
- Response: `{ configs: { [key: string]: any }, updatedAt: string, etag: string }`
- Server-side rule evaluation logic flow diagram
- Error codes: 404 (game not found), 429 (rate limit)

**contracts/admin-configs.md**
- `GET /api/admin/configs/:gameId` - List all configs
- `POST /api/admin/configs` - Create config
- `PUT /api/admin/configs/:id` - Update config
- `DELETE /api/admin/configs/:id` - Delete config
- `GET /api/admin/configs/:gameId/history/:key` - Get history
- Request/response schemas for each endpoint
- Validation rules documented

**contracts/admin-rules.md**
- `POST /api/admin/configs/:configId/rules` - Create rule
- `PUT /api/admin/configs/:configId/rules/:ruleId` - Update rule
- `DELETE /api/admin/configs/:configId/rules/:ruleId` - Delete rule
- `PUT /api/admin/configs/:configId/rules/reorder` - Batch priority update
- Rule condition validation rules
- Priority renumbering algorithm

### 1.3 Rule Evaluation Algorithm

Document in `data-model.md` under "Rule Evaluation Logic":

```typescript
// Pseudocode
function evaluateRules(config, context) {
  // 1. Check for active AB test (future integration point)
  if (hasActiveABTest(config.id)) {
    return getABTestValue(config.id, context.userId);
  }
  
  // 2. Fetch enabled rules sorted by priority ascending
  const rules = getRules(config.id, enabled: true, orderBy: priority ASC);
  
  // 3. Evaluate rules in priority order
  for (const rule of rules) {
    if (ruleMatches(rule, context)) {
      return rule.overrideValue;
    }
  }
  
  // 4. No rules matched, return default value
  return config.value;
}

function ruleMatches(rule, context) {
  // All conditions must match (AND logic)
  
  // Platform condition
  if (rule.platformCondition !== null && rule.platformCondition !== context.platform) {
    return false;
  }
  
  // Version condition
  if (rule.versionOperator !== null && rule.versionValue !== null) {
    if (!compareVersion(context.version, rule.versionOperator, rule.versionValue)) {
      return false;
    }
  }
  
  // Country condition
  if (rule.countryCondition !== null && rule.countryCondition !== context.country) {
    return false;
  }
  
  // Segment condition (skip for now - future integration)
  if (rule.segmentCondition !== null) {
    return false; // Not yet supported
  }
  
  // Date conditions
  const now = new Date(); // Server UTC time
  
  if (rule.activeAfter !== null && now < rule.activeAfter) {
    return false;
  }
  
  if (rule.activeBetweenStart !== null && rule.activeBetweenEnd !== null) {
    if (now < rule.activeBetweenStart || now > rule.activeBetweenEnd) {
      return false;
    }
  }
  
  // All conditions matched
  return true;
}
```

### 1.4 Caching Strategy

Document in `data-model.md` under "Caching Strategy":

**Cache Key Format**:
```
remoteconfig:{gameId}:{environment}:{platform}:{version}:{country}
```

**Cache Invalidation**:
- On config create/update/delete: Invalidate all keys matching `remoteconfig:{gameId}:{environment}:*`
- On rule create/update/delete/reorder: Invalidate all keys matching `remoteconfig:{gameId}:{environment}:*`
- Use Redis `SCAN` with pattern matching to find and delete keys
- TTL: 5 minutes (aligns with spec requirement)

**Cache Value Structure**:
```json
{
  "configs": {
    "daily_reward_coins": 150,
    "max_health": 100,
    "enable_pvp": true
  },
  "updatedAt": "2026-01-21T10:30:00Z",
  "etag": "hash_of_configs"
}
```

### 1.5 Unity SDK Integration Design

Document in `quickstart.md`:

**SDK Architecture**:
```
RemoteConfigManager (singleton)
├── RemoteConfigService (HTTP client)
├── RemoteConfigCache (PlayerPrefs wrapper)
└── RemoteConfigModels (data classes)
```

**Usage Flow**:
1. Initialize SDK: `await LvlUpSDK.RemoteConfig.FetchAsync()`
2. Access values: `int maxHealth = LvlUpSDK.RemoteConfig.GetInt("max_health", 100)`
3. Listen for updates: `LvlUpSDK.RemoteConfig.OnConfigsUpdated += OnConfigsChanged`

**Fetch Request Context**:
- Platform: `Application.platform` → "iOS"/"Android"/"WebGL"
- Version: `Application.version` → "3.5.0"
- Country: From existing GeoLocation service or header
- Sent as query params: `?environment=production&platform=iOS&version=3.5.0&country=US`

**Offline Behavior**:
- Check cache first (if < 5 min old, use immediately)
- Attempt network fetch in background
- If fetch fails, continue using cache
- If no cache exists, use default values

### 1.6 Admin Dashboard UI Design

Create wireframe/component specs in `quickstart.md`:

**Config List Page**:
- Search bar (filter by key name)
- Filter dropdowns (environment, enabled status)
- Table columns: Key, Value Preview, Type, Environment, Enabled, Rules Count, Updated
- Actions: Edit, Delete, View History, Toggle Enabled

**Config Editor Page**:
- Form fields: Key, Value (type-specific input), Data Type, Environment, Description
- Validation Rules section (optional min/max/regex)
- Rules section (list of rules with priority order)
- "Add Rule" button
- Save/Cancel buttons

**Rule Editor Modal**:
- Priority field (auto-assigned, can be reordered via drag-and-drop)
- Override Value field (matches config type)
- Conditions section:
  - Platform dropdown (iOS/Android/Web/Any)
  - Version operator + value (>=, <=, ==, etc.)
  - Country dropdown (ISO codes)
  - Segment dropdown (New Users/All Users/Custom - with "pending" badge)
  - Date activation: Radio buttons (None/After/Between) + date pickers
- Enable/Disable toggle
- Save/Cancel buttons

**Draggable Rule List Component**:
- Each rule card shows: Priority, Conditions summary, Override value
- Drag handle on left
- Edit/Delete/Toggle buttons on right
- After reorder, shows "Save Changes" button
- On save, sends batch priority update to API

---

## Phase 2: Implementation Tasks

*Note: Detailed task breakdown will be generated by `/speckit.tasks` command.*

High-level implementation phases:

### Phase 2.1: Database & Models (P1)
- Create Prisma migrations for RemoteConfig, RuleOverwrite, ConfigHistory, RuleHistory, ValidationRule
- Generate Prisma client
- Create TypeScript types/interfaces
- Test migrations on dev database

### Phase 2.2: Core Services (P1)
- Implement `ruleEvaluator.ts` with evaluation algorithm
- Implement `versionComparator.ts` with semantic version logic
- Implement `configService.ts` with CRUD operations
- Implement `cacheService.ts` Redis abstraction
- Write unit tests for rule evaluation, version comparison

### Phase 2.3: API Endpoints (P1)
- Implement public fetch endpoint with rule evaluation
- Implement admin CRUD endpoints (create, update, delete configs)
- Implement rule management endpoints (create, update, delete, reorder)
- Add validation middleware
- Add rate limiting
- Write integration tests

### Phase 2.4: Audit Trail (P1)
- Implement ConfigHistory recording on all config changes
- Implement RuleHistory recording on all rule changes
- Implement version history API endpoint
- Implement rollback functionality
- Test history preservation on delete

### Phase 2.5: Unity SDK (P1)
- Implement RemoteConfigManager singleton
- Implement fetch with retry logic
- Implement local cache with PlayerPrefs
- Implement type-safe getters with defaults
- Implement offline fallback
- Write Unity tests

### Phase 2.6: Admin Dashboard UI (P2)
- Implement ConfigList page with search/filter
- Implement ConfigEditor page with form validation
- Implement RuleEditor modal
- Implement DraggableRuleList component
- Implement ConfigHistory viewer
- Connect to API endpoints
- Add loading states and error handling

### Phase 2.7: Testing & Validation (P1)
- End-to-end testing of config fetch with various rule combinations
- Performance testing (rule evaluation latency, cache hit rates)
- Load testing (rate limits, concurrent updates)
- Unity SDK integration testing in sample game
- Admin UI usability testing

### Phase 2.8: Documentation (P2)
- API documentation (endpoints, schemas, examples)
- Unity SDK documentation (quickstart, API reference)
- Admin dashboard user guide
- Migration guide for existing configs (if any)

### Phase 2.9: Deployment (P1)
- Deploy database migrations to Railway
- Deploy backend API updates
- Deploy frontend dashboard updates
- Publish Unity SDK package
- Monitor logs for errors
- Verify caching behavior in production

---

## Phase 3: Testing Strategy

### Unit Tests

**Backend**:
- `ruleEvaluator.test.ts`: Test all condition combinations (platform, version, country, date)
- `versionComparator.test.ts`: Test semantic version comparison edge cases
- `configService.test.ts`: Test CRUD operations, validation logic
- `cacheService.test.ts`: Test cache key generation, invalidation patterns

**Unity SDK**:
- `RemoteConfigCache.test.cs`: Test cache expiration, serialization
- `RemoteConfigService.test.cs`: Test HTTP requests, error handling
- `RemoteConfigManager.test.cs`: Test getters, type coercion, defaults

### Integration Tests

**Backend**:
- `configApi.test.ts`: Test full API endpoints with real database
- `ruleEvaluation.test.ts`: Test end-to-end rule evaluation with various contexts
- `cacheInvalidation.test.ts`: Test cache invalidation on config/rule changes
- `auditTrail.test.ts`: Test history recording and rollback

**Unity SDK**:
- Integration test in sample Unity project
- Test online/offline scenarios
- Test cache persistence across app restarts

### Performance Tests

- Benchmark rule evaluation latency (target: <50ms for 30 rules)
- Benchmark cache hit rate (expect >90% after warmup)
- Load test fetch endpoint (target: 100 req/min sustained)
- Test concurrent rule reordering (ensure no race conditions)

### Edge Case Tests

- Test version comparison with pre-release versions (1.0.0-beta)
- Test date conditions at exact boundary times
- Test missing context data (no country, no version)
- Test cache invalidation during concurrent updates
- Test rule priority gaps (1, 2, 5, 7 → reorder → 1, 2, 3, 4)

---

## Phase 4: Performance Optimization

### Identified Optimizations

1. **Database Indexes**:
   - `(gameId, environment, enabled)` on RemoteConfig
   - `(configId, priority, enabled)` on RuleOverwrite
   - `(configId, changedAt)` on ConfigHistory, RuleHistory

2. **Rule Pre-filtering**:
   - Before evaluation, filter rules by non-null conditions matching context
   - Example: If context.platform = "iOS", only evaluate rules with platformCondition = "iOS" or null

3. **Cache Warming**:
   - Pre-populate cache for common contexts on config update
   - Example: After updating config, fetch for all platforms to warm cache

4. **Lazy History Loading**:
   - Load history only when user clicks "View History" (not on page load)
   - Paginate history results (50 entries per page)

5. **Unity Cache Optimization**:
   - Store configs in binary format (MessagePack) instead of JSON for faster deserialization
   - Investigate `Application.persistentDataPath` instead of PlayerPrefs for large configs

### Performance Monitoring

- Log rule evaluation time for requests >50ms
- Track cache hit/miss rates via Redis INFO stats
- Monitor fetch endpoint p95/p99 latency via Railway metrics
- Alert on rate limit threshold (>80% of limit)

---

## Phase 5: Deployment Plan

### Pre-Deployment Checklist

- [ ] All unit tests passing (100% coverage on rule evaluation logic)
- [ ] All integration tests passing
- [ ] Performance benchmarks meet targets (<100ms p95 fetch latency)
- [ ] Database migrations reviewed and tested on staging
- [ ] Admin dashboard tested on staging with real data
- [ ] Unity SDK tested in sample game project
- [ ] API documentation complete
- [ ] Rate limiting configured and tested

### Deployment Steps

1. **Database Migration** (Railway production):
   ```bash
   npm run db:migrate
   ```
   - Apply RemoteConfig, RuleOverwrite, ConfigHistory, RuleHistory, ValidationRule tables
   - Verify migrations with `prisma studio`

2. **Backend Deployment**:
   - Merge `001-remote-config` branch to `main`
   - Railway auto-deploys from main branch
   - Verify health check endpoint: `GET /api/health`
   - Test config fetch endpoint with sample gameId

3. **Frontend Deployment**:
   - Frontend auto-deploys with Railway backend
   - Verify admin dashboard loads: `/admin/remote-config`
   - Test creating a sample config via UI

4. **Unity SDK Publishing**:
   - Tag Unity SDK release: `v1.1.0-remoteconfig`
   - Update package.json in Unity SDK
   - Publish to Unity Package Manager or GitHub releases
   - Update quickstart documentation

5. **Smoke Tests**:
   - Create test config via admin dashboard
   - Fetch config from Unity SDK in test game
   - Update config, verify cache invalidation
   - Create rule overwrite, verify server-side evaluation

### Rollback Plan

If critical issues detected:

1. **Revert Backend**:
   - Revert Railway deployment to previous commit
   - Rollback database migration: `prisma migrate revert`

2. **Feature Flag Disable**:
   - Add feature flag `REMOTE_CONFIG_ENABLED=false` in Railway env vars
   - Routes return 503 with message "Feature temporarily disabled"

3. **Unity SDK Rollback**:
   - Games using SDK v1.0.0 (without remote config) continue working
   - Games using SDK v1.1.0 fall back to default values

### Post-Deployment Monitoring

- Monitor error logs for validation failures, rule evaluation errors
- Track fetch endpoint latency (target: <100ms p95)
- Monitor cache hit rate (expect >90%)
- Track API usage per gameId
- Monitor rate limit violations
- Review audit trail for unexpected admin operations

---

## Open Questions & Risks

### Open Questions

1. **GeoIP Integration**: Should we integrate MaxMind GeoLite2 directly or rely on client-provided country? (Decision: Start with client-provided, add GeoIP in future iteration)

2. **Rule Priority Gaps**: If admin deletes priority 3 from [1,2,3,4,5], should system auto-renumber to [1,2,3,4]? (Decision: Keep gaps, allow manual reorder if desired)

3. **AB Test Integration**: What API contract should we define for future AB test integration? (Decision: Add hook in rule evaluator, return early if AB test active)

4. **Unity SDK Version**: Should SDK support Unity 2019.4+ or only 2021.3+? (Decision: Target 2021.3+ for async/await support)

5. **Config Import Format**: Should import support CSV or only JSON? (Decision: JSON only for initial release, CSV in future)

### Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Rule evaluation performance >50ms with 30 rules | High | Low | Pre-filtering rules, early exit on match, performance tests |
| Cache invalidation pattern matching slow in Redis | Medium | Medium | Limit pattern matching scope, consider explicit cache key tracking |
| Semantic version comparison bugs with pre-release versions | Medium | Medium | Extensive unit tests, use battle-tested semver library |
| Unity PlayerPrefs performance with large JSON configs | Medium | Low | Benchmark with real data, fallback to custom file storage |
| Concurrent rule reordering causing priority conflicts | High | Low | Database unique constraint on (configId, priority), optimistic locking |
| Admin dashboard drag-and-drop UX complexity | Low | Medium | Use well-tested library (react-beautiful-dnd), prototype early |
| GeoIP database licensing issues | Medium | Low | Start with client-provided country, add GeoIP as optional enhancement |
| Rate limiting too aggressive for legitimate usage | Medium | Medium | Monitor rate limit violations, adjust thresholds based on real data |

---

## Success Criteria

### Functional Criteria

- [ ] Admins can create, update, delete configs via dashboard
- [ ] Admins can create rules with all condition types (platform, version, country, date)
- [ ] Admins can reorder rule priorities via drag-and-drop
- [ ] Unity SDK fetches configs with server-side rule evaluation
- [ ] Unity SDK caches configs and works offline
- [ ] Config changes reflected in clients within 5 minutes
- [ ] Version history preserved for all configs and rules
- [ ] Audit trail records all admin operations

### Performance Criteria

- [ ] Config fetch endpoint p95 latency <100ms
- [ ] Rule evaluation completes in <50ms for 30 rules
- [ ] Cache hit rate >90% after warmup period
- [ ] Rate limiting prevents abuse (100 req/min per gameId)
- [ ] Database queries use indexes (verify with EXPLAIN)

### Quality Criteria

- [ ] Unit test coverage >90% on rule evaluation logic
- [ ] All integration tests passing
- [ ] No TypeScript `any` types in config/rule code
- [ ] All API endpoints documented with examples
- [ ] Unity SDK documentation includes quickstart guide
- [ ] Admin dashboard passes accessibility audit (WCAG 2.1 AA)

### User Experience Criteria

- [ ] Admin can create a config in <30 seconds
- [ ] Admin can reorder rules without confusion (drag-and-drop intuitive)
- [ ] Unity SDK initialization never blocks game startup
- [ ] Validation errors are clear and actionable
- [ ] History viewer shows meaningful change summaries

---

## Future Enhancements (Out of Scope)

- **AB Test Integration**: Full AB test system with variant assignment, statistical significance testing
- **Segmentation System**: Custom user segments based on behavior, properties, cohorts
- **Config Analytics**: Track which configs are most frequently accessed, usage heatmaps
- **Multi-Language Support**: Config values in multiple languages with locale-based selection
- **Config Dependencies**: Define dependencies between configs (e.g., enable_feature requires feature_key)
- **Real-Time Updates**: WebSocket push for instant config updates without polling
- **Config Templates**: Predefined config templates for common use cases (economy, difficulty settings)
- **Approval Workflow**: Multi-stage approval for config changes (review, approve, publish)
- **Environment Sync**: Bulk copy all configs from staging to production with one click
- **Config Diff Viewer**: Visual diff between two config versions or environments
- **CSV Import/Export**: Support CSV format for bulk operations
- **Config Scheduler**: Schedule config changes for specific dates without rules
- **GeoIP Integration**: Automatic country detection from IP address
- **Rule Simulation**: Preview which users would match a rule before saving

---

## Appendix

### Glossary

- **Remote Config**: A key-value pair that can be fetched by game clients remotely
- **Rule Overwrite**: A conditional override for a config value based on targeting rules
- **Priority**: Numeric order for rule evaluation (1 = highest priority, evaluated first)
- **Environment**: Deployment stage (development, staging, production)
- **Semantic Version**: Version format following semver.org spec (major.minor.patch)
- **ETag**: HTTP header for cache validation based on content hash
- **Cache Invalidation**: Removing cached data when source data changes
- **Audit Trail**: Historical record of all changes for compliance and debugging

### References

- [Feature Specification](./spec.md)
- [Semantic Versioning Spec](https://semver.org/)
- [ISO 3166-1 Country Codes](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [React Beautiful DnD](https://github.com/atlassian/react-beautiful-dnd)
- [Unity PlayerPrefs](https://docs.unity3d.com/ScriptReference/PlayerPrefs.html)

### Version History

- **v1.0.0** (2026-01-21): Initial implementation plan created

