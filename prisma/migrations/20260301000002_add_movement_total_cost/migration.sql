-- AlterTable: Add totalCost to movements
ALTER TABLE "movements" ADD COLUMN IF NOT EXISTS "totalCost" DECIMAL(10,2);
