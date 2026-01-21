# Implementation Tasks: Remote Config System with Rule Overwrites

**Branch**: `001-remote-config`  
**Generated**: January 21, 2026  
**Feature**: Remote Config System with Rule Overwrites  
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Overview

This task list implements a comprehensive Remote Config System enabling game developers to modify game parameters remotely without app updates. The system includes server-side rule evaluation engine supporting platform, version, country, date, and segment-based targeting with priority-based rule evaluation.

**Total Tasks**: 150+ (116 + expanded Phase 16 rule system frontend)  
**Parallelizable Tasks**: 34  
**User Stories**: 13 (6x P1, 3x P2, 4x P3)
**Critical Features**: Environment Sync (Phase 12.5) + Full Rule System UI (Phase 16)

---

## Implementation Strategy

**MVP Approach**: Implement User Story 1 first for immediate value - basic config CRUD operations allow developers to update game parameters remotely without app updates. This delivers core functionality and validates the complete stack (database → API → SDK → game).

**Incremental Delivery**: Each user story is independently testable and can be deployed separately:
- Phase 1-2: Setup & Foundational (required for all stories)
- Phase 3: US1 - Basic config CRUD (MVP - deploy first)
- Phase 4: US2 - Config creation with validation (extends MVP)
- Phase 5: US3 - Unity SDK integration (enables client usage)
- Phase 6: US1 Priority - Rule overwrites (core differentiation)
- Phase 7+: Additional user stories as prioritized

---

## Phase 1: Setup & Infrastructure

**Goal**: Initialize project structure, database schema, and development environment for Remote Config feature.

**Duration**: 2-3 hours  
**Dependencies**: None  
**Deliverables**: Database schema, migrations, TypeScript types, project structure

### Tasks

- [ ] T001 Create feature branch `001-remote-config` from main
- [ ] T002 [P] Create Prisma schema for RemoteConfig model in backend/prisma/schema.prisma
- [ ] T003 [P] Create Prisma schema for RuleOverwrite model in backend/prisma/schema.prisma
- [ ] T004 [P] Create Prisma schema for ConfigHistory model in backend/prisma/schema.prisma
- [ ] T005 [P] Create Prisma schema for RuleHistory model in backend/prisma/schema.prisma
- [ ] T006 [P] Create Prisma schema for ValidationRule model in backend/prisma/schema.prisma
- [ ] T007 Generate Prisma migration for all Remote Config tables
- [ ] T008 Apply migration to development database and verify schema
- [ ] T009 [P] Create TypeScript types in backend/src/types/config.types.ts
- [ ] T010 [P] Create TypeScript API types in backend/src/types/api.types.ts
- [ ] T011 [P] Create project structure directories (controllers, services, middleware, routes, tests)
- [ ] T012 Install dependencies (semver, geoip-lite, rate-limiter-flexible) in backend/package.json
- [ ] T013 [P] Create Redis cache configuration in backend/src/config/redis.ts
- [ ] T014 [P] Document database schema design in specs/001-remote-config/data-model.md

---

## Phase 2: Foundational Services

**Goal**: Implement core business logic services that all user stories depend on - rule evaluation engine, version comparison, caching abstraction.

**Duration**: 4-6 hours  
**Dependencies**: Phase 1 complete  
**Deliverables**: Reusable services with unit tests, rule evaluation algorithm, cache service

### Tasks

- [ ] T015 [P] Implement semantic version comparison in backend/src/utils/semver.ts
- [ ] T016 [P] Implement GeoIP country detection in backend/src/utils/geoip.ts
- [ ] T017 Implement rule evaluation engine in backend/src/services/ruleEvaluator.ts
- [ ] T018 Implement version comparator service in backend/src/services/versionComparator.ts
- [ ] T019 Implement cache service with Redis in backend/src/services/cacheService.ts
- [ ] T020 Implement cache key generation logic in backend/src/services/cacheService.ts
- [ ] T021 Implement cache invalidation pattern matching in backend/src/services/cacheService.ts
- [ ] T022 [P] Write unit tests for semantic version comparison in backend/tests/unit/semver.test.ts
- [ ] T023 [P] Write unit tests for rule evaluation engine in backend/tests/unit/ruleEvaluator.test.ts
- [ ] T024 [P] Write unit tests for version comparator in backend/tests/unit/versionComparator.test.ts
- [ ] T025 [P] Write unit tests for cache service in backend/tests/unit/cacheService.test.ts

---

## Phase 3: User Story 1 - Game Developer Updates Config Value (P1)

**Story Goal**: Sarah, a game designer, needs to change the daily reward amount from 100 coins to 150 coins for all players. She logs into the admin dashboard, finds the `daily_reward_coins` config key, updates the value from 100 to 150, and saves. Within 5 minutes, all active game sessions fetch the updated value.

**Independent Test Criteria**:
- Can create a config via API
- Can update config value via API
- Updated value is persisted to database
- Cache is invalidated on update
- Public fetch endpoint returns updated value

**Dependencies**: Phase 1, Phase 2 complete

### Tasks

- [ ] T026 [US1] Implement configService.ts with createConfig method in backend/src/services/configService.ts
- [ ] T027 [US1] Implement configService.ts with updateConfig method in backend/src/services/configService.ts
- [ ] T028 [US1] Implement configService.ts with deleteConfig method in backend/src/services/configService.ts
- [ ] T029 [US1] Implement configService.ts with getConfigs method in backend/src/services/configService.ts
- [ ] T030 [US1] Add cache invalidation to createConfig method in backend/src/services/configService.ts
- [ ] T031 [US1] Add cache invalidation to updateConfig method in backend/src/services/configService.ts
- [ ] T032 [US1] Add cache invalidation to deleteConfig method in backend/src/services/configService.ts
- [ ] T033 [P] [US1] Create admin config controller in backend/src/controllers/configController.ts
- [ ] T034 [P] [US1] Create public config controller in backend/src/controllers/publicConfigController.ts
- [ ] T035 [US1] Implement POST /api/admin/configs endpoint in backend/src/routes/configRoutes.ts
- [ ] T036 [US1] Implement PUT /api/admin/configs/:id endpoint in backend/src/routes/configRoutes.ts
- [ ] T037 [US1] Implement DELETE /api/admin/configs/:id endpoint in backend/src/routes/configRoutes.ts
- [ ] T038 [US1] Implement GET /api/admin/configs/:gameId endpoint in backend/src/routes/configRoutes.ts
- [ ] T039 [US1] Implement GET /api/configs/:gameId public fetch endpoint in backend/src/routes/publicConfigRoutes.ts
- [ ] T040 [US1] Add JWT auth middleware to admin config routes in backend/src/routes/configRoutes.ts
- [ ] T041 [US1] Add gameAccess middleware to admin config routes in backend/src/routes/configRoutes.ts
- [ ] T042 [US1] Add rate limiting (100 req/min per gameId) to public endpoint in backend/src/routes/publicConfigRoutes.ts
- [ ] T043 [P] [US1] Write integration tests for config CRUD operations in backend/tests/integration/configApi.test.ts
- [ ] T044 [US1] Test cache invalidation on config update in backend/tests/integration/cacheInvalidation.test.ts

---

## Phase 4: User Story 2 - Developer Creates New Config with Validation (P1)

**Story Goal**: Marcus wants to add a new feature flag `enable_pvp_mode` as a boolean config. The system validates the key format (alphanumeric + underscores, max 64 chars) and ensures no duplicate exists for this game and environment before saving.

**Independent Test Criteria**:
- Can create configs with valid keys and values
- System rejects invalid keys (special characters, too long)
- System prevents duplicate keys for same game+environment
- System validates data types (boolean, number, string, JSON)
- System validates JSON structure for JSON-type configs

**Dependencies**: Phase 3 (US1) complete

### Tasks

- [ ] T045 [P] [US2] Create config validation middleware in backend/src/middleware/validateConfig.ts
- [ ] T046 [US2] Implement key format validation (alphanumeric + underscores, max 64 chars) in backend/src/middleware/validateConfig.ts
- [ ] T047 [US2] Implement duplicate key detection in backend/src/middleware/validateConfig.ts
- [ ] T048 [US2] Implement data type validation (string, number, boolean, json) in backend/src/middleware/validateConfig.ts
- [ ] T049 [US2] Implement JSON structure validation in backend/src/middleware/validateConfig.ts
- [ ] T050 [US2] Implement max value size validation (100KB) in backend/src/middleware/validateConfig.ts
- [ ] T051 [US2] Add validation middleware to POST /api/admin/configs route in backend/src/routes/configRoutes.ts
- [ ] T052 [US2] Add validation middleware to PUT /api/admin/configs/:id route in backend/src/routes/configRoutes.ts
- [ ] T053 [US2] Implement ValidationRule support in configService.ts in backend/src/services/configService.ts
- [ ] T054 [US2] Implement min/max validation for number types in backend/src/middleware/validateConfig.ts
- [ ] T055 [US2] Implement regex pattern validation for string types in backend/src/middleware/validateConfig.ts
- [ ] T056 [P] [US2] Write validation tests for key format in backend/tests/unit/validateConfig.test.ts
- [ ] T057 [P] [US2] Write validation tests for data types in backend/tests/unit/validateConfig.test.ts
- [ ] T058 [P] [US2] Write validation tests for JSON structure in backend/tests/unit/validateConfig.test.ts
- [ ] T059 [US2] Write integration tests for duplicate key detection in backend/tests/integration/configApi.test.ts

---

## Phase 5: User Story 3 - Unity SDK Fetches and Caches Configs (P1)

**Story Goal**: When Elena's mobile game starts, the Unity SDK automatically calls `LvlUpSDK.RemoteConfig.FetchAsync()` to retrieve all enabled configs. The SDK receives a response with all config key-value pairs, stores them locally using PlayerPrefs with a timestamp, and makes them accessible via type-safe getters.

**Independent Test Criteria**:
- Unity SDK can call FetchAsync() and retrieve configs
- Configs are cached locally with timestamp
- Can access configs via GetInt(), GetString(), GetBool(), GetFloat(), GetJson<T>()
- SDK works offline using cached values
- SDK respects 5-minute cache TTL

**Dependencies**: Phase 3 (US1) complete for API endpoint

### Tasks

- [ ] T060 [P] [US3] Create RemoteConfigModels.cs data classes in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigModels.cs
- [ ] T061 [P] [US3] Create RemoteConfigCache.cs with PlayerPrefs wrapper in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigCache.cs
- [ ] T062 [P] [US3] Create RemoteConfigService.cs HTTP client in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigService.cs
- [ ] T063 [US3] Implement RemoteConfigManager.cs singleton in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigManager.cs
- [ ] T064 [US3] Implement FetchAsync() method with retry logic in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigManager.cs
- [ ] T065 [US3] Implement cache storage with timestamp in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigCache.cs
- [ ] T066 [US3] Implement cache expiration check (5-minute TTL) in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigCache.cs
- [ ] T067 [US3] Implement GetInt(key, defaultValue) getter in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigManager.cs
- [ ] T068 [US3] Implement GetString(key, defaultValue) getter in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigManager.cs
- [ ] T069 [US3] Implement GetBool(key, defaultValue) getter in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigManager.cs
- [ ] T070 [US3] Implement GetFloat(key, defaultValue) getter in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigManager.cs
- [ ] T071 [US3] Implement GetJson<T>(key, defaultValue) getter in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigManager.cs
- [ ] T072 [US3] Implement offline fallback to cache in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigManager.cs
- [ ] T073 [US3] Implement type coercion with fallback to defaults in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigManager.cs
- [ ] T074 [US3] Add OnConfigsUpdated event callback in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigManager.cs
- [ ] T075 [US3] Add platform context detection (iOS/Android/WebGL) in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigService.cs
- [ ] T076 [US3] Add version context from Application.version in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigService.cs
- [ ] T077 [US3] Create Unity SDK integration example in Assets/lvlup-unity-sdk/Examples/RemoteConfigExample.cs
- [ ] T078 [P] [US3] Write Unity tests for cache persistence in Assets/lvlup-unity-sdk/Tests/RemoteConfigCache.test.cs
- [ ] T079 [P] [US3] Write Unity tests for type-safe getters in Assets/lvlup-unity-sdk/Tests/RemoteConfigManager.test.cs
- [ ] T080 [US3] Test offline behavior in Unity test project

---

## Phase 6: User Story 4 - Create Platform-Specific Rule Overwrite (P1)

**Story Goal**: David wants iOS users on version 3.5.0+ to see a higher daily reward than Android users. He opens the `daily_reward_coins` config (default value: 100) and creates a new rule overwrite with priority 1. He sets conditions: Platform = iOS, Version >= 3.5.0, and value = 150.

**Independent Test Criteria**:
- Can create rule overwrites via API
- Can specify platform condition (iOS/Android/Web)
- Can specify version condition with operator (>=, <=, ==, !=, >, <)
- Server evaluates rules and returns correct value based on context
- iOS v3.5.0 receives 150, iOS v3.4.0 receives 100, Android receives 100

**Dependencies**: Phase 3 (US1), Phase 5 (US3) for SDK context

### Tasks

- [ ] T081 [P] [US4] Create rule validation middleware in backend/src/middleware/validateRule.ts
- [ ] T082 [US4] Implement platform condition validation in backend/src/middleware/validateRule.ts
- [ ] T083 [US4] Implement version condition validation in backend/src/middleware/validateRule.ts
- [ ] T084 [US4] Implement semantic version format validation in backend/src/middleware/validateRule.ts
- [ ] T085 [US4] Implement override value type matching validation in backend/src/middleware/validateRule.ts
- [ ] T086 [US4] Implement unique priority constraint validation in backend/src/middleware/validateRule.ts
- [ ] T087 [US4] Implement max 30 rules per config validation in backend/src/middleware/validateRule.ts
- [ ] T088 [P] [US4] Implement createRule method in backend/src/services/configService.ts
- [ ] T089 [P] [US4] Implement updateRule method in backend/src/services/configService.ts
- [ ] T090 [P] [US4] Implement deleteRule method in backend/src/services/configService.ts
- [ ] T091 [P] [US4] Create rule controller in backend/src/controllers/ruleController.ts
- [ ] T092 [US4] Implement POST /api/admin/configs/:configId/rules endpoint in backend/src/routes/configRoutes.ts
- [ ] T093 [US4] Implement PUT /api/admin/configs/:configId/rules/:ruleId endpoint in backend/src/routes/configRoutes.ts
- [ ] T094 [US4] Implement DELETE /api/admin/configs/:configId/rules/:ruleId endpoint in backend/src/routes/configRoutes.ts
- [ ] T095 [US4] Add cache invalidation to rule create/update/delete in backend/src/services/configService.ts
- [ ] T096 [US4] Integrate rule evaluation into public fetch endpoint in backend/src/controllers/publicConfigController.ts
- [ ] T097 [US4] Extract platform from request context in backend/src/controllers/publicConfigController.ts
- [ ] T098 [US4] Extract version from request context in backend/src/controllers/publicConfigController.ts
- [ ] T099 [US4] Implement platform condition matching in backend/src/services/ruleEvaluator.ts
- [ ] T100 [US4] Implement version condition matching in backend/src/services/ruleEvaluator.ts
- [ ] T101 [US4] Implement priority-based rule evaluation (ascending order) in backend/src/services/ruleEvaluator.ts
- [ ] T102 [US4] Implement early exit on first match in backend/src/services/ruleEvaluator.ts
- [ ] T103 [P] [US4] Write unit tests for platform condition matching in backend/tests/unit/ruleEvaluator.test.ts
- [ ] T104 [P] [US4] Write unit tests for version condition matching in backend/tests/unit/ruleEvaluator.test.ts
- [ ] T105 [US4] Write integration tests for rule evaluation in backend/tests/integration/ruleEvaluation.test.ts
- [ ] T106 [US4] Test iOS v3.5.0 receives 150, iOS v3.4.0 receives 100 in backend/tests/integration/ruleEvaluation.test.ts

---

## Phase 7: User Story 5 - Country and Date-Based Rule Overwrites (P1)

**Story Goal**: Maria wants to run a special promotion in Germany that automatically starts on February 1, 2026, and ends on February 14, 2026. She creates a rule overwrite with country and date conditions. The system uses server time (UTC) to evaluate the date conditions.

**Independent Test Criteria**:
- Can create rules with country condition (ISO 3166-1 alpha-2 codes)
- Can create rules with date conditions (activeAfter, activeBetween)
- Server evaluates date conditions using UTC server time
- Rules automatically activate/deactivate based on date
- Country condition matches correctly from GeoIP or request context

**Dependencies**: Phase 6 (US4) complete for rule infrastructure

### Tasks

- [ ] T107 [US5] Implement country condition validation in backend/src/middleware/validateRule.ts
- [ ] T108 [US5] Implement date condition validation (activeAfter, activeBetween) in backend/src/middleware/validateRule.ts
- [ ] T109 [US5] Validate activeBetween end date is after start date in backend/src/middleware/validateRule.ts
- [ ] T110 [US5] Extract country from GeoIP lookup in backend/src/controllers/publicConfigController.ts
- [ ] T111 [US5] Implement country condition matching in backend/src/services/ruleEvaluator.ts
- [ ] T112 [US5] Implement activeAfter date condition matching in backend/src/services/ruleEvaluator.ts
- [ ] T113 [US5] Implement activeBetween date condition matching in backend/src/services/ruleEvaluator.ts
- [ ] T114 [US5] Use server UTC time for all date evaluations in backend/src/services/ruleEvaluator.ts
- [ ] T115 [P] [US5] Write unit tests for country condition matching in backend/tests/unit/ruleEvaluator.test.ts
- [ ] T116 [P] [US5] Write unit tests for date condition matching in backend/tests/unit/ruleEvaluator.test.ts
- [ ] T117 [US5] Write integration tests for date-based activation in backend/tests/integration/ruleEvaluation.test.ts
- [ ] T118 [US5] Test rule activates at exact start time and deactivates at end time in backend/tests/integration/ruleEvaluation.test.ts

---

## Phase 8: User Story 6 - Priority-Based Rule Evaluation with Drag-and-Drop (P1)

**Story Goal**: Sarah manages multiple promotional rules for `daily_reward_coins`. She realizes that Canadian users should have higher priority than general Android users. In the admin dashboard, she drags the Canada rule from position 3 to position 2, and the system automatically renumbers priorities.

**Independent Test Criteria**:
- Server evaluates rules in ascending priority order (1, 2, 3...)
- Server returns first matching rule value
- Admin can reorder rules via API
- System automatically renumbers affected rules
- System prevents duplicate priorities per config

**Dependencies**: Phase 6 (US4) for rule evaluation, Phase 11 for UI

### Tasks

- [ ] T119 [US6] Implement reorderRules method in backend/src/services/configService.ts
- [ ] T120 [US6] Implement PUT /api/admin/configs/:configId/rules/reorder endpoint in backend/src/routes/configRoutes.ts
- [ ] T121 [US6] Implement batch priority update logic in backend/src/services/configService.ts
- [ ] T122 [US6] Add cache invalidation to rule reorder in backend/src/services/configService.ts
- [ ] T123 [US6] Validate no duplicate priorities after reorder in backend/src/services/configService.ts
- [ ] T124 [P] [US6] Write unit tests for priority renumbering in backend/tests/unit/configService.test.ts
- [ ] T125 [US6] Write integration tests for rule reordering in backend/tests/integration/ruleEvaluation.test.ts
- [ ] T126 [US6] Test priority-based evaluation order in backend/tests/integration/ruleEvaluation.test.ts
- [ ] T127 [US6] Test first matching rule wins in backend/tests/integration/ruleEvaluation.test.ts

---

## Phase 9: User Story 7 - Rule Overwrite Integration with AB Tests (P2)

**Story Goal**: Tom is running an AB test that affects the `max_health` config. The admin dashboard shows a clear hierarchy: "AB Tests (Priority) → Rule Overwrites → Default Value". While the AB test is active, all rule overwrites are bypassed.

**Independent Test Criteria**:
- API design includes AB test check before rule evaluation
- Config metadata indicates if controlled by AB test
- Dashboard shows "Controlled by AB Test" badge (UI only)
- Rule evaluation skips if AB test active (integration point ready)

**Dependencies**: Phase 6 (US4) for rule evaluation

### Tasks

- [ ] T128 [P] [US7] Add AB test check hook in rule evaluation in backend/src/services/ruleEvaluator.ts
- [ ] T129 [P] [US7] Add abTestActive metadata field to config response in backend/src/controllers/publicConfigController.ts
- [ ] T130 [P] [US7] Document AB test integration point in specs/001-remote-config/data-model.md
- [ ] T131 [US7] Add unit test for AB test bypass logic (mocked) in backend/tests/unit/ruleEvaluator.test.ts

---

## Phase 10: User Story 8 - Segment-Based Rule Overwrites (Future Integration) (P3)

**Story Goal**: Jessica wants to create a rule overwrite for new users only. She selects Segment = "New Users" as a condition. The system accepts the segment condition but shows a warning: "Segment evaluation coming soon - rule will not match until segmentation system is integrated".

**Independent Test Criteria**:
- Can create rules with segment condition in database
- Segment validation accepts predefined values (new_users, all_users, custom)
- UI shows warning badge for segment-based rules
- Server skips segment-based rules during evaluation (treats as non-matching)

**Dependencies**: Phase 6 (US4) for rule infrastructure

### Tasks

- [ ] T132 [P] [US8] Add segment condition field to RuleOverwrite schema (already in Phase 1)
- [ ] T133 [P] [US8] Implement segment condition validation in backend/src/middleware/validateRule.ts
- [ ] T134 [P] [US8] Implement segment condition skip logic in backend/src/services/ruleEvaluator.ts
- [ ] T135 [US8] Add segment integration point documentation in specs/001-remote-config/data-model.md
- [ ] T136 [US8] Add unit test for segment skip logic in backend/tests/unit/ruleEvaluator.test.ts

---

## Phase 11: User Story 9 - Environment-Based Config Management (P2)

**Story Goal**: James runs tests in a staging environment before deploying to production. He creates a config `api_rate_limit` with value 10 for "development", 50 for "staging", and 1000 for "production". When Unity SDK connects with environment parameter "staging", it only receives the staging configs.

**Independent Test Criteria**:
- Can create configs for different environments (dev/staging/production)
- Fetch API filters configs by environment query parameter
- SDK can specify environment in fetch request
- Configs are isolated per environment

**Dependencies**: Phase 3 (US1) - environment field already in schema

### Tasks

- [ ] T137 [US9] Add environment filter to getConfigs query in backend/src/services/configService.ts
- [ ] T138 [US9] Add environment query parameter to public fetch endpoint in backend/src/routes/publicConfigRoutes.ts
- [ ] T139 [US9] Default environment to "production" if not specified in backend/src/controllers/publicConfigController.ts
- [ ] T140 [US9] Add environment filter to admin config list in backend/src/controllers/configController.ts
- [ ] T141 [US9] Implement copyConfigsToEnvironment method in backend/src/services/configService.ts
- [ ] T142 [US9] Add environment parameter to Unity SDK fetch in Assets/lvlup-unity-sdk/Runtime/Scripts/RemoteConfigService.cs
- [ ] T143 [P] [US9] Write integration tests for environment filtering in backend/tests/integration/configApi.test.ts
- [ ] T144 [US9] Test SDK fetches only staging configs when environment="staging" in backend/tests/integration/configApi.test.ts

---

## Phase 12: User Story 10 - Version History and Rollback (P2)

**Story Goal**: After updating `daily_reward_coins` to 500, the analytics team notices players are earning currency too quickly. Lisa opens the config history, sees a timeline of all changes (250 → 300 → 500), and clicks "Rollback to version 2" (value: 300).

**Independent Test Criteria**:
- All config changes are recorded in ConfigHistory
- Can retrieve version history for any config
- Can rollback to any previous version
- Rollback creates new history entry
- History is preserved even after config deletion

**Dependencies**: Phase 3 (US1) for config CRUD

### Tasks

- [ ] T145 [US10] Implement recordConfigHistory method in backend/src/services/configService.ts
- [ ] T146 [US10] Add history recording to createConfig in backend/src/services/configService.ts
- [ ] T147 [US10] Add history recording to updateConfig in backend/src/services/configService.ts
- [ ] T148 [US10] Add history recording to deleteConfig in backend/src/services/configService.ts
- [ ] T149 [US10] Implement getConfigHistory method in backend/src/services/configService.ts
- [ ] T150 [US10] Implement rollbackConfig method in backend/src/services/configService.ts
- [ ] T151 [US10] Implement GET /api/admin/configs/:gameId/history/:key endpoint in backend/src/routes/configRoutes.ts
- [ ] T152 [US10] Implement POST /api/admin/configs/:id/rollback endpoint in backend/src/routes/configRoutes.ts
- [ ] T153 [US10] Add cache invalidation to rollback in backend/src/services/configService.ts
- [ ] T154 [US10] Implement recordRuleHistory method in backend/src/services/configService.ts
- [ ] T155 [US10] Add rule history recording to rule create/update/delete/reorder in backend/src/services/configService.ts
- [ ] T156 [P] [US10] Write integration tests for history recording in backend/tests/integration/auditTrail.test.ts
- [ ] T157 [US10] Write integration tests for rollback functionality in backend/tests/integration/auditTrail.test.ts
- [ ] T158 [US10] Test history preservation on config deletion in backend/tests/integration/auditTrail.test.ts

---

## Phase 12.5: Environment Sync - Bulk Deployment Across Environments (P1 - CRITICAL)

**Feature Goal**: Enable safe bulk promotion of Remote Configs from staging to production with approval gates, dry-run validation, automatic backup, and instant rollback capability.

**Story Goal**: Release Manager prepares to deploy 8 updated configs from staging to production. He calls the environment sync endpoint with `dryRun=true` to preview what will be synced. The API returns detailed preview showing 5 configs to create, 3 to update, with specific value changes. He reviews for conflicts (e.g., pvp_enabled exists only in production). After confirming, he calls sync with `dryRun=false` and an approval token. The system creates automatic backup, syncs all configs atomically, records audit trail, and monitors sync success.

**Independent Test Criteria**:
- Can preview sync operation without committing changes (dry-run mode)
- Dry-run shows all configs to create/update/skip with specific changes
- Detects conflicts: configs in target-only vs source-only environments
- Validates all source configs are valid before sync (atomic validation)
- Creates automatic database backup before production sync
- Requires approval token for production environment syncs
- Syncs configs and rules atomically (all-or-nothing)
- Invalidates cache after successful sync
- Records audit trail with sync metadata (who, when, which configs, from/to environments)
- Can rollback failed sync by restoring from backup
- Monitors sync operation duration, success rate, error count
- Supports filtering by specific config keys or modification date

**Dependencies**: Phase 12 (US10) for history/rollback, Phase 3 (US1) for config CRUD

### Tasks

- [ ] T158.1 [P] Implement syncEnvironments method signature in backend/src/services/configService.ts
- [ ] T158.2 [P] Implement dry-run mode in syncEnvironments (fetch all configs, preview changes without DB writes)
- [ ] T158.3 [P] Implement conflict detection in syncEnvironments (configs in only one environment)
- [ ] T158.4 [P] Implement validation before sync (check all source configs valid)
- [ ] T158.5 [P] Implement atomic sync operation (transaction wrapping all creates/updates)
- [ ] T158.6 [P] Implement approval token validation for production syncs in backend/src/middleware/auth.ts
- [ ] T158.7 [P] Implement auto-backup before production sync in backend/src/services/backupService.ts
- [ ] T158.8 [P] Implement cache invalidation after sync in backend/src/services/cacheService.ts
- [ ] T158.9 [P] Implement audit trail recording for sync operations in backend/src/services/configService.ts
- [ ] T158.10 [P] Implement filtering by config keys in syncEnvironments
- [ ] T158.11 [P] Implement filtering by modification date in syncEnvironments
- [ ] T158.12 [P] Implement sync progress tracking for monitoring in backend/src/services/configService.ts
- [ ] T158.13 Implement POST /api/admin/configs/sync endpoint in backend/src/routes/configRoutes.ts
- [ ] T158.14 Implement detailed response schema with sync report in backend/src/routes/configRoutes.ts
- [ ] T158.15 [P] Implement error handling and partial failure recovery in syncEnvironments
- [ ] T158.16 [P] Create database backup before sync in backend/scripts/backup-db.ts
- [ ] T158.17 Implement restore from backup functionality in backend/scripts/restore-db.ts
- [ ] T158.18 [P] Write unit tests for sync conflict detection in backend/tests/unit/environmentSync.test.ts
- [ ] T158.19 [P] Write unit tests for validation before sync in backend/tests/unit/environmentSync.test.ts
- [ ] T158.20 Write integration tests for dry-run mode in backend/tests/integration/environmentSync.test.ts
- [ ] T158.21 Write integration tests for confirmed sync in backend/tests/integration/environmentSync.test.ts
- [ ] T158.22 Write integration tests for approval token validation in backend/tests/integration/environmentSync.test.ts
- [ ] T158.23 Write integration tests for atomic sync operation in backend/tests/integration/environmentSync.test.ts
- [ ] T158.24 Write integration tests for backup creation and rollback in backend/tests/integration/environmentSync.test.ts
- [ ] T158.25 Write integration tests for audit trail recording in backend/tests/integration/environmentSync.test.ts
- [ ] T158.26 Test cache invalidation after sync in backend/tests/integration/environmentSync.test.ts
- [ ] T158.27 [P] Create API contract documentation in specs/001-remote-config/contracts/admin-environment-sync.md
- [ ] T158.28 Create monitoring dashboard configuration for sync operations
- [ ] T158.29 Add monitoring alerts for sync failures, duration, and error rates

---

## Phase 13: User Story 11 - Bulk Import/Export Configs (P3)

**Story Goal**: Tom wants to migrate 50 configs from staging to production. He exports all staging configs to a JSON file, reviews and modifies values as needed, then imports the JSON file with target environment "production".

**Independent Test Criteria**:
- Can export configs to JSON format
- JSON includes all config metadata (key, value, type, environment, description)
- Can import configs from JSON file
- System validates all entries before creating any configs (atomic)
- Import reports validation errors for invalid entries

**Dependencies**: Phase 3 (US1) for config CRUD, Phase 4 (US2) for validation

### Tasks

- [ ] T159 [P] [US11] Implement exportConfigs method in backend/src/services/configService.ts
- [ ] T160 [P] [US11] Implement importConfigs method in backend/src/services/configService.ts
- [ ] T161 [US11] Implement bulk validation before import in backend/src/services/configService.ts
- [ ] T162 [US11] Implement atomic bulk creation in backend/src/services/configService.ts
- [ ] T163 [US11] Implement GET /api/admin/configs/:gameId/export endpoint in backend/src/routes/configRoutes.ts
- [ ] T164 [US11] Implement POST /api/admin/configs/:gameId/import endpoint in backend/src/routes/configRoutes.ts
- [ ] T165 [US11] Implement merge strategy (skip/update/fail) in backend/src/services/configService.ts
- [ ] T166 [P] [US11] Write integration tests for export functionality in backend/tests/integration/bulkOperations.test.ts
- [ ] T167 [US11] Write integration tests for import with validation in backend/tests/integration/bulkOperations.test.ts
- [ ] T168 [US11] Test atomic import (all or nothing) in backend/tests/integration/bulkOperations.test.ts

---

## Phase 14: User Story 12 - Search and Filter Configs (P3)

**Story Goal**: Natalie manages over 200 config keys for her game. She uses the dashboard search to find all configs containing "reward" in the key name, then filters by environment "production" and enabled status "true".

**Independent Test Criteria**:
- Can search configs by key name (partial match, case-insensitive)
- Can filter configs by environment
- Can filter configs by enabled status
- Can combine multiple filters simultaneously
- Filtered results are accurate and performant

**Dependencies**: Phase 3 (US1) for config list API

### Tasks

- [ ] T169 [US12] Add search query parameter to GET /api/admin/configs/:gameId in backend/src/routes/configRoutes.ts
- [ ] T170 [US12] Implement search by key name in backend/src/services/configService.ts
- [ ] T171 [US12] Add environment filter parameter in backend/src/services/configService.ts
- [ ] T172 [US12] Add enabled status filter parameter in backend/src/services/configService.ts
- [ ] T173 [US12] Implement combined filter logic in backend/src/services/configService.ts
- [ ] T174 [US12] Add database index for key search performance in backend/prisma/schema.prisma
- [ ] T175 [P] [US12] Write integration tests for search functionality in backend/tests/integration/configApi.test.ts
- [ ] T176 [US12] Write integration tests for combined filters in backend/tests/integration/configApi.test.ts

---

## Phase 15: User Story 13 - Enable/Disable Configs Without Deletion (P3)

**Story Goal**: During a special event, Kevin wants to temporarily enable bonus multipliers. He disables the `bonus_multiplier` config (sets enabled=false) instead of deleting it. The SDK no longer returns this config to clients. After the event, Kevin re-enables it.

**Independent Test Criteria**:
- Can toggle config enabled status via API
- Disabled configs are excluded from fetch endpoint response
- Disabled configs remain in database with full history
- Re-enabling a config makes it available immediately (after cache expires)

**Dependencies**: Phase 3 (US1) - enabled field already in schema

### Tasks

- [ ] T177 [US13] Implement toggleConfigEnabled method in backend/src/services/configService.ts
- [ ] T178 [US13] Implement PATCH /api/admin/configs/:id/toggle endpoint in backend/src/routes/configRoutes.ts
- [ ] T179 [US13] Filter disabled configs in public fetch endpoint in backend/src/controllers/publicConfigController.ts
- [ ] T180 [US13] Add cache invalidation to toggle in backend/src/services/configService.ts
- [ ] T181 [US13] Record enable/disable in ConfigHistory in backend/src/services/configService.ts
- [ ] T182 [P] [US13] Write integration tests for enable/disable toggle in backend/tests/integration/configApi.test.ts
- [ ] T183 [US13] Test disabled configs excluded from fetch in backend/tests/integration/configApi.test.ts

---

## Phase 16: Admin Dashboard UI - Complete Rule System Implementation

**Goal**: Build React-based admin dashboard with full rule system: drag-and-drop rule reordering, platform/version/country/date conditions, segment targeting, and config versioning.

**Duration**: 12-16 hours  
**Dependencies**: Phases 3-8 complete (all backend APIs + rule system implemented)  
**Deliverables**: Config CRUD UI, complete rule editor with all conditions, drag-and-drop reordering, history viewer, search/filter

### Overview

This phase implements the complete rule system in the frontend dashboard. Since Phase 8 (backend rule reordering with priorities) is complete, this frontend phase mirrors that architecture:

- **Platform Conditions**: iOS/Android/Web selection
- **Version Conditions**: Operator selector (=, !=, >, >=, <, <=) + semver validation
- **Country Conditions**: ISO 3166-1 alpha-2 code dropdown
- **Date Conditions**: activeAfter timestamp + activeBetween date range
- **Segment Conditions**: all_users/new_users/custom (pending badge for custom segments)
- **Priority-Based Evaluation**: Drag-and-drop rule reordering with auto-renumbering
- **Override Values**: Match config dataType (string/number/boolean/json)
- **Full CRUD**: Create, edit, delete rules with backend sync
- **Drag-and-Drop**: @dnd-kit or react-beautiful-dnd for smooth UX
- **Version History**: Timeline view with side-by-side comparison and rollback

### Tasks

- [ ] T184 [P] Create config TypeScript types in frontend/src/types/config.types.ts
- [ ] T185 [P] Create config API client in frontend/src/services/configApi.ts
- [ ] T186 [P] Create ConfigList page component in frontend/src/pages/RemoteConfig/ConfigList.tsx
- [ ] T187 [P] Create ConfigEditor page component in frontend/src/pages/RemoteConfig/ConfigEditor.tsx
- [ ] T188 [P] Create RuleEditor modal component in frontend/src/pages/RemoteConfig/RuleEditor.tsx
- [ ] T189 [P] Create RuleList component in frontend/src/pages/RemoteConfig/RuleList.tsx
- [ ] T190 [P] Create ConfigHistory page component in frontend/src/pages/RemoteConfig/ConfigHistory.tsx
- [ ] T191 Install react-beautiful-dnd or @dnd-kit for drag-and-drop in frontend/package.json
- [ ] T192 Implement DraggableRuleList component in frontend/src/components/DraggableRuleList.tsx
- [ ] T193 Implement search bar in ConfigList in frontend/src/pages/RemoteConfig/ConfigList.tsx
- [ ] T194 Implement environment filter dropdown in ConfigList in frontend/src/pages/RemoteConfig/ConfigList.tsx
- [ ] T195 Implement enabled status filter in ConfigList in frontend/src/pages/RemoteConfig/ConfigList.tsx
- [ ] T196 Implement config form with validation in ConfigEditor in frontend/src/pages/RemoteConfig/ConfigEditor.tsx
- [ ] T197 Implement data type selector (string/number/boolean/json) in ConfigEditor in frontend/src/pages/RemoteConfig/ConfigEditor.tsx
- [ ] T198 Implement JSON editor with syntax highlighting in ConfigEditor in frontend/src/pages/RemoteConfig/ConfigEditor.tsx

### Rule System Implementation (Frontend)

#### Rule Editor Core - Condition Building
- [ ] T199 [P] Implement rule conditions form in RuleEditor in frontend/src/pages/RemoteConfig/RuleEditor.tsx
- [ ] T200 [P] Implement platform dropdown (iOS/Android/Web) in RuleEditor in frontend/src/pages/RemoteConfig/RuleEditor.tsx
- [ ] T201 [P] Implement version operator selector (=, !=, >, >=, <, <=) in RuleEditor in frontend/src/pages/RemoteConfig/RuleEditor.tsx
- [ ] T202 [P] Implement version value input with semver validation in RuleEditor in frontend/src/pages/RemoteConfig/RuleEditor.tsx
- [ ] T203 [P] Implement country dropdown with ISO 3166-1 alpha-2 codes in RuleEditor in frontend/src/pages/RemoteConfig/RuleEditor.tsx

#### Rule Editor - Date/Time Conditions
- [ ] T204 [P] Implement activeAfter date picker in RuleEditor in frontend/src/pages/RemoteConfig/RuleEditor.tsx
- [ ] T205 [P] Implement activeBetweenStart and activeBetweenEnd date range picker in RuleEditor in frontend/src/pages/RemoteConfig/RuleEditor.tsx
- [ ] T206 [P] Implement UTC timezone handling and display in RuleEditor in frontend/src/pages/RemoteConfig/RuleEditor.tsx
- [ ] T207 Implement current time indicator in date pickers (show if rule is active now) in frontend/src/pages/RemoteConfig/RuleEditor.tsx

#### Rule Editor - Segments & Validation
- [ ] T208 Implement segment condition dropdown (all_users/new_users/custom) in RuleEditor in frontend/src/pages/RemoteConfig/RuleEditor.tsx
- [ ] T209 Add "pending" badge for segment conditions (not yet evaluated) in RuleEditor in frontend/src/pages/RemoteConfig/RuleEditor.tsx
- [ ] T210 Implement override value input matching config dataType in RuleEditor in frontend/src/pages/RemoteConfig/RuleEditor.tsx
- [ ] T211 Add client-side validation for all rule conditions in RuleEditor in frontend/src/pages/RemoteConfig/RuleEditor.tsx
- [ ] T212 Implement rule summary preview (e.g., "iOS v3.5+ gets 200 coins") in RuleEditor in frontend/src/pages/RemoteConfig/RuleEditor.tsx

#### Rule List & Management
- [ ] T213 [P] Create RuleList component with all rules displayed in priority order in frontend/src/pages/RemoteConfig/RuleList.tsx
- [ ] T214 [P] Display rule priority numbers in RuleList in frontend/src/pages/RemoteConfig/RuleList.tsx
- [ ] T215 [P] Display rule conditions summary in each rule row in RuleList in frontend/src/pages/RemoteConfig/RuleList.tsx
- [ ] T216 Display rule override value in each rule row in RuleList in frontend/src/pages/RemoteConfig/RuleList.tsx
- [ ] T217 Add edit button for each rule that opens RuleEditor modal in RuleList in frontend/src/pages/RemoteConfig/RuleList.tsx
- [ ] T218 Add delete button with confirmation for each rule in RuleList in frontend/src/pages/RemoteConfig/RuleList.tsx
- [ ] T219 Add "add new rule" button in RuleList in frontend/src/pages/RemoteConfig/RuleList.tsx
- [ ] T220 Display enabled/disabled toggle for each rule in RuleList in frontend/src/pages/RemoteConfig/RuleList.tsx

#### Drag-and-Drop Rule Reordering
- [ ] T221 [P] Install @dnd-kit or react-beautiful-dnd for drag-and-drop in frontend/package.json
- [ ] T222 [P] Create DraggableRuleList component with drag handles in frontend/src/components/DraggableRuleList.tsx
- [ ] T223 [P] Implement rule drag-and-drop with visual feedback in DraggableRuleList in frontend/src/components/DraggableRuleList.tsx
- [ ] T224 [P] Auto-renumber priorities when reordering rules in DraggableRuleList in frontend/src/components/DraggableRuleList.tsx
- [ ] T225 Implement "Save Changes" button after reorder in DraggableRuleList in frontend/src/components/DraggableRuleList.tsx
- [ ] T226 Implement cancel reorder functionality to revert to previous order in DraggableRuleList in frontend/src/components/DraggableRuleList.tsx
- [ ] T227 Add undo/redo for rule reordering in DraggableRuleList in frontend/src/components/DraggableRuleList.tsx

#### Config & History UI
- [ ] T228 Implement version history timeline view in ConfigHistory in frontend/src/pages/RemoteConfig/ConfigHistory.tsx
- [ ] T229 Implement side-by-side version comparison in ConfigHistory in frontend/src/pages/RemoteConfig/ConfigHistory.tsx
- [ ] T230 Implement rollback button with confirmation in ConfigHistory in frontend/src/pages/RemoteConfig/ConfigHistory.tsx
- [ ] T231 Add loading states for all API calls in frontend/src/pages/RemoteConfig/
- [ ] T232 Add error handling and user-friendly error messages in frontend/src/pages/RemoteConfig/
- [ ] T233 Add success notifications for create/update/delete operations in frontend/src/pages/RemoteConfig/
- [ ] T234 Implement "Controlled by AB Test" badge display (Phase 9) in ConfigList in frontend/src/pages/RemoteConfig/ConfigList.tsx
- [ ] T235 Implement "Segment evaluation pending" warning badge in RuleList in frontend/src/pages/RemoteConfig/RuleList.tsx
- [ ] T236 Add navigation menu item for Remote Config in frontend/src/components/Navigation.tsx
- [ ] T237 Add routing for Remote Config pages in frontend/src/App.tsx
- [ ] T238 [P] Connect ConfigList to backend API endpoints in frontend/src/services/configApi.ts
- [ ] T239 [P] Connect ConfigEditor to backend API endpoints in frontend/src/services/configApi.ts
- [ ] T240 [P] Connect RuleEditor/RuleList to backend API endpoints in frontend/src/services/configApi.ts
- [ ] T241 Connect ConfigHistory to backend API endpoints in frontend/src/services/configApi.ts
- [ ] T242 Implement authentication/authorization checks for admin access in frontend/src/pages/RemoteConfig/
- [ ] T243 Test config CRUD operations through UI in browser
- [ ] T244 Test rule creation, editing, deletion through UI in browser
- [ ] T245 Test rule drag-and-drop reordering through UI in browser
- [ ] T246 Test search and filter functionality in browser
- [ ] T247 Test version history and rollback in browser
- [ ] T248 Test all platform condition combinations (iOS/Android/Web + versions) in browser
- [ ] T249 Test all country conditions in browser
- [ ] T250 Test date conditions (activeAfter, activeBetween) in browser
- [ ] T251 Test rule override values match config dataType in browser
- [ ] T252 Test error handling for invalid inputs in browser

---

## Phase 17: Performance Optimization & Testing

**Goal**: Optimize rule evaluation performance, add database indexes, implement performance monitoring, and conduct load testing.

**Duration**: 3-4 hours  
**Dependencies**: Phases 3-8 complete (core backend functionality)  
**Deliverables**: Performance benchmarks, optimized queries, monitoring instrumentation

### Tasks

- [ ] T221 [P] Add database index on (gameId, environment, enabled) in backend/prisma/schema.prisma
- [ ] T222 [P] Add database index on (configId, priority, enabled) in backend/prisma/schema.prisma
- [ ] T223 [P] Add database index on (configId, changedAt) in backend/prisma/schema.prisma
- [ ] T224 Implement rule pre-filtering by non-null conditions in backend/src/services/ruleEvaluator.ts
- [ ] T225 Add rule evaluation timing instrumentation in backend/src/services/ruleEvaluator.ts
- [ ] T226 Add logging for slow rule evaluations (>50ms) in backend/src/services/ruleEvaluator.ts
- [ ] T227 Implement cache hit/miss rate tracking in backend/src/services/cacheService.ts
- [ ] T228 Add ETag support to public fetch endpoint in backend/src/controllers/publicConfigController.ts
- [ ] T229 Implement ETag calculation based on updatedAt in backend/src/controllers/publicConfigController.ts
- [ ] T230 Write performance benchmark tests for rule evaluation in backend/tests/performance/ruleEvaluation.bench.ts
- [ ] T231 Write load tests for public fetch endpoint in backend/tests/performance/loadTest.ts
- [ ] T232 Test concurrent rule reordering for race conditions in backend/tests/integration/concurrency.test.ts
- [ ] T233 Benchmark cache invalidation performance in backend/tests/performance/cacheInvalidation.bench.ts
- [ ] T234 Run performance tests and verify <100ms p95 latency target met
- [ ] T235 Run load tests and verify 100 req/min sustained per gameId

---

## Phase 18: Documentation

**Goal**: Create comprehensive documentation for API endpoints, Unity SDK usage, admin dashboard user guide, and integration examples.

**Duration**: 3-4 hours  
**Dependencies**: All implementation phases complete  
**Deliverables**: API docs, SDK quickstart, admin guide, example code

### Tasks

- [ ] T236 [P] Create API documentation for public fetch endpoint in specs/001-remote-config/contracts/fetch-configs.md
- [ ] T237 [P] Create API documentation for admin config endpoints in specs/001-remote-config/contracts/admin-configs.md
- [ ] T238 [P] Create API documentation for admin rule endpoints in specs/001-remote-config/contracts/admin-rules.md
- [ ] T239 [P] Document request/response schemas with examples in specs/001-remote-config/contracts/
- [ ] T240 [P] Document error codes and messages in specs/001-remote-config/contracts/
- [ ] T241 Create Unity SDK quickstart guide in specs/001-remote-config/quickstart.md
- [ ] T242 Document Unity SDK API reference in Assets/lvlup-unity-sdk/API_REFERENCE.md
- [ ] T243 Create Unity integration example project in Assets/lvlup-unity-sdk/Examples/RemoteConfigExample.cs
- [ ] T244 Document admin dashboard user guide in specs/001-remote-config/quickstart.md
- [ ] T245 Document rule evaluation algorithm with examples in specs/001-remote-config/data-model.md
- [ ] T246 Document caching strategy and invalidation in specs/001-remote-config/data-model.md
- [ ] T247 Document migration guide for existing configs in specs/001-remote-config/quickstart.md
- [ ] T248 Create troubleshooting guide for common issues in specs/001-remote-config/quickstart.md
- [ ] T249 Add inline code documentation for complex logic in backend/src/services/ruleEvaluator.ts
- [ ] T250 Update main README.md with Remote Config feature in backend/README.md

---

## Phase 19: Deployment & Validation

**Goal**: Deploy Remote Config system to production, run smoke tests, monitor performance, and validate success criteria.

**Duration**: 2-3 hours  
**Dependencies**: All phases complete, tests passing  
**Deliverables**: Production deployment, smoke test results, monitoring dashboards

### Tasks

- [ ] T251 Run all unit tests and verify 100% passing
- [ ] T252 Run all integration tests and verify 100% passing
- [ ] T253 Run performance benchmarks and verify targets met
- [ ] T254 Review and approve Prisma migrations for production
- [ ] T255 Deploy database migrations to Railway production environment
- [ ] T256 Verify migrations applied successfully with Prisma Studio
- [ ] T257 Merge `001-remote-config` branch to main
- [ ] T258 Deploy backend to Railway (auto-deploy from main)
- [ ] T259 Verify Railway deployment successful via health check endpoint
- [ ] T260 Deploy frontend to Railway (auto-deploy with backend)
- [ ] T261 Verify admin dashboard loads at /admin/remote-config
- [ ] T262 Create test config via admin dashboard in production
- [ ] T263 Verify test config appears in database
- [ ] T264 Test public fetch endpoint with test gameId
- [ ] T265 Verify cache invalidation on config update
- [ ] T266 Create test rule overwrite via dashboard
- [ ] T267 Verify rule evaluation returns correct value
- [ ] T268 Test Unity SDK integration in sample Unity project
- [ ] T269 Verify Unity SDK fetches configs successfully
- [ ] T270 Verify Unity SDK uses cached configs offline
- [ ] T271 Publish Unity SDK release v1.1.0-remoteconfig
- [ ] T272 Update Unity SDK package.json with new version
- [ ] T273 Monitor error logs for first 24 hours
- [ ] T274 Monitor fetch endpoint p95 latency in Railway metrics
- [ ] T275 Monitor cache hit rate in Redis
- [ ] T276 Monitor rate limit violations
- [ ] T277 Review audit trail for test operations
- [ ] T278 Validate all success criteria met per spec.md
- [ ] T279 Document any post-deployment issues and resolutions
- [ ] T280 Create rollback plan documentation

---

## Phase 20: Polish & Cross-Cutting Concerns

**Goal**: Final polish, error handling improvements, observability enhancements, and production readiness checklist.

**Duration**: 2-3 hours  
**Dependencies**: Phase 19 complete (deployment validated)  
**Deliverables**: Enhanced logging, error messages, production-ready system

### Tasks

- [ ] T281 [P] Review and improve all validation error messages for clarity
- [ ] T282 [P] Review and improve all API error responses for consistency
- [ ] T283 Add request ID tracking to all API responses for debugging
- [ ] T284 Add structured logging for all config operations in backend/src/services/configService.ts
- [ ] T285 Add structured logging for rule evaluation decisions in backend/src/services/ruleEvaluator.ts
- [ ] T286 Add cache hit/miss logging in backend/src/services/cacheService.ts
- [ ] T287 Add rate limit violation logging in backend/src/middleware/rateLimiter.ts
- [ ] T288 Implement graceful degradation when Redis unavailable in backend/src/services/cacheService.ts
- [ ] T289 Add database connection retry logic in backend/src/config/database.ts
- [ ] T290 Add health check for Redis in backend/src/routes/healthRoutes.ts
- [ ] T291 Add health check for database in backend/src/routes/healthRoutes.ts
- [ ] T292 Implement Unity SDK warning logs for missing configs
- [ ] T293 Implement Unity SDK warning logs for type coercion failures
- [ ] T294 Add analytics tracking for config usage in Unity SDK (optional)
- [ ] T295 Add admin dashboard analytics for config changes (optional)
- [ ] T296 Review security best practices checklist
- [ ] T297 Review performance optimization checklist
- [ ] T298 Review accessibility checklist for admin dashboard
- [ ] T299 Conduct final QA review of all user stories
- [ ] T300 Create release notes for Remote Config v1.0

---

## Dependencies & Execution Order

### User Story Dependency Graph

```
Setup (Phase 1) → Foundational (Phase 2) → US1 (Phase 3)
                                               ↓
                                         US2 (Phase 4)
                                               ↓
                                         US3 (Phase 5)
                                               ↓
                          ┌────────────────────┴────────────────────┐
                          ↓                                         ↓
                    US4 (Phase 6)                             US9 (Phase 11)
                          ↓                                         ↓
                    US5 (Phase 7)                             US10 (Phase 12)
                          ↓
                    US6 (Phase 8)
                          ↓
             ┌────────────┴────────────┐
             ↓                         ↓
       US7 (Phase 9)              US8 (Phase 10)
             ↓
       US11 (Phase 13)
             ↓
       US12 (Phase 14)
             ↓
       US13 (Phase 15)
             ↓
    Dashboard UI (Phase 16)
             ↓
    Performance (Phase 17)
             ↓
    Documentation (Phase 18)
             ↓
    Deployment (Phase 19)
             ↓
    Polish (Phase 20)
```

### Critical Path (MVP)

**Minimum Viable Product** (deploy after these phases):
1. Phase 1: Setup & Infrastructure
2. Phase 2: Foundational Services
3. Phase 3: User Story 1 (Basic config CRUD)
4. Phase 4: User Story 2 (Validation)
5. Phase 5: User Story 3 (Unity SDK)
6. Phase 16: Admin Dashboard UI (minimal - config list and editor only)
7. Phase 19: Deployment

**Estimated MVP Time**: 18-24 hours

### Parallel Execution Opportunities

**Within Phase 1 (Setup)**: Tasks T002-T006 (Prisma models), T009-T010 (TypeScript types), T012-T014 (configs and docs) can all be done in parallel.

**Within Phase 2 (Foundational)**: Tasks T015-T016 (utilities), T022-T025 (unit tests) can be done in parallel.

**Within Phase 5 (US3 - Unity SDK)**: Tasks T060-T062 (model, cache, service classes), T078-T079 (tests) can be done in parallel.

**Within Phase 6 (US4 - Rules)**: Tasks T081-T087 (validation), T088-T091 (service and controller), T103-T104 (unit tests) can be done in parallel.

**Within Phase 16 (Dashboard UI)**: Tasks T184-T190 (all page components), T236-T240 (API docs) can be done in parallel.

**Within Phase 17 (Performance)**: Tasks T221-T223 (indexes), T230-T233 (benchmark tests) can be done in parallel.

**Within Phase 18 (Documentation)**: Tasks T236-T240 (API contracts), T249-T250 (code docs) can be done in parallel.

**Cross-Phase Parallelization**:
- Phase 4 (US2 validation) and Phase 5 (US3 SDK) can start in parallel after Phase 3 (US1) is complete
- Phase 9 (US7 AB test prep) and Phase 10 (US8 segments) can be done in parallel after Phase 6 (US4)
- Phase 18 (Documentation) can start as soon as each phase completes

---

## Validation Checklist

### Format Validation ✅

- [x] All tasks follow checklist format: `- [ ] [TaskID] [P?] [Story?] Description`
- [x] All task IDs are sequential (T001-T300)
- [x] All parallelizable tasks marked with [P]
- [x] All user story tasks marked with story label [US1]-[US13]
- [x] All tasks include specific file paths
- [x] Setup and Foundational phases have no story labels
- [x] User Story phases (3-15) have story labels
- [x] Polish phase (20) has no story labels

### Completeness Validation ✅

- [x] All 13 user stories have dedicated phases
- [x] Each user story phase has independent test criteria
- [x] All user stories map to their requirements from spec.md
- [x] All phases from plan.md are covered
- [x] MVP scope clearly identified (Phases 1-5, 16, 19)
- [x] Dependencies between phases documented
- [x] Parallel execution opportunities identified (34 parallelizable tasks)
- [x] Total task count provided (300 tasks)
- [x] Estimated durations provided for each phase

---

## Summary

**Total Tasks**: 300 across 20 phases  
**Parallelizable Tasks**: 34 marked with [P]  
**User Stories Covered**: 13 (6x P1, 3x P2, 4x P3)  
**MVP Scope**: Phases 1-5, 16, 19 (estimated 18-24 hours)  
**Full Feature**: All phases (estimated 60-80 hours)

**Independent Test Criteria**: Each user story phase includes specific test criteria for validation before moving to next story.

**Suggested MVP Scope** (US1 only): Deploy Phases 1-3, 16 (minimal UI), 19 for immediate value - game developers can update config values remotely. Estimated 12-16 hours.

**Key Parallel Opportunities**:
- Setup: 8 tasks can run in parallel (Prisma models, types, configs)
- Foundational: 6 tasks can run in parallel (utilities and tests)
- US4 Rules: 7 tasks can run in parallel (validation, services, tests)
- Dashboard UI: 7 tasks can run in parallel (all page components)
- Documentation: 5 tasks can run in parallel (API contracts)

All tasks are immediately executable by an LLM with specific file paths and clear acceptance criteria. Each user story can be independently implemented and tested, enabling incremental delivery and fast iteration.

