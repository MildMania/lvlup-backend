-- CreateTable
CREATE TABLE "level_churn_cohort_daily" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "cohortDate" TIMESTAMP(3) NOT NULL,
    "installDate" TIMESTAMP(3) NOT NULL,
    "levelId" INTEGER NOT NULL,
    "levelFunnel" TEXT NOT NULL DEFAULT '',
    "levelFunnelVersion" INTEGER NOT NULL DEFAULT 0,
    "platform" TEXT NOT NULL DEFAULT '',
    "countryCode" TEXT NOT NULL DEFAULT '',
    "appVersion" TEXT NOT NULL DEFAULT '',
    "starters" INTEGER NOT NULL DEFAULT 0,
    "completedByD0" INTEGER NOT NULL DEFAULT 0,
    "completedByD3" INTEGER NOT NULL DEFAULT 0,
    "completedByD7" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "level_churn_cohort_daily_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "level_churn_cohort_daily_gameId_cohortDate_idx" ON "level_churn_cohort_daily"("gameId", "cohortDate");
CREATE INDEX "level_churn_cohort_daily_gameId_installDate_idx" ON "level_churn_cohort_daily"("gameId", "installDate");
CREATE INDEX "level_churn_cohort_daily_gameId_levelId_cohortDate_idx" ON "level_churn_cohort_daily"("gameId", "levelId", "cohortDate");
CREATE INDEX "level_churn_cohort_daily_gameId_levelFunnel_levelFunnelVersion_cohortDate_idx" ON "level_churn_cohort_daily"("gameId", "levelFunnel", "levelFunnelVersion", "cohortDate");

-- Unique
CREATE UNIQUE INDEX "unique_level_churn_cohort_daily" ON "level_churn_cohort_daily"(
    "gameId", "cohortDate", "installDate", "levelId", "levelFunnel", "levelFunnelVersion", "platform", "countryCode", "appVersion"
);

-- Foreign key
ALTER TABLE "level_churn_cohort_daily"
ADD CONSTRAINT "level_churn_cohort_daily_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
