-- AlterTable: Add return fields to sales (idempotent)
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "isReturn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "returnOfSaleId" INTEGER;

-- AddForeignKey (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_returnOfSaleId_fkey'
  ) THEN
    ALTER TABLE "sales" ADD CONSTRAINT "sales_returnOfSaleId_fkey" FOREIGN KEY ("returnOfSaleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "sales_returnOfSaleId_idx" ON "sales"("returnOfSaleId");

-- Add deviceType to device_models if not exists
ALTER TABLE "device_models" ADD COLUMN IF NOT EXISTS "deviceType" TEXT;
