-- AlterEnum: Replace TARJETA with TARJETA_DEBITO and TARJETA_CREDITO
-- PostgreSQL doesn't support DROP VALUE, so we recreate the enum
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";

CREATE TYPE "PaymentMethod" AS ENUM ('EFECTIVO', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'TRANSFERENCIA', 'CHEQUE', 'OTRO');

-- Migrate: TARJETA -> TARJETA_DEBITO
ALTER TABLE "payments" ALTER COLUMN "method" TYPE "PaymentMethod"
  USING (CASE WHEN "method"::text = 'TARJETA' THEN 'TARJETA_DEBITO' ELSE "method"::text END)::"PaymentMethod";

DROP TYPE "PaymentMethod_old";
