import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  console.log("Testing Create Customer with phoneAlt...");
  try {
    const customer = await prisma.customer.create({
      data: {
        name: "Test Customer",
        phone: "1234567890",
        phoneAlt: "0987654321",
        organizationId: 1,
      }
    });
    console.log("Create Customer Success:", customer.id);
    // Cleanup
    await prisma.customer.delete({ where: { id: customer.id } });
    console.log("Cleanup Success");
  } catch(e) {
    console.error("Create Customer Error:", e);
  }
  await prisma.$disconnect();
}
main()
