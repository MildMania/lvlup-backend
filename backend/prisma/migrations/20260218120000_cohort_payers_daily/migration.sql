-- CreateTable
CREATE TABLE "cohort_payers_daily" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "installDate" TIMESTAMP(3) NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "platform" TEXT NOT NULL DEFAULT '',
    "countryCode" TEXT NOT NULL DEFAULT '',
    "appVersion" TEXT NOT NULL DEFAULT '',
    "newPayers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cohort_payers_daily_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "cohort_payers_daily_gameId_installDate_idx" ON "cohort_payers_daily"("gameId", "installDate");
CREATE INDEX "cohort_payers_daily_gameId_dayIndex_idx" ON "cohort_payers_daily"("gameId", "dayIndex");
CREATE INDEX "cohort_payers_daily_gameId_installDate_platform_countryCode_appVersion_idx" ON "cohort_payers_daily"("gameId", "installDate", "platform", "countryCode", "appVersion");

-- Uniques
CREATE UNIQUE INDEX "unique_cohort_payers_daily" ON "cohort_payers_daily"("gameId", "installDate", "dayIndex", "platform", "countryCode", "appVersion");

-- Foreign key
ALTER TABLE "cohort_payers_daily"
ADD CONSTRAINT "cohort_payers_daily_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
