<!--
SYNC IMPACT REPORT - Constitution v1.0.0
========================================
VERSION CHANGE: INITIAL → 1.0.0
RATIONALE: Initial constitution establishing foundational governance for lvlup-backend analytics platform

PRINCIPLES ADDED:
- I. Type Safety & Code Quality (TypeScript best practices)
- II. Data Integrity & Temporal Accuracy (timestamp validation, session tracking)
- III. Testing & Analytics Accuracy (unit + integration tests for analytics)
- IV. Performance & Caching Strategy (5-min TTL, query optimization)
- V. API Design & Backward Compatibility (versioning, RESTful standards)
- VI. Multi-Tenant Isolation & Security (gameId isolation, input validation)
- VII. Observability & Error Handling (structured logging, error tracking)
- VIII. Documentation Standards (complex analytics logic must be documented)

TEMPLATES REQUIRING UPDATES:
✅ plan-template.md - Updated with analytics-specific constitution checks
✅ spec-template.md - Updated with data integrity and performance requirements
✅ tasks-template.md - Added analytics-specific task categories
✅ checklist-template.md - No changes needed (generic structure applies)

FOLLOW-UP TODOS:
- None (all placeholders filled)

RATIFICATION DATE: 2026-01-20 (date of initial constitution creation)
-->

# LvlUp Analytics Platform Constitution

## Core Principles

### I. Type Safety & Code Quality

**Strict TypeScript enforcement MUST be maintained across all code:**

- All functions MUST have explicit return types declared
- `any` type is FORBIDDEN except in approved legacy code or external library integrations requiring explicit justification
- Prisma-generated types MUST be used for all database operations (no raw queries without type wrappers)
- Complex analytics calculations MUST have dedicated type definitions (e.g., `RetentionMetrics`, `SessionAnalytics`)
- ESLint rules MUST be enforced in CI/CD pipeline; builds MUST fail on violations
- Code reviews MUST reject PRs with insufficient type coverage

**Rationale:** Analytics platforms process critical business data. Type safety prevents calculation errors, ensures data integrity, and makes refactoring safe. The cost of a miscalculated metric (e.g., wrong DAU/MAU) is business credibility loss.

### II. Data Integrity & Temporal Accuracy

**Timestamp validation and session tracking accuracy are NON-NEGOTIABLE:**

- Client timestamps MUST be validated against server time:
  - REJECT timestamps in the future (client clock ahead)
  - ACCEPT timestamps up to 7 days in the past (offline event queuing)
  - REJECT timestamps older than 7 days
  - LOG all rejections with drift details
- Session duration calculations MUST use `max(endTime, lastHeartbeat)` to prevent data loss from race conditions
- Session end times MUST be idempotent (duplicate calls use latest timestamp)
- Database transactions MUST be used for multi-record operations affecting analytics accuracy
- All timestamp fields MUST store millisecond precision (BigInt for client timestamps, DateTime for server)

**Rationale:** Temporal accuracy is fundamental to analytics. DAU/MAU, retention cohorts, and funnel timing depend on accurate timestamps. Offline support requires accepting past events while preventing clock manipulation. Session tracking must handle network unreliability gracefully.

### III. Testing & Analytics Accuracy

**Testing strategy MUST ensure calculation correctness:**

- **Unit Tests (MANDATORY):**
  - All analytics calculation functions (retention, DAU, session aggregations)
  - Edge cases: timezone boundaries, month transitions, leap years
  - Timestamp validation logic
  - Session duration calculations
  - Coverage threshold: 80% for services, 90% for calculation utilities

- **Integration Tests (MANDATORY):**
  - End-to-end event flow: batch events → database → analytics queries
  - Session lifecycle: start → heartbeat → end → duration accuracy
  - Multi-tenant isolation (gameId filtering)
  - Cache invalidation on data updates
  - Offline event acceptance (7-day window)

- **Test Data Requirements:**
  - Realistic datasets with timezone variety
  - Edge cases: single-session users, multi-session days, session spanning midnight
  - Known-answer tests: seed data with precalculated expected metrics

**Rationale:** Analytics bugs are silent killers—wrong numbers look plausible. Comprehensive testing with edge cases and known-answer validation is the only defense. Integration tests catch query optimization errors that unit tests miss.

### IV. Performance & Caching Strategy

**Response time targets and caching discipline MUST be enforced:**

- **Performance Targets:**
  - Analytics dashboard queries: p95 < 500ms, p99 < 1s
  - Event ingestion (single): p95 < 100ms
  - Batch event ingestion (100 events): p95 < 500ms
  - Session operations: p95 < 200ms

- **Caching Requirements:**
  - All dashboard analytics MUST use 5-minute TTL cache (configurable via env var)
  - Cache keys MUST include gameId + all filter parameters (date range, platform, version, country)
  - Cache MUST be invalidated on data modifications affecting cached queries
  - Cache hit/miss rates MUST be logged and monitored

- **Query Optimization Mandatory For:**
  - Aggregations over >10k records MUST use database indexes
  - Date range filters MUST use indexed timestamp columns
  - Multi-tenant queries MUST filter by `gameId` in WHERE clause (never JOIN)
  - Slow query log threshold: 200ms (log for optimization review)

**Rationale:** Real-time dashboards on large datasets require aggressive caching and index strategies. The 5-minute TTL balances freshness with database load. Performance regressions directly impact user experience and infrastructure costs.

### V. API Design & Backward Compatibility

**RESTful principles and versioning discipline MUST be maintained:**

- **API Structure:**
  - Resources: `/api/analytics/events`, `/api/analytics/sessions`, `/api/analytics/enhanced/metrics/*`
  - Batch operations: `POST /api/analytics/events/batch` (preferred for SDK usage)
  - Use HTTP methods semantically: POST (create), GET (read), PUT (update/complete), DELETE (archive)

- **Versioning Policy:**
  - API version in URL path: `/api/v1/`, `/api/v2/` (current version is implicit `/api/`)
  - Breaking changes REQUIRE new version endpoint
  - Breaking change definition: removing fields, changing field types, altering response structures
  - Non-breaking additions: new optional fields, new endpoints
  - Deprecation policy: 6-month notice, 1-year support for previous version

- **Request/Response Standards:**
  - Always return JSON with proper `Content-Type: application/json`
  - Error responses MUST use consistent structure: `{ error: string, code: string, details?: object }`
  - Timestamps MUST be ISO 8601 format in responses
  - Pagination required for unbounded collections: `limit`, `offset`, `total` fields

**Rationale:** Game SDKs are embedded in shipped apps and cannot be instantly updated. Breaking API changes brick deployed games. Backward compatibility is a contractual obligation to developers.

### VI. Multi-Tenant Isolation & Security

**GameId-based isolation and input validation MUST be comprehensive:**

- **Multi-Tenant Isolation:**
  - ALL database queries MUST filter by `gameId` (enforced in Prisma queries)
  - API authentication via `X-API-Key` header → validates against `Game.apiKey`
  - Rate limiting per gameId: 1000 req/min for events, 100 req/min for analytics queries
  - No cross-game data access—middleware MUST enforce gameId scope

- **Input Validation:**
  - Event names: alphanumeric + underscore only, max 64 chars
  - User externalId: max 128 chars, sanitized for SQL injection
  - JSON properties: max depth 5, max size 10KB per event
  - Batch operations: max 1000 events per request
  - Query parameters: whitelist allowed values for platform, version filters

- **Security Standards:**
  - API keys MUST be stored hashed (bcrypt) in database
  - Sensitive fields (device IDs) MUST NOT appear in logs
  - SQL injection prevention: use Prisma ORM exclusively, no raw SQL without parameterization
  - CORS policy: whitelist allowed origins (no wildcards in production)

**Rationale:** Multi-tenant platforms must guarantee data isolation—leaking competitor analytics is catastrophic. Input validation prevents injection attacks and ensures database integrity. Rate limiting protects against abuse and ensures fair resource allocation.

### VII. Observability & Error Handling

**Structured logging and error tracking MUST enable production debugging:**

- **Logging Requirements:**
  - Use Winston logger with structured JSON output
  - Log levels: ERROR (failures), WARN (timestamp rejections, validation failures), INFO (key operations), DEBUG (query details)
  - Include context: gameId, userId, sessionId, requestId in all log entries
  - Performance metrics: log slow queries (>200ms), cache hit rates, event batch sizes

- **Error Handling Standards:**
  - Catch errors at service layer, return typed error responses
  - Database errors MUST be wrapped (don't expose Prisma stack traces to clients)
  - Validation errors MUST include actionable messages (e.g., "timestamp rejected: 12h in future")
  - Unhandled errors MUST trigger alerts (not silent failures)

- **Monitoring Requirements:**
  - Track key metrics: event ingestion rate, session creation rate, API response times
  - Alert on: error rate >1%, p99 latency >2s, cache miss rate >50%
  - Dashboard for: active sessions, events/minute, database connection pool usage

**Rationale:** Production analytics issues are discovered by users seeing wrong numbers. Detailed logging enables rapid root cause analysis. Proactive monitoring catches performance degradation before it impacts users.

### VIII. Documentation Standards

**Complex analytics logic MUST be documented inline:**

- **Mandatory Inline Documentation:**
  - Timestamp validation logic (explain 7-day window rationale)
  - Session duration calculations (explain heartbeat handling)
  - Retention cohort definitions (explain D1/D7/D30 meaning)
  - Caching strategy decisions (explain TTL choices)
  - Query optimization techniques (explain index usage)

- **API Documentation:**
  - OpenAPI/Swagger spec for all endpoints (auto-generated preferred)
  - Example requests/responses in API-EXAMPLES.md
  - SDK integration guides (Unity SDK quickstart)

- **Architecture Documentation:**
  - Data model diagrams (entities and relationships)
  - Analytics calculation workflows (event → session → metrics)
  - Deployment architecture (Railway/Netlify setup)

**Rationale:** Analytics platforms have hidden complexity in calculations. Future developers (or your future self) need to understand why timestamp validation works the way it does. Inline comments prevent incorrect "simplifications" during refactoring.

## Technology Stack & Constraints

**Approved Technologies:**

- **Backend:** Node.js v16+, TypeScript 5.x, Express 5.x
- **Database:** PostgreSQL (production), SQLite (local dev)
- **ORM:** Prisma 6.x (REQUIRED for type safety)
- **Testing:** Jest with ts-jest
- **Logging:** Winston
- **SDK:** Unity C# (lvlup-unity-sdk)

**File Naming Conventions (STANDARDIZED):**

All TypeScript files MUST follow these naming conventions strictly:

| Directory | File Type | Naming Convention | Examples |
|-----------|-----------|-------------------|----------|
| `src/controllers/` | Controllers | **PascalCase** + `Controller` suffix | `AnalyticsController.ts`, `ConfigController.ts` |
| `src/services/` | Services | **PascalCase** + `Service` suffix | `AnalyticsService.ts`, `ConfigService.ts` |
| `src/services/` | Utilities | **camelCase** (no suffix) | `ruleEvaluator.ts`, `versionComparator.ts` |
| `src/middleware/` | Middleware | **camelCase** | `auth.ts`, `validateConfig.ts` |
| `src/utils/` | Utilities | **camelCase** | `logger.ts`, `geoip.ts`, `semver.ts` |
| `src/types/` | Types | **camelCase** + `.types.ts` | `config.types.ts`, `api.types.ts` |
| `src/config/` | Config | **camelCase** | `redis.ts`, `database.ts` |
| `src/routes/` | Routes | **camelCase** | `configRoutes.ts`, `authRoutes.ts` |
| `src/models/` | Models | **PascalCase** | `User.ts`, `Config.ts` |

**Rationale:** 
- **PascalCase for classes** (Controllers, Services, Models): Follows TypeScript conventions where class names are PascalCase. Developers immediately recognize these as exportable classes.
- **camelCase for utilities/functions**: Utility functions are exported as named functions/constants, which by convention use camelCase.
- **Consistent suffixes** (`Controller`, `Service`): Eliminates ambiguity about file purpose. A file named `AnalyticsController.ts` is immediately recognizable as an Express route handler class.
- **Uniform application** across all directories: Developers know exactly what to expect from each directory without needing to check folder-specific rules.

**Enforcement:**
- ESLint rule: `@typescript-eslint/naming-convention` configured to enforce per-directory rules
- Pre-commit hook: Reject commits with misnamed files
- Code review checklist: Verify all new files follow conventions

**Deployment Standards:**

- Production: Railway (PostgreSQL database)
- Frontend: Netlify (React + Vite)
- Environment switching: `./env local|prod` script
- Database migrations: Prisma migrate (must be idempotent)

**Prohibited Practices:**

- Raw SQL queries without Prisma (exception: complex analytics requiring custom SQL—must be reviewed and parameterized)
- Synchronous blocking operations in request handlers
- Storing sensitive data unencrypted
- Hard-coded configuration (use environment variables)

## Development Workflow

**Feature Development Process:**

1. Spec creation: `/speckit.spec` command → `specs/{feature}/spec.md`
2. Implementation planning: `/speckit.plan` command → `specs/{feature}/plan.md`
3. Constitution compliance check: Verify all principles apply
4. Task breakdown: `/speckit.tasks` command → `specs/{feature}/tasks.md`
5. Test-first: Write failing tests before implementation
6. Implementation: Code + inline documentation
7. Validation: Jest tests pass, ESLint clean, manual testing
8. Code review: 1 approval required, constitution checklist completed
9. Deployment: Merge to main → Railway auto-deploy

**Code Review Checklist:**

- [ ] Type safety: No `any`, all functions have return types
- [ ] Tests: Unit + integration tests included, edge cases covered
- [ ] Performance: No N+1 queries, appropriate indexes, caching used
- [ ] Security: Input validation, gameId filtering, no sensitive data in logs
- [ ] Documentation: Complex logic has inline comments
- [ ] Backward compatibility: No breaking API changes without versioning

## Governance

**Constitution Authority:**

This constitution supersedes all other development practices and conventions. When conflicts arise between this document and other guidance, the constitution takes precedence.

**Amendment Process:**

- Amendments REQUIRE: rationale, impacted principles list, template alignment plan
- Version bumping:
  - **MAJOR:** Backward incompatible changes (e.g., removing a principle)
  - **MINOR:** New principles or major expansions
  - **PATCH:** Clarifications, typo fixes, non-semantic improvements
- All amendments MUST update sync impact report
- Templates (plan, spec, tasks, checklist) MUST be reviewed for alignment

**Compliance Enforcement:**

- All PRs MUST pass constitution checklist (automated where possible)
- Principle violations MUST be justified in `Complexity Tracking` section of plan.md
- Quarterly constitution reviews to ensure relevance and address technical debt

**Guidance Files:**

- Runtime development guidance: `AI_SETUP_INSTRUCTIONS.md`
- Deployment procedures: `RAILWAY_DEPLOYMENT.md`
- Database setup: `DATABASE_SETUP.md`

**Version**: 1.0.0 | **Ratified**: 2026-01-20 | **Last Amended**: 2026-01-20
