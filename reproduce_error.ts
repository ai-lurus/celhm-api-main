import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  console.log("Testing Customers...");
  try {
    const customers = await prisma.customer.findMany({
      where: { organizationId: 1 },
      include: {
        tickets: {
          select: {
            id: true,
            folio: true,
            state: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        sales: {
          select: {
            id: true,
            folio: true,
            total: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
      orderBy: { name: 'asc' },
      take: 50,
    });
    console.log("Customers Success");
  } catch(e) {
    console.error("Customers Error:", e);
  }

  console.log("\nTesting Device Models...");
  try {
    const models = await prisma.deviceModel.findMany({
      include: {
        brand: { select: { id: true, name: true } },
      },
      orderBy: [{ brand: { name: 'asc' } }, { name: 'asc' }],
    });
    console.log("Device Models Success");
  } catch(e) {
    console.error("Device Models Error:", e);
  }

  await prisma.$disconnect();
}
main()
