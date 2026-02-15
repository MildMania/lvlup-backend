-- Game Config Structures (schema-scoped reusable types)

CREATE TABLE IF NOT EXISTS "game_config_structures" (
  "id" TEXT NOT NULL,
  "schemaRevisionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "game_config_structures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "game_config_structures_schemaRevisionId_fkey" FOREIGN KEY ("schemaRevisionId") REFERENCES "game_config_schema_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "game_config_structures_schemaRevisionId_name_key" ON "game_config_structures"("schemaRevisionId", "name");
CREATE INDEX IF NOT EXISTS "game_config_structures_schemaRevisionId_name_idx" ON "game_config_structures"("schemaRevisionId", "name");

CREATE TABLE IF NOT EXISTS "game_config_structure_fields" (
  "id" TEXT NOT NULL,
  "structureId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT FALSE,
  "constraints" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "game_config_structure_fields_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "game_config_structure_fields_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "game_config_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "game_config_structure_fields_structureId_name_key" ON "game_config_structure_fields"("structureId", "name");
CREATE INDEX IF NOT EXISTS "game_config_structure_fields_structureId_idx" ON "game_config_structure_fields"("structureId");
