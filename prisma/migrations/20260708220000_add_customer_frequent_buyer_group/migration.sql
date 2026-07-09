-- Per-organization catalog of customer groups (e.g. "General", "Cliente Frecuente"),
-- replacing free-text group labels so admins can manage the list from the app.
CREATE TABLE "customer_groups" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isFrequentBuyerTarget" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_groups_organizationId_name_key" ON "customer_groups"("organizationId", "name");
CREATE INDEX "customer_groups_organizationId_idx" ON "customer_groups"("organizationId");

ALTER TABLE "customer_groups" ADD CONSTRAINT "customer_groups_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the two system groups every organization needs: the default landing
-- group for new customers, and the target group the frequent-buyer
-- promotion (CustomersService.registerPurchase) moves customers into. These
-- are looked up by flag, not by name, so admins can safely rename them later.
INSERT INTO "customer_groups" ("organizationId", "name", "isDefault", "isFrequentBuyerTarget", "updatedAt")
SELECT "id", 'General', true, false, CURRENT_TIMESTAMP FROM "organizations";

INSERT INTO "customer_groups" ("organizationId", "name", "isDefault", "isFrequentBuyerTarget", "updatedAt")
SELECT "id", 'Cliente Frecuente', false, true, CURRENT_TIMESTAMP FROM "organizations";

-- Track purchases and link each customer to a group of their organization's catalog.
ALTER TABLE "customers" ADD COLUMN "purchaseCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "customers" ADD COLUMN "groupId" INTEGER;

UPDATE "customers" c
SET "groupId" = dg."id"
FROM "customer_groups" dg
WHERE dg."organizationId" = c."organizationId" AND dg."isDefault" = true;

ALTER TABLE "customers" ALTER COLUMN "groupId" SET NOT NULL;
CREATE INDEX "customers_groupId_idx" ON "customers"("groupId");
ALTER TABLE "customers" ADD CONSTRAINT "customers_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "customer_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Configurable per-organization threshold (default 3 purchases) used to
-- decide when a customer is promoted to the frequent-buyer group.
ALTER TABLE "organizations" ADD COLUMN "frequentBuyerThreshold" INTEGER NOT NULL DEFAULT 3;
