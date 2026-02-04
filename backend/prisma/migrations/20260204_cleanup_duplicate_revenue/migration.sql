-- Migration: Clean up duplicate revenue records before adding unique constraints
-- This removes duplicate transactionIds and adImpressionIds, keeping the oldest record

-- Step 1: Delete duplicate transactionIds (keep oldest, delete the rest)
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

-- Step 2: Delete duplicate adImpressionIds (keep oldest, delete the rest)
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

