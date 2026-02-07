-- Cohort retention rollups
CREATE TABLE IF NOT EXISTS "cohort_retention_daily" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "installDate" TIMESTAMPTZ NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "platform" TEXT NOT NULL DEFAULT '',
    "countryCode" TEXT NOT NULL DEFAULT '',
    "appVersion" TEXT NOT NULL DEFAULT '',
    "cohortSize" INTEGER NOT NULL DEFAULT 0,
    "retainedUsers" INTEGER NOT NULL DEFAULT 0,
    "retainedLevelCompletes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "cohort_retention_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cohort_retention_daily_unique"
  ON "cohort_retention_daily" ("gameId","installDate","dayIndex","platform","countryCode","appVersion");
CREATE INDEX IF NOT EXISTS "cohort_retention_daily_game_install_idx"
  ON "cohort_retention_daily" ("gameId","installDate");
CREATE INDEX IF NOT EXISTS "cohort_retention_daily_game_day_idx"
  ON "cohort_retention_daily" ("gameId","dayIndex");
CREATE INDEX IF NOT EXISTS "cohort_retention_daily_dims_idx"
  ON "cohort_retention_daily" ("gameId","installDate","platform","countryCode","appVersion");

ALTER TABLE "cohort_retention_daily"
  ADD CONSTRAINT "cohort_retention_daily_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "games"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Cohort session metrics rollups (playtime/session count/length)
CREATE TABLE IF NOT EXISTS "cohort_session_metrics_daily" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "installDate" TIMESTAMPTZ NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "platform" TEXT NOT NULL DEFAULT '',
    "countryCode" TEXT NOT NULL DEFAULT '',
    "appVersion" TEXT NOT NULL DEFAULT '',
    "cohortSize" INTEGER NOT NULL DEFAULT 0,
    "sessionUsers" INTEGER NOT NULL DEFAULT 0,
    "totalSessions" INTEGER NOT NULL DEFAULT 0,
    "totalDurationSec" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "cohort_session_metrics_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cohort_session_metrics_daily_unique"
  ON "cohort_session_metrics_daily" ("gameId","installDate","dayIndex","platform","countryCode","appVersion");
CREATE INDEX IF NOT EXISTS "cohort_session_metrics_daily_game_install_idx"
  ON "cohort_session_metrics_daily" ("gameId","installDate");
CREATE INDEX IF NOT EXISTS "cohort_session_metrics_daily_game_day_idx"
  ON "cohort_session_metrics_daily" ("gameId","dayIndex");
CREATE INDEX IF NOT EXISTS "cohort_session_metrics_daily_dims_idx"
  ON "cohort_session_metrics_daily" ("gameId","installDate","platform","countryCode","appVersion");

ALTER TABLE "cohort_session_metrics_daily"
  ADD CONSTRAINT "cohort_session_metrics_daily_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "games"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
