CREATE TABLE "cohort_retention_users_hourly" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "installDate" TIMESTAMPTZ NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT '',
    "countryCode" TEXT NOT NULL DEFAULT '',
    "appVersion" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "cohort_retention_users_hourly_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cohort_retention_users_hourly_gameId_installDate_dayIndex_idx" ON "cohort_retention_users_hourly" ("gameId", "installDate", "dayIndex");
CREATE INDEX "cohort_retention_users_hourly_gameId_installDate_dayIndex_platform_countryCode_appVersion_idx" ON "cohort_retention_users_hourly" ("gameId", "installDate", "dayIndex", "platform", "countryCode", "appVersion");
CREATE UNIQUE INDEX "unique_cohort_retention_users_hourly" ON "cohort_retention_users_hourly" ("gameId", "installDate", "dayIndex", "userId");

ALTER TABLE "cohort_retention_users_hourly" ADD CONSTRAINT "cohort_retention_users_hourly_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
