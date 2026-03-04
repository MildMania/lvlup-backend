CREATE TABLE IF NOT EXISTS "analytics_sync_watermarks" (
  "pipeline" text PRIMARY KEY,
  "lastTs" timestamptz NOT NULL,
  "lastId" text NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
