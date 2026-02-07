-- CreateTable
CREATE TABLE "cohort_monetization_daily" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "installDate" TIMESTAMP(3) NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "platform" TEXT NOT NULL DEFAULT '',
    "countryCode" TEXT NOT NULL DEFAULT '',
    "appVersion" TEXT NOT NULL DEFAULT '',
    "iapRevenueUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adRevenueUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRevenueUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "iapPayingUsers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cohort_monetization_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cohort_monetization_daily_gameId_installDate_idx" ON "cohort_monetization_daily"("gameId", "installDate");

-- CreateIndex
CREATE INDEX "cohort_monetization_daily_gameId_dayIndex_idx" ON "cohort_monetization_daily"("gameId", "dayIndex");

-- CreateIndex
CREATE INDEX "cohort_monetization_daily_gameId_installDate_platform_countr_idx" ON "cohort_monetization_daily"("gameId", "installDate", "platform", "countryCode", "appVersion");

-- CreateIndex
CREATE UNIQUE INDEX "unique_cohort_monetization_daily" ON "cohort_monetization_daily"("gameId", "installDate", "dayIndex", "platform", "countryCode", "appVersion");

-- AddForeignKey
ALTER TABLE "cohort_monetization_daily" ADD CONSTRAINT "cohort_monetization_daily_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
