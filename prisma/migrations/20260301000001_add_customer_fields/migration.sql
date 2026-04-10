-- AlterTable: Add/normalize lastName and rfc on customers

-- Handle lastName: rename last_name if exists, otherwise add new column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'last_name'
  ) THEN
    ALTER TABLE "customers" RENAME COLUMN "last_name" TO "lastName";
    ALTER TABLE "customers" ALTER COLUMN "lastName" TYPE TEXT USING "lastName"::TEXT;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'lastName'
  ) THEN
    ALTER TABLE "customers" ADD COLUMN "lastName" TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

-- Add rfc if not exists, normalize type to TEXT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'rfc'
  ) THEN
    ALTER TABLE "customers" ADD COLUMN "rfc" TEXT;
  ELSE
    ALTER TABLE "customers" ALTER COLUMN "rfc" TYPE TEXT USING "rfc"::TEXT;
  END IF;
END $$;

-- Drop phoneAlt if exists (not in target schema)
ALTER TABLE "customers" DROP COLUMN IF EXISTS "phoneAlt";
