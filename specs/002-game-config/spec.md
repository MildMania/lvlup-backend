# Feature Specification: Versioned Game Config Bundles (Spreadsheet-Style)

**Created**: February 15, 2026  
**Status**: Draft  
**Input**: User description: "A flexible and modular system like an Excel config sheet with tab templates, versioned sub-tabs, per-channel environments (e.g. `live_3.1.0`), dev/staging/production workflow like Remote Config, whole-bundle JSON export, and later C# class export."

---

## 1. Problem Statement

Game teams maintain large configuration spreadsheets (store, gacha, quests, economy, etc.) with many versions of each "tab". Today the game client:

- Reads `game_config_env` (e.g. `live_3.1.0`) from local config or Remote Config.
- Downloads `version.json` for that env.
- If the server version is newer than the local version, downloads `configs.json` (the whole bundle).

We need to replicate and improve this workflow inside the tool:

- Users define tab formats (templates).
- Users edit data for each env channel.
- Users freeze immutable versions for each tab (like `Gacha_v3`).
- Users compose a bundle release by selecting frozen tab versions.
- Deploy/rollback increments a monotonic version number.
- Clients download the bundle as JSON (compatible with current client expectations).
- Multiple env channels can exist in parallel under production to support old game versions (e.g. `live_3.0.0` and `live_3.2.0`).

---

## 2. Glossary

- **Tool Environment**: `development`, `staging`, `production` (workflow + permissions in this admin tool).
- **Channel / Game Config Environment (envName)**: arbitrary string used by Unity client, e.g. `live_3.1.0`.
- **Channel**: a tuple `(gameId, toolEnvironment, envName)`; "production/live_3.1.0" is one channel.
- **Schema Revision**: immutable definition of templates/fields/validation rules for a channel. Each channel pins exactly one schema revision.
- **Template (Tab Template)**: a named section definition (e.g. `StoreProducts`, `Gacha`) with fields/constraints.
- **Section Draft**: editable data for one template within a channel.
- **Section Version**: immutable snapshot of a section draft (e.g. `Gacha_v3`), created by "freeze".
- **Bundle Draft**: within a channel, selection of which frozen section versions make up the bundle.
- **Bundle Release**: immutable compiled `configs.json` for the channel created at deploy/rollback time.
- **Channel Version**: monotonic integer for the channel, returned by `version.json` and incremented on every deploy/rollback.

---

## 3. Locked Rules (Must-Haves)

### 3.1 Client Contract (Compatibility)

The system must publish and serve two artifacts per channel (envName):

- `version.json`
  - Shape: `{ "version": <int>, "env": "<envName>" }`
- `configs.json`
  - Shape: a JSON object containing top-level section keys (tab names) mapping to their payloads.
  - Example (current game):
    - `Gacha`: array of objects
    - `StoreProducts`: array of objects
    - `Economy`: array (often length 1)
    - `PurchaseOffers`: array
    - `Quests`: array

Client flow remains:
1. GET version, compare with local.
2. If newer, GET configs and replace local.

### 3.2 Channel Semantics

- `envName` is arbitrary string (no constraints beyond being a non-empty string).
- Multiple channels can exist concurrently in production (e.g. `production/live_3.0.0`, `production/live_3.2.0`).
- Old game versions are supported by keeping their channel alive and editable for value changes.

### 3.3 Schema Immutability Per Channel

- Each channel has an immutable schema revision.
- Schema changes (templates/fields/types/validation rules/relations) are **not allowed** in an existing channel.
- Any schema change requires creating a **new channel** (usually with a new envName) that pins a new schema revision.

### 3.4 Frozen-Only Composition

- Bundles can include **only frozen section versions**.
- Draft edits do not affect clients until:
  1) section(s) are frozen to versions, then
  2) bundle draft selects versions, then
  3) deploy occurs

### 3.5 Versioning and Rollback

- `version` is **monotonic integer per channel**.
- Every deploy increments `version` by 1.
- Every rollback also increments `version` by 1 (clients re-fetch deterministically).

### 3.6 Validation

- Template-driven validation should exist.
- Cross-section validation is desired (e.g. reference integrity like `StoreProducts.Drop` exists in `Gacha.ID`).

---

## 4. Non-Goals (For Initial Build)

- Auto-generated C# classes: explicitly later phase (still keep API/spec compatible with codegen).
- Partial downloads per section: initial contract is whole bundle.
- Live rule evaluation in bundle export (like Remote Config rules): initial system is "one bundle per channel", with targeting handled by Remote Config choosing `game_config_env`.

---

## 5. User Scenarios & Testing (Mandatory)

### US1 (P1) Create a new channel and publish configs

Designer creates a new channel `development/live_3.2.0` (schema pinned), edits `StoreProducts` and `Gacha` drafts, freezes them as `StoreProducts_v1` and `Gacha_v1`, selects them into the bundle draft, then deploys to `staging/live_3.2.0`. The system publishes new `version.json` and `configs.json` for `staging/live_3.2.0`.

Acceptance:
- Cannot deploy with any draft sections included (must be frozen).
- `version` increments on deploy.
- `configs.json` contains only selected sections and values.

### US2 (P1) Support parallel old/new releases

Team keeps `production/live_3.0.0` active for old clients and creates `production/live_3.2.0` for new clients. They edit and redeploy `live_3.0.0` values without changing schema. Old clients continue using `live_3.0.0` and see new version bumps.

Acceptance:
- Two production channels can exist.
- Editing values and redeploying old channel increments its own version only.
- Schema of old channel cannot be changed.

### US3 (P1) Rollback on production channel

After deploying a bad `configs.json`, operator rolls back `production/live_3.2.0` to a prior release. The channel version increments and `version.json` changes, forcing clients to download the rolled-back `configs.json`.

Acceptance:
- Rollback always increments version and publishes artifacts.
- Rollback is auditable (who, when, from which release).

### US4 (P2) Validation prevents bad references

Designer edits `StoreProducts.Drop` to reference a gacha ID that does not exist. The system blocks freeze/deploy with actionable validation errors.

Acceptance:
- Validation errors indicate section, row, and field/path.
- Cross-section FK validation can be configured.

---

## 6. Architecture Overview

### 6.1 Components

- **Backend** (Express + Prisma):
  - Schema/template management
  - Draft editing
  - Freeze to immutable versions
  - Bundle composition, deploy, rollback
  - Public endpoints for `version.json` and `configs.json`
  - Publisher that writes artifacts to R2 (optional but matches current setup)

- **Frontend** (Admin dashboard):
  - Channel selector (tool env + envName)
  - Template viewer
  - Table/grid editing per template
  - Versioning/freeze UX
  - Bundle composer
  - Deploy/rollback history and actions

- **Object Storage** (R2):
  - Stores published JSON artifacts:
    - `.../{gameId}/{toolEnv}/{envName}/version.json`
    - `.../{gameId}/{toolEnv}/{envName}/configs.json`

### 6.2 Data Flow (Client-Facing)

1. Client knows `envName` from local or Remote Config (`game_config_env`).
2. Client downloads `version.json`.
3. If `version` is newer, client downloads `configs.json`.

Targeting is handled by Remote Config (e.g. appVersion-based) which chooses the `envName` per client segment.

---

## 7. Data Model (Proposed)

### 7.0 Prisma Schema Draft (Concrete)

This snippet is intended to be copy-pastable into `backend/prisma/schema.prisma` and aligns with the "string enums" style used elsewhere in this repo (for SQLite compatibility via `switch-env.sh`).

```prisma
model GameConfigSchemaRevision {
  id          String   @id @default(cuid())
  gameId      String
  name        String
  createdBy   String
  createdAt   DateTime @default(now())

  game        Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)
  templates   GameConfigTemplate[]
  relations   GameConfigRelation[]
  channels    GameConfigChannel[]

  @@unique([gameId, name])
  @@index([gameId, createdAt])
  @@map("game_config_schema_revisions")
}

model GameConfigTemplate {
  id               String   @id @default(cuid())
  schemaRevisionId String
  name             String
  description      String?
  primaryKey       Json?    // ["ID"] or ["ID","VariantID"]
  sectionType      String   @default("array") // "array" (v1). Future: "object"
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  schemaRevision   GameConfigSchemaRevision @relation(fields: [schemaRevisionId], references: [id], onDelete: Cascade)
  fields           GameConfigField[]
  sectionDrafts    GameConfigSectionDraft[]
  sectionVersions  GameConfigSectionVersion[]

  @@unique([schemaRevisionId, name])
  @@index([schemaRevisionId, name])
  @@map("game_config_templates")
}

model GameConfigField {
  id          String   @id @default(cuid())
  templateId  String
  name        String
  type        String   // "string" | "int" | "float" | "bool" | "json" | "list"
  required    Boolean  @default(false)
  defaultValue Json?
  constraints Json?    // { enum: [...], min: 0, max: 10, regex: "...", maxLength: 64 }
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  template    GameConfigTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  @@unique([templateId, name])
  @@index([templateId])
  @@map("game_config_fields")
}

model GameConfigRelation {
  id               String   @id @default(cuid())
  schemaRevisionId String
  fromTemplateId   String
  fromPath         String   // e.g. "Drop" or "Stages[].StoreItemId"
  toTemplateId     String
  toPath           String   // e.g. "ID" or "ID,VariantID"
  mode             String   @default("error") // "error" | "warn"
  createdAt        DateTime @default(now())

  schemaRevision   GameConfigSchemaRevision @relation(fields: [schemaRevisionId], references: [id], onDelete: Cascade)

  @@index([schemaRevisionId])
  @@map("game_config_relations")
}

model GameConfigChannel {
  id               String   @id @default(cuid())
  gameId           String
  toolEnvironment  String   // "development" | "staging" | "production"
  envName          String   // e.g. "live_3.1.0"
  schemaRevisionId String
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  game             Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)
  schemaRevision   GameConfigSchemaRevision @relation(fields: [schemaRevisionId], references: [id], onDelete: Restrict)
  sectionDrafts    GameConfigSectionDraft[]
  sectionVersions  GameConfigSectionVersion[]
  bundleDraft      GameConfigBundleDraft?
  releases         GameConfigBundleRelease[]
  state            GameConfigChannelState?
  deployments      GameConfigDeployment[]

  @@unique([gameId, toolEnvironment, envName])
  @@index([gameId, toolEnvironment, envName])
  @@map("game_config_channels")
}

model GameConfigSectionDraft {
  id         String   @id @default(cuid())
  channelId  String
  templateId String
  rows       Json     // array (v1)
  updatedBy  String
  updatedAt  DateTime @updatedAt

  channel    GameConfigChannel  @relation(fields: [channelId], references: [id], onDelete: Cascade)
  template   GameConfigTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  @@unique([channelId, templateId])
  @@index([channelId])
  @@map("game_config_section_drafts")
}

model GameConfigSectionVersion {
  id            String   @id @default(cuid())
  channelId     String
  templateId    String
  versionNumber Int
  label         String?  // e.g. "v3"
  rows          Json     // snapshot
  createdBy     String
  createdAt     DateTime @default(now())

  channel       GameConfigChannel  @relation(fields: [channelId], references: [id], onDelete: Cascade)
  template      GameConfigTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  @@unique([channelId, templateId, versionNumber])
  @@index([channelId, templateId, versionNumber])
  @@map("game_config_section_versions")
}

model GameConfigBundleDraft {
  id          String   @id @default(cuid())
  channelId   String   @unique
  selection   Json     // { "Gacha": "<sectionVersionId>", ... }
  updatedBy   String
  updatedAt   DateTime @updatedAt

  channel     GameConfigChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@map("game_config_bundle_drafts")
}

model GameConfigBundleRelease {
  id             String   @id @default(cuid())
  channelId       String
  selection       Json     // templateName -> sectionVersionId
  compiledConfigs Json     // final configs.json payload
  compiledHash    String   // sha256 (hex)
  createdBy       String
  createdAt       DateTime @default(now())

  channel         GameConfigChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@index([channelId, createdAt])
  @@map("game_config_bundle_releases")
}

model GameConfigChannelState {
  channelId        String  @id
  currentVersion   Int     @default(0)
  currentReleaseId String?
  updatedAt        DateTime @updatedAt

  channel          GameConfigChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@map("game_config_channel_state")
}

model GameConfigDeployment {
  id             String   @id @default(cuid())
  channelId       String
  action          String   // "deploy" | "rollback"
  fromReleaseId   String?
  toReleaseId     String
  fromVersion     Int
  toVersion       Int
  createdBy       String
  createdAt       DateTime @default(now())
  snapshot        Json     // selection + hash + optional compiledConfigs subset

  channel         GameConfigChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@index([channelId, createdAt])
  @@map("game_config_deployments")
}
```

### 7.1 Core Entities

- `GameConfigSchemaRevision`
  - `id`, `gameId`, `name` (optional), `createdBy`, `createdAt`
  - Immutable once created.

- `GameConfigTemplate`
  - `id`, `schemaRevisionId`, `name` (e.g. `StoreProducts`), `description`
  - Unique `(schemaRevisionId, name)`

- `GameConfigField`
  - `id`, `templateId`, `name`, `type`, `required`, `defaultValue`, `constraintsJson`
  - Field types v1: `string`, `int`, `float`, `bool`, `json` (nested object), `list` (array)
  - Constraints v1: enum, min/max, regex, maxLength

- `GameConfigRelation` (cross-section validation)
  - `id`, `schemaRevisionId`
  - `fromTemplate`, `fromFieldPath` (supports nested paths like `Drops[].ID`)
  - `toTemplate`, `toFieldPath`
  - `mode`: `error|warn`

### 7.2 Channel + Drafts

- `GameConfigChannel`
  - `id`, `gameId`, `toolEnvironment` (`development|staging|production`), `envName`
  - `schemaRevisionId` (pinned, immutable)
  - Unique `(gameId, toolEnvironment, envName)`

- `GameConfigSectionDraft`
  - `id`, `channelId`, `templateId`, `rowsJson`, `updatedAt`, `updatedBy`
  - Unique `(channelId, templateId)`
  - Editable only when channel.toolEnvironment == `development`

- `GameConfigBundleDraft`
  - `id`, `channelId`, `selectionJson`
  - `selectionJson`: map `{ templateName: sectionVersionId }`
  - Editable only when channel.toolEnvironment == `development`

### 7.3 Immutable Versions and Releases

- `GameConfigSectionVersion`
  - `id`, `channelId`, `templateId`
  - `versionNumber` (int), `label` (optional like `v3`)
  - `rowsJson` (snapshot), `createdAt`, `createdBy`
  - Unique `(channelId, templateId, versionNumber)`

- `GameConfigBundleRelease`
  - `id`, `channelId`
  - `releaseNumber` (int, optional), `createdAt`, `createdBy`
  - `selectionJson` (template -> sectionVersionId)
  - `compiledConfigsJson` (the actual `configs.json` payload)

- `GameConfigChannelVersion`
  - `channelId` (PK/FK)
  - `currentVersion` int (monotonic)
  - `currentReleaseId` -> `GameConfigBundleRelease`
  - Updated only by deploy/rollback processes

### 7.4 Deploy History

Either:
- Reuse existing `Deployment` table by adding `deploymentType = 'remote_config'|'game_config'` and storing game config snapshot in `snapshot`, or
- Add a parallel `GameConfigDeployment` table.

Locked behavior:
- Every deploy/rollback creates a deployment record with snapshot:
  - `envName`, old version, new version, old release id, new release id, selection, compiled hash, actor

---

## 8. Validation Rules (v1)

### 8.1 Per-Field

- Required fields present
- Type checks
- Enum membership
- Min/max for numeric
- Regex + maxLength for string

### 8.2 Primary Keys

Template may define a primary key:
- Single-field or composite (e.g. StoreProducts `(ID, VariantID)`)
- Must be unique within the section

### 8.3 Cross-Section Relations (FK)

Schema revision can define FK constraints:
- Example: `StoreProducts.Drop` must exist in `Gacha.ID`
- Support arrays and nested paths:
  - `PurchaseOffers.Stages[].StoreItemId` references `StoreProducts.(ID, VariantID?)` (if needed)

Enforcement points:
- On freeze section version
- On deploy bundle release

Output:
- Actionable errors referencing: template, row identity (by PK if available else row index), field/path, message.

---

## 9. Admin API (Proposed)

Note: route names should match the repo's conventions (`/api/admin/...`).

### 9.1 Schema & Template Management

- Create schema revision (from scratch or fork from existing revision for new env channels)
- List schema revisions
- Create templates + fields (only on new schema revisions)

### 9.2 Channel Management

- Create channel:
  - Inputs: `gameId`, `toolEnvironment=development`, `envName`, `schemaRevisionId`
- List channels per game & env

### 9.3 Draft Editing (development only)

- Update section draft (bulk replace or row-level)
- Read section draft
- Update bundle draft selections (template -> sectionVersionId)

### 9.4 Freeze

- Freeze section draft -> create `SectionVersion`
- Validate on freeze (field + PK + FK where applicable)

### 9.5 Deploy / Rollback (admin-only)

Actions are analogous to existing Remote Config env workflow, but scoped to channel:
- Deploy dev channel -> staging channel
- Publish staging channel -> prod channel
- Rollback staging/prod channel to a prior release

All actions:
- Create new `BundleRelease`
- Increment `ChannelVersion.currentVersion` by 1
- Publish artifacts to R2
- Record deployment history snapshot

---

## 10. Public API (Proposed)

### 10.1 Version

`GET /api/game-config/version?gameId=<id>&env=<envName>`

Returns:
```json
{ "version": 6, "env": "live_3.1.0" }
```

### 10.2 Configs

`GET /api/game-config/configs?gameId=<id>&env=<envName>`

Returns:
```json
{
  "Gacha": [ ... ],
  "StoreProducts": [ ... ],
  "Economy": [ ... ]
}
```

---

## 11. Publishing to R2 (Current Behavior Compatibility)

Artifacts are stored per channel and updated on deploy/rollback:

- `version.json`: contains monotonic channel version
- `configs.json`: compiled bundle payload

We should support either:
- Backend serves directly from DB + sets ETag, OR
- Backend publishes to R2 and serves via signed/public URLs

Given current system uses R2 files:
- Keep R2 as source for Unity client (phase 1).
- Backend is source-of-truth and the publisher.

---

## 12. Observability and Audit

- Audit who changed drafts, who froze versions, who deployed/rolled back.
- Log: deploy/rollback actions with channel + envName + version increments + artifact hashes.
- Store `compiledConfigsJson` hash to verify R2 matches DB release.

---

## 13. Security / Permissions

- Development channels: editable (drafts, freeze, bundle selection).
- Staging/Production channels: read-only for drafts; changes only via deploy/rollback from the workflow.
- Public endpoints: read-only; rate limited similarly to remote config public endpoint.

---

## 14. Testing Strategy

- Unit tests:
  - validation engine (types, constraints, PK uniqueness, FK checks)
  - bundle compilation deterministic output (stable JSON ordering rules)
- Integration tests:
  - freeze -> deploy -> public fetch returns correct artifacts
  - rollback increments version and returns old compiled payload
- Regression tests:
  - large sections (1000+ rows) for performance and size limits

---

## 15. Future: C# Export (Explicitly Later)

Once the schema/template system is stable:
- Generate C# POCOs and parsing helpers per template and per channel schema revision (format to be provided).
- Output should be deterministic and keyed by schema revision.
