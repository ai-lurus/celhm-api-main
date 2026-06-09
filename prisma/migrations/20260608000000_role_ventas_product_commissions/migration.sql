-- AlterEnum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'VENTAS';

-- AlterTable
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "isCommissionable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "commissions" ALTER COLUMN "ticketId" DROP NOT NULL;
