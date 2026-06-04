-- AlterTable
ALTER TABLE "products" ADD COLUMN "tracksInventory" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "products" ADD COLUMN "isPriceEditable" BOOLEAN NOT NULL DEFAULT false;
