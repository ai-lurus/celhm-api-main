-- Add commissionRate to org_memberships
ALTER TABLE "org_memberships" ADD COLUMN IF NOT EXISTS "commissionRate" DECIMAL(5, 2);

-- Create CommissionStatus enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommissionStatus') THEN
        CREATE TYPE "CommissionStatus" AS ENUM ('PENDIENTE', 'PAGADA', 'CANCELADA');
    END IF;
END
$$;

-- Create commissions table
CREATE TABLE IF NOT EXISTS "commissions" (
    "id" SERIAL NOT NULL,
    "saleId" INTEGER NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "amount" DECIMAL(10, 2) NOT NULL,
    "rate" DECIMAL(5, 2) NOT NULL,
    "saleTotal" DECIMAL(10, 2) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDIENTE',
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- Create unique index on saleId + userId
CREATE UNIQUE INDEX IF NOT EXISTS "commissions_saleId_userId_key" ON "commissions"("saleId", "userId");

-- Create indexes
CREATE INDEX IF NOT EXISTS "commissions_userId_createdAt_idx" ON "commissions"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "commissions_status_idx" ON "commissions"("status");

-- Add foreign keys
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'commissions_saleId_fkey'
    ) THEN
        ALTER TABLE "commissions" ADD CONSTRAINT "commissions_saleId_fkey"
            FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'commissions_ticketId_fkey'
    ) THEN
        ALTER TABLE "commissions" ADD CONSTRAINT "commissions_ticketId_fkey"
            FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'commissions_userId_fkey'
    ) THEN
        ALTER TABLE "commissions" ADD CONSTRAINT "commissions_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
