-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDIENTE', 'PAGADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "org_memberships" ADD COLUMN     "commissionRate" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "sale_lines" ADD COLUMN     "ticketId" INTEGER;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "assignedUserId" INTEGER;

-- CreateTable
CREATE TABLE "commissions" (
    "id" SERIAL NOT NULL,
    "saleId" INTEGER NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "saleTotal" DECIMAL(10,2) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDIENTE',
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commissions_userId_createdAt_idx" ON "commissions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "commissions_status_idx" ON "commissions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_saleId_ticketId_userId_key" ON "commissions"("saleId", "ticketId", "userId");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

