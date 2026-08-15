-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "skuMaskConfig" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "products" ADD COLUMN "categoryId" INTEGER;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "sku_sequences" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sku_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sku_sequences_prefix_key" ON "sku_sequences"("prefix");
