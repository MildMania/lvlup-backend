# Implementation Tasks: Versioned Game Config Bundles

**Date**: February 15, 2026  
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Overview

Task list to implement a spreadsheet-style game configuration system with:

- per-channel envNames (`live_3.1.0`) under tool environments (dev/staging/prod)
- immutable schema per channel
- drafts (dev-only), freeze to immutable section versions
- frozen-only bundle composition
- deploy/rollback increments per-channel version
- publish `version.json` + `configs.json` per envName (R2-compatible)

---

## Phase 1: Database + Types

- [ ] T001 Create branch `codex/002-game-config` from main
- [ ] T002 Add Prisma models for:
  - [ ] schema revisions
  - [ ] templates + fields
  - [ ] relations (FK validation)
  - [ ] channels (toolEnv + envName)
  - [ ] section drafts
  - [ ] section versions
  - [ ] bundle drafts
  - [ ] bundle releases
  - [ ] channel version counter
  - [ ] game-config deployments (or extend existing `Deployment` safely)
- [ ] T003 Create Prisma migration
- [ ] T004 Add backend TS types under `backend/src/types/gameConfig.types.ts`
- [ ] T005 Add API contract types under `backend/src/types/api.ts` (or dedicated file) for admin/public endpoints

---

## Phase 2: Core Services

- [ ] T006 Implement `gameConfigValidationService`:
  - [ ] field validation (required/type/constraints)
  - [ ] PK uniqueness (composite supported)
  - [ ] FK validation (relations with nested/list paths)
- [ ] T007 Implement `gameConfigDraftService`:
  - [ ] CRUD for section drafts (bulk replace + optional row upsert/delete)
  - [ ] CRUD for bundle draft selection
- [ ] T008 Implement `gameConfigFreezeService`:
  - [ ] freeze section draft -> section version
  - [ ] list section versions per template/channel
- [ ] T009 Implement `gameConfigBundleCompiler`:
  - [ ] deterministic compilation of `configs.json` from selected section versions
  - [ ] stable ordering rules
  - [ ] compute content hash
- [ ] T010 Implement `gameConfigDeployService`:
  - [ ] deploy dev -> staging channel
  - [ ] publish staging -> prod channel
  - [ ] rollback staging/prod to prior release
  - [ ] increment channel version on deploy/rollback
  - [ ] record deployment snapshot

---

## Phase 3: Admin API

- [ ] T011 Routes/controllers for schema + template management
- [ ] T012 Routes/controllers for channel management
- [ ] T013 Routes/controllers for drafts (dev only writes)
- [ ] T014 Routes/controllers for freeze operations
- [ ] T015 Routes/controllers for deploy/publish/rollback
- [ ] T016 Enforce permissions:
  - [ ] dev editable
  - [ ] staging/prod read-only except workflow endpoints

---

## Phase 4: Public API + Publishing

- [ ] T017 Implement public endpoint:
  - [ ] `GET /api/game-config/version?gameId&env`
  - [ ] `GET /api/game-config/configs?gameId&env`
- [ ] T018 Implement R2 publisher:
  - [ ] write `version.json`
  - [ ] write `configs.json`
  - [ ] ensure atomic update semantics (write new objects then switch pointers if needed)
- [ ] T019 Add caching:
  - [ ] ETag based on release hash
  - [ ] Cache-Control appropriate for your update cadence
- [ ] T020 Add rate limiting consistent with existing public endpoints

---

## Phase 5: Frontend MVP

- [ ] T021 Add navigation + pages:
  - [ ] Channels (envName list/create)
  - [ ] Section editor (grid)
  - [ ] Freeze/version list
  - [ ] Bundle composer
  - [ ] Deploy history + rollback
- [ ] T022 Add validation error rendering (row/field/path)

---

## Phase 6: Quality and Scale

- [ ] T023 Diff view between bundle releases
- [ ] T024 Bulk import/export (CSV/XLSX) into drafts (optional)
- [ ] T025 Performance work for 1000+ row sections (pagination, incremental validation)

---

## Tests

- [ ] T026 Unit tests for validation engine (field + PK + FK)
- [ ] T027 Integration tests for freeze -> deploy -> public fetch
- [ ] T028 Integration tests for rollback behavior and version increment
- [ ] T029 Regression test with large payloads

