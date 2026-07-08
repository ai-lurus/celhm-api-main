-- AlterTable
ALTER TABLE "cash_cuts" ADD COLUMN IF NOT EXISTS "denominations" JSONB;
