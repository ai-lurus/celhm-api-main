import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthUser } from '../auth/auth.service';
import { CreateCashCutDto } from './dto/create-cash-cut.dto';
import { PaymentMethod, SaleStatus } from '@prisma/client';

@Injectable()
export class CashService {
  constructor(private prisma: PrismaService) {}

  async createCashRegister(branchId: number, code: string, name: string, organizationId: number) {
    return this.prisma.cashRegister.create({
      data: {
        branchId,
        code,
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
    return this.prisma.$transaction(async (tx) => {
      // Get date range for the day
      const date = new Date(createCashCutDto.date);
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Get sales for the day
      const sales = await tx.sale.findMany({
        where: {
          branchId: createCashCutDto.branchId,
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
      const lastCut = await tx.cashCut.findFirst({
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
      const finalAmount = initialAmount + totalIncome;

      // Create cash cut
      return tx.cashCut.create({
        data: {
          cashRegisterId: createCashCutDto.cashRegisterId,
          branchId: createCashCutDto.branchId,
          date,
          initialAmount,
          salesCash,
          salesCard,
          salesTransfer,
          advances,
          adjustments,
          totalIncome,
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

