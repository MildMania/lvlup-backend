-- Add per-user daily aggregates to support cohort filters (e.g., install date)

ALTER TABLE "level_metrics_daily_users"
  ADD COLUMN IF NOT EXISTS "starts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "completes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "fails" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalCompletionDuration" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "completionCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalFailDuration" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "failCount" INTEGER NOT NULL DEFAULT 0;

-- Install-date filtering joins through users; make that join cheap.
CREATE INDEX IF NOT EXISTS "users_gameId_createdAt_idx" ON "users"("gameId", "createdAt");
