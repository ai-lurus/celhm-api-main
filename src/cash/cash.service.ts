import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthUser } from '../auth/auth.service';
import { CreateCashCutDto } from './dto/create-cash-cut.dto';
import { PaymentMethod, SaleStatus } from '@prisma/client';

@Injectable()
export class CashService {
  constructor(private prisma: PrismaService) { }

  async createCashRegister(branchId: number, code: string | undefined, name: string, organizationId: number) {
    let registerCode = code;

    if (!registerCode) {
      const count = await this.prisma.cashRegister.count({
        where: { branchId },
      });
      registerCode = `POS-${String(count + 1).padStart(2, '0')}`;
    }

    return this.prisma.cashRegister.create({
      data: {
        branchId,
        code: registerCode,
        name,
      },
    });
  }

  async getCashRegisters(branchId: number, organizationId: number) {
    return this.prisma.cashRegister.findMany({
      where: {
        branchId,
        branch: { organizationId },
      },
      include: {
        cuts: {
          orderBy: { date: 'desc' },
          take: 1, // Último corte
        },
      },
    });
  }

  async createCashCut(createCashCutDto: CreateCashCutDto, user: AuthUser) {
    // PgBouncer transaction mode: Read data first, then create (no interactive transaction)
    // Get date range for the day
    const date = new Date(createCashCutDto.date);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get sales for the day
    const sales = await this.prisma.sale.findMany({
      where: {
        branchId: createCashCutDto.branchId,
        cashRegisterId: createCashCutDto.cashRegisterId, // Filter by cash register
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: SaleStatus.PAGADO,
      },
      include: {
        payments: true,
      },
    });

    // Calculate totals by payment method
    let salesCash = 0;
    let salesCard = 0;
    let salesTransfer = 0;
    let advances = 0;

    for (const sale of sales) {
      for (const payment of sale.payments) {
        const amount = Number(payment.amount);
        switch (payment.method) {
          case PaymentMethod.EFECTIVO:
            salesCash += amount;
            // If sale is for a ticket, count as advance
            if (sale.ticketId) {
              advances += amount;
            }
            break;
          case PaymentMethod.TARJETA:
            salesCard += amount;
            break;
          case PaymentMethod.TRANSFERENCIA:
            salesTransfer += amount;
            break;
        }
      }
    }

    // Get initial amount from last cut or provided
    const lastCut = await this.prisma.cashCut.findFirst({
      where: {
        cashRegisterId: createCashCutDto.cashRegisterId,
        date: {
          lt: date,
        },
      },
      orderBy: { date: 'desc' },
    });

    const initialAmount = createCashCutDto.initialAmount || (lastCut ? Number(lastCut.finalAmount) : 0);
    const adjustments = Number(createCashCutDto.adjustments || 0);
    const totalIncome = salesCash + salesCard + salesTransfer + advances + adjustments;

    // Calculate expected amount
    // In this logic, expected amount is initial + cash sales + cash advances + adjustments
    // We assume card and transfer go directly to bank, not to cash drawer, so they shouldn't count for expected cash in drawer
    // However, original logic was totalIncome = all sales.
    // If we want to cut CASH, we should only count CASH.
    // Let's assume for now we want to balance everything, but for the "Money in Drawer" (Corte de Caja), usually it's just cash.
    // Let's check how totalIncome was calculated: salesCash + salesCard + ...
    // If I change this, I change the meaning of the cut.
    // Let's stick to the current definition of totalIncome but refine Expected Amount for the drawer.
    // The "Final Amount" in previous logic was totalIncome + initial.
    // Logic for "Expected Cash in Drawer": Initial + Cash Sales + Cash Advances - Withdrawals(Adjustments).
    // Logic for "Expected Total": Initial + Total Income.

    // Let's calculate expected CASH based on the fact that usually adjustments are cash.
    // But verify if `salesCard` are inside the drawer? No.
    // So `expectedAmount` should probably be `initialAmount + salesCash + advances + adjustments`.
    // Wait, `advances` are already in `salesCash` if paid by cash?
    // In the loop above: `salesCash += amount`. If ticket, `advances += amount`.
    // So `salesCash` INCLUDES advances if they are cash.
    // So `advances` variable is just for reporting, not formatted addition.
    // BUT `salesCash` is calculated by summing `amount` where method is CASH.

    // So Expected Cash in Drawer = Initial + Sales(Cash) + Adjustments.
    // Expected Total = Initial + Total Income.

    // The "Corte de Caja" usually refers to the Cash Drawer.
    // So I will calculate `expectedAmount` as the expected CASH.

    // Let's look at `totalIncome` calculation again:
    // const totalIncome = salesCash + salesCard + salesTransfer + advances + adjustments;
    // `salesCash` includes the ticket payments (advances).
    // `advances` is adding them AGAIN?
    // Code:
    // case PaymentMethod.EFECTIVO:
    //   salesCash += amount;
    //   if (sale.ticketId) advances += amount;
    //   break;
    // So `salesCash` has the amount. `advances` has the amount.
    // `totalIncome = salesCash + ... + advances`.
    // THIS IS DOUBLE COUNTING ADVANCES!
    // If I have a sale of 100 cash for a ticket:
    // salesCash = 100.
    // advances = 100.
    // totalIncome = 100 + 100 = 200.
    // This looks like a BUG in the original code.

    // I will fix this double counting too.
    // And for `expectedAmount`, I will use `initialAmount + salesCash + adjustments` (Assuming adjustments are cash movements).

    const realTotalIncome = salesCash + salesCard + salesTransfer + adjustments; // Removed advances as they are part of salesCash/Card/Transfer

    // Expected Cash in Drawer
    // We assume the cut is about CASH.
    // Card and Transfer don't stay in the drawer.
    // So `expectedAmount` for the purpose of "Difference" (usually missing cash) should be:
    // initial + salesCash + adjustments.

    const expectedAmount = initialAmount + salesCash + adjustments;
    const declaredAmount = Number(createCashCutDto.declaredAmount);
    const difference = declaredAmount - expectedAmount;
    const finalAmount = declaredAmount; // The next day starts with what's actually there.

    // Create or update cash cut (single operation - no transaction needed)
    return this.prisma.cashCut.upsert({
      where: {
        cashRegisterId_date: {
          cashRegisterId: createCashCutDto.cashRegisterId,
          date,
        },
      },
      update: {
        initialAmount,
        salesCash,
        salesCard,
        salesTransfer,
        advances, // Keep recording it for info
        adjustments,
        declaredAmount,
        expectedAmount,
        difference,
        totalIncome: realTotalIncome,
        finalAmount,
        notes: createCashCutDto.notes,
        userId: user.id,
      },
      create: {
        cashRegisterId: createCashCutDto.cashRegisterId,
        branchId: createCashCutDto.branchId,
        date,
        initialAmount,
        salesCash,
        salesCard,
        salesTransfer,
        advances, // Keep recording it for info
        adjustments,
        declaredAmount,
        expectedAmount,
        difference,
        totalIncome: realTotalIncome,
        finalAmount,
        notes: createCashCutDto.notes,
        userId: user.id,
      },
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
      },
    });
  }

  async getCashCuts(branchId: number, organizationId: number, filters?: {
    cashRegisterId?: number;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where: any = {
      branchId,
      branch: { organizationId },
    };

    if (filters?.cashRegisterId) {
      where.cashRegisterId = filters.cashRegisterId;
    }

    if (filters?.startDate || filters?.endDate) {
      where.date = {};
      if (filters.startDate) {
        where.date.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.date.lte = filters.endDate;
      }
    }

    const [cuts, total] = await Promise.all([
      this.prisma.cashCut.findMany({
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
        },
        orderBy: { date: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.cashCut.count({ where }),
    ]);

    return {
      data: cuts,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getCashCutById(id: number, organizationId: number) {
    return this.prisma.cashCut.findFirst({
      where: {
        id,
        branch: { organizationId },
      },
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
      },
    });
  }
}

