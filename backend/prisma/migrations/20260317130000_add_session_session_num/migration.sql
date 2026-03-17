-- AlterTable: add sessionNum column to sessions
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "sessionNum" INTEGER;
