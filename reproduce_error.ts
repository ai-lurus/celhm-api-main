import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const branchId = 1;
  const organizationId = 1; // Assuming 1
  const page = 1;
  const pageSize = 20;

  const skip = (page - 1) * pageSize;

  const where: any = {
    branchId,
    branch: { organizationId },
  };

  try {
    const [cuts, total] = await Promise.all([
      prisma.cashCut.findMany({
        where,
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
          cashRegister: true,
          branch: {
            select: {
              name: true,
              code: true,
            },
          },
          sales: {
            include: {
              payments: true,
            },
          },
        },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      prisma.cashCut.count({ where }),
    ]);
    console.log("Success cuts");
  } catch(e) {
    console.error("Error cuts:", e);
  }

  try {
    const branchId = 1;
    const registerCode = undefined;
    const count = await prisma.cashRegister.count({
        where: { branchId },
    });
    console.log("count", count);
  } catch(e) {
    console.error("Error register:", e);
  }
}
main().finally(() => prisma.$disconnect());
