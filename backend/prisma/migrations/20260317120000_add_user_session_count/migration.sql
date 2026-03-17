-- AlterTable: add sessionCount column to users with default 0
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sessionCount" INTEGER NOT NULL DEFAULT 0;
