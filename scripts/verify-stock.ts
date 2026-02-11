
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting Stock Verification...');

    // 1. Setup: Find a branch
    const branch = await prisma.branch.findFirst();
    if (!branch) {
        console.error('No branch found. Please seed the database first.');
        return;
    }
    console.log(`Using Branch: ${branch.name} (ID: ${branch.id})`);

    try {
        // 2. Alta (Addition)
        console.log('\n--- Verifying ALTA (Addition) ---');
        const sku = `TEST-STOCK-${Date.now()}`;
        const product = await prisma.product.create({
            data: {
                name: 'Test Stock Product',
                brand: 'Test Brand',
                model: 'Test Model',
            },
        });
        console.log(`Product created: ${product.id}`);

        const variant = await prisma.variant.create({
            data: {
                productId: product.id,
                sku: sku,
                name: 'Test Variant',
                price: 100,
                purchasePrice: 50,
            },
        });
        console.log(`Variant created: ${variant.id} (SKU: ${sku})`);

        const initialQty = 10;
        const minStock = 5;
        const stock = await prisma.stock.create({
            data: {
                branchId: branch.id,
                variantId: variant.id,
                qty: initialQty,
                min: minStock,
                max: 100,
            },
        });
        console.log(`Stock created: ${stock.id} | Qty: ${stock.qty} | Min: ${stock.min}`);

        if (stock.qty === initialQty) {
            console.log('✅ ALTA Verified: Stock created with correct quantity.');
        } else {
            console.error('❌ ALTA Failed: Quantity mismatch.');
        }

        // 3. Baja (Removal / Consumption)
        console.log('\n--- Verifying BAJA (Removal) ---');
        const consumeQty = 6;
        const updatedStock = await prisma.stock.update({
            where: { id: stock.id },
            data: {
                qty: { decrement: consumeQty },
            },
        });
        console.log(`Stock updated. New Qty: ${updatedStock.qty}`);

        if (updatedStock.qty === (initialQty - consumeQty)) {
            console.log('✅ BAJA Verified: Stock decremented correctly.');
        } else {
            console.error(`❌ BAJA Failed: Expected ${initialQty - consumeQty}, got ${updatedStock.qty}`);
        }

        // 4. Notificaciones (Low Stock Alert)
        console.log('\n--- Verifying NOTIFICACIONES (Low Stock) ---');
        // We expect the stock (4) to be less than min (5)
        if (updatedStock.qty <= updatedStock.min) {
            console.log(`Current Qty (${updatedStock.qty}) is <= Min (${updatedStock.min}). Should trigger alert.`);
        } else {
            console.log(`Current Qty (${updatedStock.qty}) is > Min (${updatedStock.min}). NO alert expected (Logic check failed?).`);
        }

        // Simulate query for low stock
        const lowStockItems = await prisma.stock.findMany({
            where: {
                branchId: branch.id,
                qty: {
                    lte: prisma.stock.fields.min,
                },
                variant: {
                    sku: sku
                }
            },
            include: {
                variant: true
            }
        });

        if (lowStockItems.length > 0) {
            console.log(`✅ NOTIFICATION Verified: Item found in low stock query.`);
            console.log(`Found item: ${lowStockItems[0].variant.sku} | Qty: ${lowStockItems[0].qty} | Min: ${lowStockItems[0].min}`);
        } else {
            console.error('❌ NOTIFICATION Failed: Item NOT found in low stock query.');
        }

        // 5. Cleanup
        console.log('\n--- Cleanup ---');
        await prisma.stock.delete({ where: { id: stock.id } });
        await prisma.variant.delete({ where: { id: variant.id } });
        await prisma.product.delete({ where: { id: product.id } });
        console.log('Test data deleted.');

    } catch (error) {
        console.error('Error during verification:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
