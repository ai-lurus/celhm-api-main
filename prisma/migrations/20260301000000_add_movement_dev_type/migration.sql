-- AlterEnum: Add DEV to MovementType (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'MovementType' AND e.enumlabel = 'DEV'
  ) THEN
    ALTER TYPE "MovementType" ADD VALUE 'DEV';
  END IF;
END $$;
