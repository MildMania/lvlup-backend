-- CreateIndex
CREATE UNIQUE INDEX "unique_transaction_id" ON "revenue"("gameId", "transactionId") WHERE "transactionId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "unique_ad_impression_id" ON "revenue"("gameId", "adImpressionId") WHERE "adImpressionId" IS NOT NULL;

