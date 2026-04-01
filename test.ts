import { PrismaClient, CashCutStatus } from '@prisma/client';
const prisma = new PrismaClient();
prisma.cashCut.create({
  data: {
    branchId: 1,
    cashRegisterId: 1,
    date: new Date(),
    status: CashCutStatus.OPEN,
    initialAmount: 100,
    userId: 1,
    notes: null,
    totalIncome: 0,
    finalAmount: 0,
  }
});
