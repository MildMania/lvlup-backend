-- Daily exact DAU rollups
CREATE TABLE IF NOT EXISTS "active_users_daily" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "date" TIMESTAMPTZ NOT NULL,
    "platform" TEXT NOT NULL DEFAULT '',
    "countryCode" TEXT NOT NULL DEFAULT '',
    "appVersion" TEXT NOT NULL DEFAULT '',
    "dau" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "active_users_daily_pkey" PRIMARY KEY ("id")
);

-- Daily HLL rollups (approx WAU/MAU)
CREATE TABLE IF NOT EXISTS "active_users_hll_daily" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "date" TIMESTAMPTZ NOT NULL,
    "platform" TEXT NOT NULL DEFAULT '',
    "countryCode" TEXT NOT NULL DEFAULT '',
    "appVersion" TEXT NOT NULL DEFAULT '',
    "hll" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "active_users_hll_daily_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "active_users_daily_gameId_date_idx" ON "active_users_daily" ("gameId", "date");
CREATE INDEX IF NOT EXISTS "active_users_daily_dims_idx" ON "active_users_daily" ("gameId", "date", "platform", "countryCode", "appVersion");
CREATE UNIQUE INDEX IF NOT EXISTS "active_users_daily_unique" ON "active_users_daily" ("gameId", "date", "platform", "countryCode", "appVersion");

CREATE INDEX IF NOT EXISTS "active_users_hll_daily_gameId_date_idx" ON "active_users_hll_daily" ("gameId", "date");
CREATE INDEX IF NOT EXISTS "active_users_hll_daily_dims_idx" ON "active_users_hll_daily" ("gameId", "date", "platform", "countryCode", "appVersion");
CREATE UNIQUE INDEX IF NOT EXISTS "active_users_hll_daily_unique" ON "active_users_hll_daily" ("gameId", "date", "platform", "countryCode", "appVersion");

ALTER TABLE "active_users_daily"
    ADD CONSTRAINT "active_users_daily_gameId_fkey"
    FOREIGN KEY ("gameId") REFERENCES "games"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "active_users_hll_daily"
    ADD CONSTRAINT "active_users_hll_daily_gameId_fkey"
    FOREIGN KEY ("gameId") REFERENCES "games"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
