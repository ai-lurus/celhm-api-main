-- CreateEnum
CREATE TYPE "CommissionBasis" AS ENUM ('SALE_TOTAL', 'PROFIT');

-- CreateEnum
CREATE TYPE "CommissionScope" AS ENUM ('GENERAL', 'PRODUCT_CATEGORY', 'CUSTOMER_GROUP');

-- CreateEnum
CREATE TYPE "CommissionCalcMethod" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateTable
CREATE TABLE "commission_plans" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER,
    "membershipId" INTEGER,
    "basis" "CommissionBasis" NOT NULL,
    "scopeType" "CommissionScope" NOT NULL,
    "scopeValue" TEXT,
    "calcMethod" "CommissionCalcMethod" NOT NULL,
    "value" NUMERIC(10,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commission_plans_organizationId_name_key" ON "commission_plans"("organizationId", "name");

-- CreateIndex
CREATE INDEX "commission_rules_planId_idx" ON "commission_rules"("planId");

-- CreateIndex
CREATE INDEX "commission_rules_membershipId_idx" ON "commission_rules"("membershipId");

-- AddForeignKey
ALTER TABLE "commission_plans" ADD CONSTRAINT "commission_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_planId_fkey" FOREIGN KEY ("planId") REFERENCES "commission_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "org_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddColumn org_memberships
ALTER TABLE "org_memberships" ADD COLUMN "commissionPlanId" INTEGER;

-- AddForeignKey org_memberships
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_commissionPlanId_fkey" FOREIGN KEY ("commissionPlanId") REFERENCES "commission_plans"("id") ON UPDATE CASCADE;

-- AddColumn commissions
ALTER TABLE "commissions" ADD COLUMN "saleLineId" INTEGER;
ALTER TABLE "commissions" ADD COLUMN "ruleId" INTEGER;
ALTER TABLE "commissions" ADD COLUMN "basis" "CommissionBasis";
ALTER TABLE "commissions" ADD COLUMN "scopeLabel" TEXT;
ALTER TABLE "commissions" ADD COLUMN "isEstimated" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey commissions
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "sale_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "commission_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropIndex and CreateIndex on commissions
DROP INDEX IF EXISTS "commissions_saleId_ticketId_userId_key";
CREATE UNIQUE INDEX "commissions_saleLineId_userId_key" ON "commissions"("saleLineId", "userId");
