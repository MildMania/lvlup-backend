# Implementation Plan: Versioned Game Config Bundles

**Branch**: `002-game-config` (suggested)  
**Date**: February 15, 2026  
**Spec**: [spec.md](./spec.md)

---

## Summary

Build a spreadsheet-style configuration system that supports:

- Tab templates (schemas) and template-driven validation
- Per-channel configuration environments (e.g. `live_3.1.0`) inside tool envs (dev/staging/prod)
- Draft editing in dev only
- Freeze into immutable section versions (e.g. `Gacha_v3`)
- Bundle draft selecting frozen section versions only
- Deploy/rollback creating immutable bundle releases and incrementing a monotonic channel version
- Publishing `version.json` and `configs.json` per env channel (R2-compatible)

Targeting remains handled by existing Remote Config via `game_config_env`.

---

## Technical Approach

### Backend

- Add a new module separate from RemoteConfig (different semantics, size expectations).
- Persist drafts and versions in Postgres via Prisma.
- Add:
  - validation engine (field constraints, PK uniqueness, FK relations)
  - bundle compiler (deterministic JSON output)
  - publisher that writes artifacts to R2 (phase 1) and optionally serves from DB (phase 2)

### Frontend

- MVP admin pages for:
  - channel list/create (envName)
  - template and field view
  - section draft editor (grid)
  - freeze and version list
  - bundle composer
  - deployment history + rollback

---

## Phases

### Phase 1: Data Model + Migrations

Goal: Prisma models + migrations for schema revisions, templates, channels, drafts, versions, releases, deployments, and channel version counters.

Exit criteria:
- Migrate successfully on dev DB
- Seed/test creation of schema revision + channel

### Phase 2: Core Services

Goal: draft CRUD, freeze, validation, compile bundle, deploy/rollback operations.

Exit criteria:
- Can freeze section versions from drafts
- Can compile bundle release from selection of frozen versions
- Can deploy and increment version
- Can rollback and increment version

### Phase 3: Admin API

Goal: REST endpoints for channel/draft/version/bundle/deploy/rollback.

Exit criteria:
- Endpoints match spec and are protected with existing auth/roles
- Staging/prod are read-only except workflow actions

### Phase 4: Public API + R2 Publishing

Goal: publish and serve `version.json` and `configs.json` per envName.

Exit criteria:
- Public endpoints return the correct payload for `envName`
- R2 artifacts update on deploy/rollback
- ETag/Cache-Control implemented (optional in phase 1; recommended)

### Phase 5: Frontend MVP

Goal: usable admin UI for managing channels and bundles without spreadsheets.

Exit criteria:
- Operator can create channel, edit drafts, freeze, compose, deploy, rollback.

### Phase 6: Validation Enhancements + Tooling

Goal: cross-section reference validation, better error UX, diffs between releases, large-dataset performance.

Exit criteria:
- FK validation rules configurable at schema revision
- Diff view between releases for audit

---

## Key Design Decisions (Locked)

- Each channel has an immutable schema revision. Schema changes require new channel.
- Bundle composition is frozen-only.
- Deploy and rollback always increment channel version.
- Whole bundle download only (for now).

