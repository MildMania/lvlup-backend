-- Add revenueUSD column for multi-currency support
-- This column stores the USD-converted value for consistent aggregation across different currencies

-- Add the revenueUSD column (allow NULL initially for existing data)
ALTER TABLE "revenue" ADD COLUMN "revenueUSD" DOUBLE PRECISION;

-- Populate revenueUSD with existing revenue values (assuming all existing data is in USD)
-- This ensures backward compatibility
UPDATE "revenue" SET "revenueUSD" = "revenue" WHERE "revenueUSD" IS NULL;

-- Make the column NOT NULL after populating
ALTER TABLE "revenue" ALTER COLUMN "revenueUSD" SET NOT NULL;

-- Add index for revenueUSD to optimize aggregation queries
CREATE INDEX "revenue_revenueUSD_idx" ON "revenue"("revenueUSD");

