CREATE TABLE "monetization_daily_rollups" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "date" TIMESTAMPTZ NOT NULL,
    "totalRevenueUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adRevenueUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "iapRevenueUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adImpressionCount" INTEGER NOT NULL DEFAULT 0,
    "iapCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "monetization_daily_rollups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "iap_payers" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstSeen" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "iap_payers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "monetization_daily_rollups_gameId_date_idx" ON "monetization_daily_rollups"("gameId", "date");
CREATE UNIQUE INDEX "unique_monetization_daily_rollup" ON "monetization_daily_rollups"("gameId", "date");

CREATE INDEX "iap_payers_gameId_firstSeen_idx" ON "iap_payers"("gameId", "firstSeen");
CREATE UNIQUE INDEX "unique_iap_payer" ON "iap_payers"("gameId", "userId");

ALTER TABLE "monetization_daily_rollups" ADD CONSTRAINT "monetization_daily_rollups_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iap_payers" ADD CONSTRAINT "iap_payers_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
