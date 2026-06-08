-- AlterEnum
ALTER TYPE "Role" RENAME VALUE 'RECEPCIONISTA' TO 'VENTAS';

-- AlterTable
ALTER TABLE "products" ADD COLUMN "isCommissionable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "commissions" ALTER COLUMN "ticketId" DROP NOT NULL;
