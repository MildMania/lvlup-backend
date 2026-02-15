-- Game Config Bundles (schema revisions, templates, channels, drafts, versions, releases)

-- Schema revisions (immutable per channel)
CREATE TABLE IF NOT EXISTS "game_config_schema_revisions" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "game_config_schema_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "game_config_schema_revisions_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "game_config_schema_revisions_gameId_name_key" ON "game_config_schema_revisions"("gameId", "name");
CREATE INDEX IF NOT EXISTS "game_config_schema_revisions_gameId_createdAt_idx" ON "game_config_schema_revisions"("gameId", "createdAt");

-- Templates
CREATE TABLE IF NOT EXISTS "game_config_templates" (
  "id" TEXT NOT NULL,
  "schemaRevisionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "primaryKey" JSONB,
  "sectionType" TEXT NOT NULL DEFAULT 'array',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "game_config_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "game_config_templates_schemaRevisionId_fkey" FOREIGN KEY ("schemaRevisionId") REFERENCES "game_config_schema_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "game_config_templates_schemaRevisionId_name_key" ON "game_config_templates"("schemaRevisionId", "name");
CREATE INDEX IF NOT EXISTS "game_config_templates_schemaRevisionId_name_idx" ON "game_config_templates"("schemaRevisionId", "name");

-- Fields
CREATE TABLE IF NOT EXISTS "game_config_fields" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT FALSE,
  "defaultValue" JSONB,
  "constraints" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "game_config_fields_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "game_config_fields_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "game_config_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "game_config_fields_templateId_name_key" ON "game_config_fields"("templateId", "name");
CREATE INDEX IF NOT EXISTS "game_config_fields_templateId_idx" ON "game_config_fields"("templateId");

-- Cross-section relations (FK validation rules)
CREATE TABLE IF NOT EXISTS "game_config_relations" (
  "id" TEXT NOT NULL,
  "schemaRevisionId" TEXT NOT NULL,
  "fromTemplateId" TEXT NOT NULL,
  "fromPath" TEXT NOT NULL,
  "toTemplateId" TEXT NOT NULL,
  "toPath" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'error',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "game_config_relations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "game_config_relations_schemaRevisionId_fkey" FOREIGN KEY ("schemaRevisionId") REFERENCES "game_config_schema_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "game_config_relations_schemaRevisionId_idx" ON "game_config_relations"("schemaRevisionId");

-- Channels (tool env + envName)
CREATE TABLE IF NOT EXISTS "game_config_channels" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "toolEnvironment" TEXT NOT NULL,
  "envName" TEXT NOT NULL,
  "schemaRevisionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "game_config_channels_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "game_config_channels_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "game_config_channels_schemaRevisionId_fkey" FOREIGN KEY ("schemaRevisionId") REFERENCES "game_config_schema_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "game_config_channels_gameId_toolEnvironment_envName_key" ON "game_config_channels"("gameId", "toolEnvironment", "envName");
CREATE INDEX IF NOT EXISTS "game_config_channels_gameId_toolEnvironment_envName_idx" ON "game_config_channels"("gameId", "toolEnvironment", "envName");

-- Section drafts (dev-only edits)
CREATE TABLE IF NOT EXISTS "game_config_section_drafts" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "rows" JSONB NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "game_config_section_drafts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "game_config_section_drafts_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "game_config_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "game_config_section_drafts_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "game_config_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "game_config_section_drafts_channelId_templateId_key" ON "game_config_section_drafts"("channelId", "templateId");
CREATE INDEX IF NOT EXISTS "game_config_section_drafts_channelId_idx" ON "game_config_section_drafts"("channelId");

-- Section versions (immutable snapshots)
CREATE TABLE IF NOT EXISTS "game_config_section_versions" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "label" TEXT,
  "rows" JSONB NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "game_config_section_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "game_config_section_versions_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "game_config_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "game_config_section_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "game_config_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "game_config_section_versions_channelId_templateId_versionNumber_key" ON "game_config_section_versions"("channelId", "templateId", "versionNumber");
CREATE INDEX IF NOT EXISTS "game_config_section_versions_channelId_templateId_versionNumber_idx" ON "game_config_section_versions"("channelId", "templateId", "versionNumber");

-- Bundle draft (frozen-only selection)
CREATE TABLE IF NOT EXISTS "game_config_bundle_drafts" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "selection" JSONB NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "game_config_bundle_drafts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "game_config_bundle_drafts_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "game_config_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "game_config_bundle_drafts_channelId_key" ON "game_config_bundle_drafts"("channelId");

-- Bundle releases (compiled configs.json)
CREATE TABLE IF NOT EXISTS "game_config_bundle_releases" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "selection" JSONB NOT NULL,
  "compiledConfigs" JSONB NOT NULL,
  "compiledHash" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "game_config_bundle_releases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "game_config_bundle_releases_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "game_config_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "game_config_bundle_releases_channelId_createdAt_idx" ON "game_config_bundle_releases"("channelId", "createdAt");

-- Channel state (current version pointer)
CREATE TABLE IF NOT EXISTS "game_config_channel_state" (
  "channelId" TEXT NOT NULL,
  "currentVersion" INTEGER NOT NULL DEFAULT 0,
  "currentReleaseId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "game_config_channel_state_pkey" PRIMARY KEY ("channelId"),
  CONSTRAINT "game_config_channel_state_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "game_config_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Deployments / audit history
CREATE TABLE IF NOT EXISTS "game_config_deployments" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "fromReleaseId" TEXT,
  "toReleaseId" TEXT NOT NULL,
  "fromVersion" INTEGER NOT NULL,
  "toVersion" INTEGER NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "snapshot" JSONB NOT NULL,

  CONSTRAINT "game_config_deployments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "game_config_deployments_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "game_config_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "game_config_deployments_channelId_createdAt_idx" ON "game_config_deployments"("channelId", "createdAt");
