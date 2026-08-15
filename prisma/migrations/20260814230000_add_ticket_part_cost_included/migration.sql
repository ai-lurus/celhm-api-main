-- AlterTable
ALTER TABLE "ticket_parts" ADD COLUMN     "costIncluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unitCost" DECIMAL(10,2);
