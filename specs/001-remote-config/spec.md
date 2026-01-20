# Feature Specification: Remote Config System

**Feature Branch**: `001-remote-config`  
**Created**: January 20, 2026  
**Status**: Draft  
**Input**: User description: "Create a comprehensive specification for a Remote Config System feature for the lvlup-backend analytics platform."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Game Developer Updates Config Value (Priority: P1)

Sarah, a game designer, needs to change the daily reward amount from 100 coins to 150 coins for all players. She logs into the admin dashboard, finds the `daily_reward_coins` config key, updates the value from 100 to 150, and saves. Within 5 minutes, all active game sessions fetch the updated value and players see the new reward amount without downloading a new app version.

**Why this priority**: Core functionality that delivers immediate value - the ability to change game parameters without app updates is the primary use case.

**Independent Test**: Can be fully tested by creating a config, updating its value through the dashboard, and verifying the Unity SDK fetches the new value within the cache TTL period.

**Acceptance Scenarios**:

1. **Given** a config key exists with value 100, **When** admin updates value to 150 and saves, **Then** the value is persisted to database and cache is invalidated
2. **Given** a game client has cached config with old value, **When** cache expires (5 minutes), **Then** client fetches and displays new value
3. **Given** an admin updates a config, **When** another user views the config list, **Then** they see the updated timestamp and new value immediately
4. **Given** a config update is in progress, **When** a game client requests configs, **Then** the client receives either old or new value consistently (no partial updates)

---

### User Story 2 - Developer Creates New Config with Validation (Priority: P1)

Marcus, a developer, wants to add a new feature flag `enable_pvp_mode` as a boolean config. He creates a new config entry with key "enable_pvp_mode", selects type "boolean", sets value to false, and selects environment "production". The system validates the key format (alphanumeric + underscores, max 64 chars) and ensures no duplicate exists for this game and environment before saving.

**Why this priority**: Essential for system usability - users need to create new configs with confidence that data is valid.

**Independent Test**: Can be fully tested by attempting to create configs with valid/invalid keys, duplicate keys, and different data types, verifying validation rules are enforced.

**Acceptance Scenarios**:

1. **Given** admin is creating a new config, **When** they enter a valid key and value, **Then** config is created and appears in the config list
2. **Given** admin enters invalid key (e.g., "my-config!" with special chars), **When** they attempt to save, **Then** system shows validation error explaining allowed format
3. **Given** a config with key "max_health" already exists for production, **When** admin tries to create another "max_health" for production, **Then** system prevents duplicate and shows clear error
4. **Given** admin creates a number config with min/max validation rules (e.g., 1-100), **When** they later try to update value to 150, **Then** system rejects the value and shows validation error
5. **Given** admin creates a JSON config, **When** they enter invalid JSON syntax, **Then** system validates JSON structure and shows specific error message

---

### User Story 3 - Unity SDK Fetches and Caches Configs (Priority: P1)

When Elena's mobile game starts, the Unity SDK automatically calls `LvlUpSDK.RemoteConfig.FetchAsync()` to retrieve all enabled configs for the game. The SDK receives a response with all config key-value pairs, stores them locally using PlayerPrefs with a timestamp, and makes them accessible via type-safe getters like `GetInt("max_health", defaultValue: 100)`. If the app is offline, the SDK uses the cached values until they expire.

**Why this priority**: Core SDK functionality required for any config usage in games - without fetch/cache, the system is unusable.

**Independent Test**: Can be tested by integrating SDK into a test Unity project, calling FetchAsync(), and verifying configs are retrieved and accessible via getters both online and offline.

**Acceptance Scenarios**:

1. **Given** Unity game starts with internet connection, **When** SDK calls FetchAsync(), **Then** all enabled configs are retrieved and cached locally within 100ms (p95)
2. **Given** cached configs exist and are less than 5 minutes old, **When** SDK initializes, **Then** SDK uses cached values without making network request
3. **Given** cached configs are older than 5 minutes, **When** SDK initializes with connection, **Then** SDK fetches fresh configs and updates cache
4. **Given** SDK has cached configs and no internet connection, **When** game accesses a config, **Then** SDK returns cached value and logs offline status
5. **Given** SDK fetches configs but network request fails, **When** fallback to cache fails (no cache exists), **Then** SDK returns default values provided by developer
6. **Given** developer requests non-existent config key, **When** calling GetInt("missing_key", 50), **Then** SDK returns default value 50 without error

---

### User Story 4 - Environment-Based Config Management (Priority: P2)

James runs tests in a staging environment before deploying to production. He creates a config `api_rate_limit` with value 10 for "development", 50 for "staging", and 1000 for "production". When Unity SDK connects with environment parameter "staging", it only receives the staging configs. This allows different configurations per environment without affecting production users.

**Why this priority**: Critical for safe testing and deployment workflows, but system can function with single environment initially.

**Independent Test**: Can be tested by creating configs for different environments and verifying SDK fetches only the configs matching the requested environment parameter.

**Acceptance Scenarios**:

1. **Given** configs exist for dev/staging/production environments, **When** SDK requests with environment="staging", **Then** only staging configs are returned
2. **Given** admin views dashboard with environment filter, **When** they select "production", **Then** only production configs are displayed
3. **Given** a config key exists in staging but not production, **When** production SDK requests configs, **Then** the key is not included in response
4. **Given** admin copies configs from staging to production, **When** operation completes, **Then** all staging configs are duplicated with environment="production"

---

### User Story 5 - Version History and Rollback (Priority: P2)

After updating `daily_reward_coins` to 500, the analytics team notices players are earning currency too quickly. Lisa, the product manager, opens the config history for `daily_reward_coins`, sees a timeline of all changes (250 → 300 → 500) with timestamps and who made each change. She clicks "Rollback to version 2" (value: 300) and the system immediately restores that value, creating a new history entry documenting the rollback.

**Why this priority**: Important for mistake recovery and auditing, but not required for basic config functionality.

**Independent Test**: Can be tested by making multiple updates to a config, viewing the history timeline, executing a rollback, and verifying the previous value is restored with a new history entry.

**Acceptance Scenarios**:

1. **Given** a config has been updated multiple times, **When** admin views history, **Then** all versions are displayed chronologically with value, timestamp, and user who made change
2. **Given** admin selects a previous version, **When** they click rollback, **Then** config value reverts to selected version and cache is invalidated
3. **Given** a rollback is executed, **When** admin views history, **Then** a new history entry documents the rollback action with reference to restored version
4. **Given** admin compares two versions side-by-side, **When** viewing comparison, **Then** differences are highlighted clearly
5. **Given** a config is deleted, **When** admin views history, **Then** history is preserved for audit purposes

---

### User Story 6 - Bulk Import/Export Configs (Priority: P3)

Tom wants to migrate 50 configs from staging to production. He exports all staging configs to a JSON file, reviews and modifies values as needed, then imports the JSON file with target environment "production". The system validates all entries, reports any conflicts or validation errors, and creates all valid configs in a single transaction.

**Why this priority**: Efficiency feature for managing many configs, but manual creation is viable for smaller config sets.

**Independent Test**: Can be tested by exporting configs to JSON, modifying the file, importing it, and verifying all valid configs are created with proper validation errors for invalid entries.

**Acceptance Scenarios**:

1. **Given** admin selects multiple configs, **When** they click export, **Then** a JSON file downloads containing all selected configs with their metadata
2. **Given** admin uploads a valid JSON file, **When** import processes, **Then** all configs are created/updated and success summary is displayed
3. **Given** JSON file contains validation errors (e.g., duplicate keys), **When** import runs, **Then** system reports specific errors without creating any configs (atomic operation)
4. **Given** JSON file contains 100 entries with 5 errors, **When** admin chooses "import valid only", **Then** 95 valid configs are created and 5 errors are reported
5. **Given** imported configs conflict with existing configs, **When** admin chooses merge strategy "update existing", **Then** existing configs are updated with imported values

---

### User Story 7 - Search and Filter Configs (Priority: P3)

Natalie manages over 200 config keys for her game. She uses the dashboard search to find all configs containing "reward" in the key name, then filters by environment "production" and enabled status "true". The filtered list shows only the 8 configs that match all criteria, making it easy to review and update related configurations.

**Why this priority**: Usability improvement for large config sets, but basic list view is sufficient for initial release.

**Independent Test**: Can be tested by creating many configs and verifying search/filter functionality returns accurate results.

**Acceptance Scenarios**:

1. **Given** 200+ configs exist, **When** admin types "reward" in search box, **Then** only configs with "reward" in key or description are displayed
2. **Given** admin applies multiple filters (environment + enabled status), **When** viewing list, **Then** only configs matching all filter criteria are shown
3. **Given** filtered results are displayed, **When** admin clears filters, **Then** full config list is restored
4. **Given** admin searches with no results, **When** viewing empty list, **Then** helpful message suggests checking filters or creating new config

---

### User Story 8 - Enable/Disable Configs Without Deletion (Priority: P3)

During a special event, Kevin wants to temporarily enable bonus multipliers. He disables the `bonus_multiplier` config (sets enabled=false) instead of deleting it. The SDK no longer returns this config to clients. After the event, Kevin re-enables it and the config becomes available again, preserving all history and metadata.

**Why this priority**: Convenient feature for temporary changes, but deletion/recreation is acceptable workaround initially.

**Independent Test**: Can be tested by toggling a config's enabled status and verifying SDK response includes/excludes it accordingly while preserving all data.

**Acceptance Scenarios**:

1. **Given** a config is enabled, **When** admin toggles to disabled, **Then** config remains in database but SDK responses exclude it
2. **Given** a disabled config, **When** admin re-enables it, **Then** SDK immediately returns it in next fetch (after cache expires)
3. **Given** admin views config list, **When** filtering by enabled status, **Then** can view only enabled, only disabled, or all configs
4. **Given** a config is disabled, **When** viewing history, **Then** history shows the enable/disable state changes

---

### Edge Cases

- **What happens when cache service (Redis) is unavailable?** System falls back to querying database directly, ensuring zero downtime. Performance may degrade but functionality remains intact.

- **How does system handle concurrent updates to the same config?** Last-write-wins strategy with optimistic locking. Version timestamps ensure updates are based on latest state, and conflicts are logged for audit.

- **What if client requests configs for non-existent gameId?** API returns empty array (not error), as this could indicate a new game with no configs yet. Audit log records the attempt for security monitoring.

- **How are type mismatches handled when SDK requests wrong type?** SDK getters attempt type coercion (e.g., string "123" → int 123) with fallback to default value if coercion fails. Warning is logged locally for developer debugging.

- **What happens if developer deletes a config that games are actively using?** Games with cached values continue working until cache expires, then fall back to default values provided in SDK code. No crash or error occurs.

- **How does system handle very large JSON config values (>1MB)?** Validation enforces maximum value size of 100KB per config. For larger data needs, recommend storing reference URLs or splitting into multiple configs.

- **What if SDK version is incompatible with new config schema?** API accepts optional `sdk_version` parameter and can filter configs based on compatibility rules defined in config metadata (future enhancement).

- **How are rate limits enforced to prevent abuse?** API implements per-gameId rate limiting (100 requests/minute) using Redis. Excessive requests return 429 status with retry-after header.

- **What happens during cache invalidation delays?** Some clients may see stale data for up to 5 minutes (cache TTL). This is acceptable for config changes which are not expected to be real-time. Dashboard shows warning: "Changes may take up to 5 minutes to propagate."

- **How are partial network failures handled during SDK fetch?** SDK implements retry logic with exponential backoff (3 attempts). If all fail, falls back to cache or defaults. Never blocks game startup.

## Requirements *(mandatory)*

### Functional Requirements

#### Config Management

- **FR-001**: System MUST allow authenticated admins to create config entries with key, value, data type, environment, and optional description
- **FR-002**: System MUST support multiple data types: string, number, boolean, JSON object, and array
- **FR-003**: System MUST validate config keys to be alphanumeric with underscores, maximum 64 characters, case-insensitive
- **FR-004**: System MUST enforce unique constraint on [gameId, key, environment] combination
- **FR-005**: System MUST allow admins to update config values while preserving key and environment
- **FR-006**: System MUST allow admins to delete configs with confirmation prompt
- **FR-007**: System MUST allow admins to enable/disable configs without deletion
- **FR-008**: System MUST validate JSON structure for JSON-type config values before saving
- **FR-009**: System MUST support validation rules for number types (min/max range)
- **FR-010**: System MUST support validation rules for string types (regex patterns, max length)

#### Environment Management

- **FR-011**: System MUST support three environment types: development, staging, production
- **FR-012**: System MUST allow admins to filter configs by environment in dashboard
- **FR-013**: System MUST allow admins to copy configs from one environment to another
- **FR-014**: System MUST isolate configs by gameId, ensuring no cross-game data access

#### Version History & Audit

- **FR-015**: System MUST record all config changes in ConfigHistory table with previous value, new value, timestamp, and user identifier
- **FR-016**: System MUST allow admins to view complete change history for any config key
- **FR-017**: System MUST allow admins to rollback to any previous version with one click
- **FR-018**: System MUST create new history entry when rollback is executed
- **FR-019**: System MUST preserve history even after config deletion for audit compliance
- **FR-020**: System MUST display side-by-side comparison of any two config versions

#### API Endpoints

- **FR-021**: System MUST provide GET /api/configs/{gameId} endpoint returning all enabled configs for specified game and environment
- **FR-022**: System MUST accept optional query parameters: environment (default: production), sdk_version
- **FR-023**: System MUST return configs as JSON object with key-value pairs and metadata (updatedAt timestamp)
- **FR-024**: System MUST implement ETag support for efficient client-side caching
- **FR-025**: System MUST provide POST /api/admin/configs endpoint for creating configs (auth required)
- **FR-026**: System MUST provide PUT /api/admin/configs/{id} endpoint for updating configs (auth required)
- **FR-027**: System MUST provide DELETE /api/admin/configs/{id} endpoint for deleting configs (auth required)
- **FR-028**: System MUST provide GET /api/admin/configs/{gameId}/history/{key} endpoint for retrieving version history (auth required)
- **FR-029**: System MUST validate gameId access permissions on all admin endpoints using existing JWT + gameAccess middleware
- **FR-030**: System MUST return 404 for non-existent gameId or config, 403 for unauthorized access

#### Bulk Operations

- **FR-031**: System MUST allow admins to export selected configs to JSON file format
- **FR-032**: System MUST allow admins to import configs from JSON file with validation
- **FR-033**: System MUST validate all entries in bulk import before creating any configs (atomic operation)
- **FR-034**: System MUST provide detailed error report for invalid entries during import
- **FR-035**: System MUST support merge strategies during import: skip existing, update existing, or fail on conflict

#### Search & Filtering

- **FR-036**: System MUST allow admins to search configs by key name (partial match, case-insensitive)
- **FR-037**: System MUST allow admins to filter configs by environment
- **FR-038**: System MUST allow admins to filter configs by enabled status
- **FR-039**: System MUST allow admins to combine multiple filters simultaneously
- **FR-040**: System MUST display result count when filters are active

#### Unity SDK Integration

- **FR-041**: Unity SDK MUST provide RemoteConfigManager accessible via LvlUpSDK.RemoteConfig
- **FR-042**: Unity SDK MUST provide async FetchAsync() method to retrieve all configs for current game
- **FR-043**: Unity SDK MUST cache fetched configs locally using PlayerPrefs with timestamp
- **FR-044**: Unity SDK MUST provide type-safe getter methods: GetString(), GetInt(), GetFloat(), GetBool(), GetJson<T>()
- **FR-045**: Unity SDK MUST require default values for all getter methods to handle missing keys gracefully
- **FR-046**: Unity SDK MUST use cached configs if network request fails
- **FR-047**: Unity SDK MUST respect cache expiration (5 minutes) and automatically refetch when expired
- **FR-048**: Unity SDK MUST provide OnConfigsUpdated event callback for listening to config updates
- **FR-049**: Unity SDK MUST log warnings (not errors) when config keys are missing or type coercion fails
- **FR-050**: Unity SDK MUST never block game initialization if config fetch fails

#### Caching Strategy

- **FR-051**: System MUST cache config responses for 5 minutes to align with platform performance targets
- **FR-052**: System MUST invalidate cache immediately when any config is created, updated, or deleted
- **FR-053**: System MUST use Redis for distributed caching with fallback to database if Redis unavailable
- **FR-054**: System MUST generate cache keys in format: `remoteconfig:{gameId}:{environment}`
- **FR-055**: System MUST implement ETag calculation based on last updatedAt timestamp for conditional requests

#### Security & Rate Limiting

- **FR-056**: System MUST enforce JWT authentication on all /api/admin/* endpoints
- **FR-057**: System MUST validate gameId access using existing gameAccess middleware patterns
- **FR-058**: System MUST implement rate limiting of 100 requests per minute per gameId on public config endpoints
- **FR-059**: System MUST implement rate limiting of 1000 requests per minute per admin user on admin endpoints
- **FR-060**: System MUST log all admin operations (create/update/delete) to audit log with user identifier and timestamp
- **FR-061**: System MUST return 429 Too Many Requests with Retry-After header when rate limit exceeded
- **FR-062**: Public config fetch endpoint MUST NOT require authentication but MUST validate gameId exists

#### Data Validation & Error Handling

- **FR-063**: System MUST validate maximum config value size of 100KB per entry
- **FR-064**: System MUST validate JSON syntax for JSON-type configs before saving
- **FR-065**: System MUST validate number values against defined min/max rules if specified
- **FR-066**: System MUST validate string values against regex patterns if specified
- **FR-067**: System MUST return descriptive validation errors with field-specific messages
- **FR-068**: System MUST handle database connection failures gracefully with retry logic
- **FR-069**: System MUST handle cache service failures gracefully by falling back to database queries
- **FR-070**: Unity SDK MUST attempt type coercion (e.g., string "true" → boolean true) before falling back to defaults

### Key Entities *(include if feature involves data)*

- **RemoteConfig**: Represents a single configuration entry with key-value pair for specific game and environment. Attributes include id, gameId, key (unique per game/environment), value (JSON type supporting multiple data types), environment (dev/staging/production), enabled (boolean flag), description (optional), createdAt, updatedAt. Related to Game entity via gameId foreign key.

- **ConfigHistory**: Audit trail of all config changes. Attributes include id, configId (foreign key to RemoteConfig), previousValue (JSON), newValue (JSON), changedBy (user identifier), changedAt (timestamp), changeType (created/updated/deleted/rollback). Preserves full change history even after config deletion.

- **ValidationRule**: Optional rules attached to configs for value validation. Attributes include id, configId (foreign key), ruleType (min/max/regex/maxLength), ruleValue (the constraint value). Allows number ranges, string patterns, etc.

- **CacheEntry**: Ephemeral cache storage for config responses. Key format: `remoteconfig:{gameId}:{environment}`, value contains serialized config array, TTL set to 5 minutes. Stored in Redis with automatic expiration.

- **RateLimit**: Tracks API request counts per identifier. Key format: `ratelimit:{identifier}:{window}`, value is request count, TTL matches rate limit window (1 minute). Stored in Redis.

### Performance Requirements *(include if feature affects analytics queries)*

- **Response Time Targets:**
  - Config fetch endpoint (GET /api/configs/{gameId}): p95 < 100ms, p99 < 200ms
  - Admin CRUD endpoints: p95 < 200ms
  - Config history retrieval: p95 < 300ms (may involve multiple records)
  - Bulk import operations: p95 < 2s for 100 configs
  - Unity SDK FetchAsync(): p95 < 100ms (matches API target)
  
- **Caching Strategy:** 
  - Cache key format: `remoteconfig:{gameId}:{environment}`
  - TTL: 5 minutes (300 seconds)
  - Invalidation: Immediate on any create/update/delete operation for affected gameId+environment
  - ETag calculation: Hash of last updatedAt timestamp across all configs for gameId+environment
  - Cache warm-up: Not required; lazy loading on first request
  
- **Query Optimization:** 
  - Index on [gameId, environment, enabled] for fast config fetches
  - Index on [gameId, key, environment] for unique constraint enforcement
  - Index on configId in ConfigHistory for efficient history lookups
  - Limit history queries to last 100 versions per config by default
  
- **Scalability:**
  - Support up to 1000 config keys per game without performance degradation
  - Support up to 10,000 config fetch requests per minute across all games
  - Support up to 100 concurrent admin users managing configs
  
- **Resource Constraints:**
  - Maximum config value size: 100KB
  - Maximum configs per bulk import: 1000 entries
  - Maximum history versions stored per config: 1000 (archive older versions)

### Data Integrity Requirements *(include if feature involves timestamps or sessions)*

- **Timestamp Validation:** 
  - All config operations use server-generated timestamps (createdAt, updatedAt)
  - History entries use server timestamp for changedAt to ensure accurate audit trail
  - Client-provided timestamps are not accepted to prevent time manipulation
  
- **Data Consistency:** 
  - Config updates use optimistic locking based on updatedAt field to detect concurrent modifications
  - Cache invalidation and database update occur within same transaction boundary
  - Bulk import operations are atomic - all configs created or none (with option for partial import)
  - History entries are created in same transaction as config updates to ensure audit integrity
  
- **Multi-Tenant Isolation:** 
  - All queries MUST filter by gameId to prevent cross-game data access
  - GameId validation enforced at middleware level before controller logic
  - Admin endpoints verify user has access to specified gameId using existing gameAccess patterns
  - Public config endpoint returns empty array (not error) for invalid gameId to prevent enumeration
  
- **Data Validation:**
  - Config values are validated before persistence to prevent corrupt data
  - JSON values are parsed and re-serialized to ensure valid JSON structure
  - Number values are validated against defined min/max rules
  - String values are validated against regex patterns and length limits
  - Validation errors are descriptive and include specific field information
  
- **Referential Integrity:**
  - Config deletion cascades to ValidationRule records
  - Config deletion preserves ConfigHistory records for audit compliance
  - Game deletion cascades to all RemoteConfig records (enforced by existing Game model onDelete: Cascade)
  
- **Concurrency Control:**
  - Config updates include version check to prevent lost updates
  - Cache invalidation uses Redis transactions to ensure consistency
  - Multiple admins can edit different configs simultaneously without conflict
  - Editing same config simultaneously results in last-write-wins with audit trail of both changes


## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Game developers can create a new config and see it available to game clients within 5 minutes without any code deployment
- **SC-002**: Config fetch API responds in under 100ms for 95% of requests, enabling instant game startup
- **SC-003**: System supports 1000 config keys per game without performance degradation
- **SC-004**: Unity SDK integration requires fewer than 10 lines of code to initialize and fetch configs
- **SC-005**: Non-technical users (game designers, product managers) can successfully update config values without developer assistance
- **SC-006**: Config updates are reflected in active game sessions within 5 minutes without requiring app restart
- **SC-007**: Complete audit trail exists for all config changes, showing what changed, who changed it, and when
- **SC-008**: System handles 10,000 config fetch requests per minute across all games without errors
- **SC-009**: Admins can rollback incorrect config changes within 30 seconds of identifying the issue
- **SC-010**: Zero game crashes or errors occur when config service is temporarily unavailable (graceful degradation)
- **SC-011**: Bulk import of 100 configs completes in under 2 seconds
- **SC-012**: Config validation prevents 100% of invalid data from being saved (no corrupt configs in production)
- **SC-013**: System maintains 99.9% uptime for config fetch operations
- **SC-014**: Admin dashboard loads and displays 200+ configs with search/filter in under 500ms
- **SC-015**: SDK successfully uses cached configs when offline, enabling gameplay without connectivity
- **SC-016**: Multi-environment workflows (dev/staging/production) eliminate accidental production config changes by 100%
- **SC-017**: Rate limiting protects system from abuse while allowing legitimate traffic (fewer than 0.1% false positives)
- **SC-018**: Game developers report 80% reduction in time spent managing configuration changes compared to manual app updates

### Assumptions

- Redis or equivalent in-memory cache is available for production deployment
- Existing JWT authentication and gameAccess middleware patterns are functional and will be reused
- RemoteConfig Prisma model already exists and schema matches specification requirements
- Unity SDK has established patterns for API communication and local storage (PlayerPrefs)
- Game clients have reliable internet connectivity during game initialization (can handle offline after initial fetch)
- Config changes are not time-critical (5-minute propagation delay is acceptable)
- Maximum 1000 config keys per game is sufficient for foreseeable use cases
- Admin users are authenticated and authorized through existing auth system
- Games use unique gameId identifiers that are validated before config operations
- JSON serialization is compatible between backend (Node.js/TypeScript) and Unity (C#)
- Config values under 100KB are sufficient for all use cases (larger data should be hosted externally)
- Three environments (dev/staging/production) cover all deployment scenarios
- Last-write-wins is acceptable conflict resolution strategy for concurrent edits
- Audit history retention of 1000 versions per config is sufficient for compliance
- Game developers provide sensible default values in SDK code for all configs used
- Admin dashboard users have modern web browsers supporting ES6+ JavaScript
- Database can handle additional tables (ConfigHistory, ValidationRule) without capacity issues
- Existing backend infrastructure supports adding new API endpoints without architectural changes
- Unity SDK users are comfortable with async/await patterns in C#
- Config key naming conventions (alphanumeric + underscores) are sufficient for all use cases
