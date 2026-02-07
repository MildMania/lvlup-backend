-- CreateTable
CREATE TABLE "fx_rates_daily" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "rateToUsd" DOUBLE PRECISION NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fx_rates_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fx_rates_daily_currency_date_idx" ON "fx_rates_daily"("currency", "date");

-- CreateIndex
CREATE UNIQUE INDEX "unique_fx_rate_daily" ON "fx_rates_daily"("date", "currency");
