import { PrismaClient } from '@prisma/client';
import { matchCategoryId } from '../src/catalog/utils/match-category-id.util';

const prisma = new PrismaClient();

async function main() {
  const categories = await prisma.productCategory.findMany({
    select: { id: true, name: true },
  });

  const products = await prisma.product.findMany({
    where: { categoryLegacy: { not: null }, categoryId: null },
    select: { id: true, categoryLegacy: true },
  });

  console.log(`Encontrados ${products.length} productos con categoría legacy sin migrar.`);

  const unmatched: { id: number; categoryLegacy: string | null }[] = [];
  let updated = 0;

  for (const product of products) {
    const categoryId = matchCategoryId(product.categoryLegacy, categories);
    if (categoryId === null) {
      unmatched.push(product);
      continue;
    }
    await prisma.product.update({
      where: { id: product.id },
      data: { categoryId },
    });
    updated++;
  }

  console.log(`✅ Migrados: ${updated}`);
  if (unmatched.length > 0) {
    console.log(`⚠️  Sin match (revisar manualmente, quedan con categoryId = null):`);
    for (const p of unmatched) {
      console.log(`  - Product #${p.id}: categoryLegacy="${p.categoryLegacy}"`);
    }
  }
}

main()
  .catch((error) => {
    console.error('Error en el backfill:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
