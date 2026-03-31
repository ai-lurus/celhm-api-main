import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  try {
    const res = await prisma.cashRegister.findMany({
      where: { branchId: 1 },
      include: { cuts: { take: 1 } }
    })
    console.log("Success")
  } catch(e) {
    console.error(e)
  } finally {
    await prisma.$disconnect()
  }
}
main()
