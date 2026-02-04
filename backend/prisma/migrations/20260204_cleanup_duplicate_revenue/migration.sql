-- Step 1: Delete duplicate transactionIds (keep oldest, delete newer copies)
DELETE FROM "revenue"
WHERE id IN (
  SELECT id FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (PARTITION BY "gameId", "transactionId" ORDER BY "timestamp" ASC) as rn
    FROM "revenue"
    WHERE "transactionId" IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Step 2: Delete duplicate adImpressionIds (keep oldest, delete newer copies)
DELETE FROM "revenue"
WHERE id IN (
  SELECT id FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (PARTITION BY "gameId", "adImpressionId" ORDER BY "timestamp" ASC) as rn
    FROM "revenue"
    WHERE "adImpressionId" IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Step 3: Create unique constraint for transactionId
CREATE UNIQUE INDEX "unique_transaction_id" ON "revenue"("gameId", "transactionId") WHERE "transactionId" IS NOT NULL;

-- Step 4: Create unique constraint for adImpressionId
CREATE UNIQUE INDEX "unique_ad_impression_id" ON "revenue"("gameId", "adImpressionId") WHERE "adImpressionId" IS NOT NULL;

