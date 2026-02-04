-- Add revenueUSD column for multi-currency support
-- This column stores the USD-converted value for consistent aggregation across different currencies

-- Step 1: Add the revenueUSD column as nullable (to allow existing rows)
ALTER TABLE "revenue" ADD COLUMN "revenueUSD" DOUBLE PRECISION;

-- Step 2: Populate revenueUSD with existing revenue values (assuming all existing data is in USD)
-- This ensures backward compatibility for existing data
UPDATE "revenue" SET "revenueUSD" = "revenue" WHERE "revenueUSD" IS NULL;

-- Step 3: Make the column NOT NULL after populating (for data integrity)
ALTER TABLE "revenue" ALTER COLUMN "revenueUSD" SET NOT NULL;

-- Step 4: Set default value for future inserts (in case of edge cases)
ALTER TABLE "revenue" ALTER COLUMN "revenueUSD" SET DEFAULT 0;

-- Step 5: Add index for revenueUSD to optimize aggregation queries
CREATE INDEX IF NOT EXISTS "revenue_revenueUSD_idx" ON "revenue"("revenueUSD");

