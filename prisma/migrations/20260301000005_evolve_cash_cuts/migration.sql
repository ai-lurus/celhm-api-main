-- CreateEnum: CashCutStatus
CREATE TYPE "CashCutStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable: Evolve cash_cuts - split salesCard into credit/debit, add status and timestamps
-- Add new columns
ALTER TABLE "cash_cuts" ADD COLUMN "status" "CashCutStatus" NOT NULL DEFAULT 'CLOSED';
ALTER TABLE "cash_cuts" ADD COLUMN "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "cash_cuts" ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "cash_cuts" ADD COLUMN "salesCreditCard" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "cash_cuts" ADD COLUMN "salesDebitCard" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "cash_cuts" ADD COLUMN "declaredCreditCard" DECIMAL(10,2) DEFAULT 0;
ALTER TABLE "cash_cuts" ADD COLUMN "declaredDebitCard" DECIMAL(10,2) DEFAULT 0;
ALTER TABLE "cash_cuts" ADD COLUMN "declaredTransfer" DECIMAL(10,2) DEFAULT 0;

-- Migrate existing salesCard data to salesDebitCard
UPDATE "cash_cuts" SET "salesDebitCard" = "salesCard" WHERE "salesCard" != 0;

-- Drop old column
ALTER TABLE "cash_cuts" DROP COLUMN "salesCard";

-- Drop unique constraint (cashRegisterId, date) - no longer needed with status-based model
DROP INDEX IF EXISTS "cash_cuts_cashRegisterId_date_key";

-- Add cashCutId to sales
ALTER TABLE "sales" ADD COLUMN "cashCutId" INTEGER;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashCutId_fkey" FOREIGN KEY ("cashCutId") REFERENCES "cash_cuts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "sales_cashCutId_idx" ON "sales"("cashCutId");
