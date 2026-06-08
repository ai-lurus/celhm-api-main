import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthUser } from '../auth/auth.service';
import { CreateCashCutDto } from './dto/create-cash-cut.dto';
import { UpdateCashCutDto } from './dto/update-cash-cut.dto';
import { OpenCashCutDto } from './dto/open-cash-cut.dto';
import { PaymentMethod, SaleStatus, CashCutStatus, Prisma } from '@prisma/client';

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
        active: true,
      },
      include: {
        cuts: {
          orderBy: { date: 'desc' },
          take: 1, // Último corte
        },
      },
    });
  }

  async deleteCashRegister(id: number, organizationId: number) {
    const register = await this.prisma.cashRegister.findFirst({
      where: { id, branch: { organizationId } },
      include: {
        _count: {
          select: { cuts: true, sales: true }
        }
      }
    });

    if (!register) {
      throw new Error('Caja no encontrada');
    }

    if (register._count.cuts > 0 || register._count.sales > 0) {
      return this.prisma.cashRegister.update({
        where: { id },
        data: { active: false },
      });
    }

    return this.prisma.cashRegister.delete({
      where: { id },
    });
  }

  async openCashSession(dto: OpenCashCutDto, user: AuthUser) {
    const existingOpen = await this.prisma.cashCut.findFirst({
      where: {
        cashRegisterId: dto.cashRegisterId,
        status: CashCutStatus.OPEN,
      },
    });

    if (existingOpen) {
      throw new Error('This register already has an open session. Please close it first.');
    }

    return this.prisma.cashCut.create({
      data: {
        branchId: dto.branchId,
        cashRegisterId: dto.cashRegisterId,
        date: new Date(dto.date),
        initialAmount: dto.initialAmount,
        userId: user.id,
        status: CashCutStatus.OPEN,
        notes: dto.notes,
        totalIncome: 0,
        finalAmount: 0,
      } as Prisma.CashCutUncheckedCreateInput,
      include: {
        user: { select: { name: true, email: true } },
        cashRegister: true,
        branch: { select: { name: true, code: true } },
      },
    });
  }

  async createCashCut(createCashCutDto: CreateCashCutDto, user: AuthUser) {
    const openSession = await this.prisma.cashCut.findFirst({
      where: {
        cashRegisterId: createCashCutDto.cashRegisterId,
        status: CashCutStatus.OPEN,
      },
    });

    if (!openSession) {
      throw new Error('There is no open session for this cash register.');
    }

    const sales = await this.prisma.sale.findMany({
      where: {
        cashCutId: openSession.id,
        status: SaleStatus.PAGADO,
      },
      include: {
        payments: true,
      },
    });

    let salesCash = 0;
    let salesDebitCard = 0;
    let salesCreditCard = 0;
    let salesTransfer = 0;
    let advances = 0;
    let totalReturns = 0;

    for (const sale of sales) {
      for (const payment of sale.payments) {
        // amount is negative for return payments, positive for normal sales
        const amount = Number(payment.amount);
        switch (payment.method) {
          case PaymentMethod.EFECTIVO:
            salesCash += amount; // subtracts if return (negative amount)
            if (sale.ticketId && !sale.isReturn) {
              advances += amount;
            }
            break;
          case PaymentMethod.TARJETA_DEBITO:
            salesDebitCard += amount;
            break;
          case PaymentMethod.TARJETA_CREDITO:
            salesCreditCard += amount;
            break;
          case PaymentMethod.TRANSFERENCIA:
            salesTransfer += amount;
            break;
        }
        if (sale.isReturn) {
          totalReturns += amount; // already negative, accumulates for reference
        }
      }
    }

    const initialAmount = Number(openSession.initialAmount);

    // Total income from all payment methods (auto-calculated from sales)
    const totalIncome = salesCash + salesDebitCard + salesCreditCard + salesTransfer;

    // Expected cash = initial fund + all cash sales
    const expectedAmount = initialAmount + salesCash;

    // Only the physical cash count is declared by the user
    const declaredAmount = Number(createCashCutDto.declaredAmount);
    const difference = declaredAmount - expectedAmount;
    const finalAmount = declaredAmount;

    return this.prisma.cashCut.update({
      where: { id: openSession.id },
      data: {
        status: CashCutStatus.CLOSED,
        closedAt: new Date(),
        salesCash,
        salesDebitCard,
        salesCreditCard,
        salesTransfer,
        advances,
        adjustments: 0,
        declaredAmount,
        // Card/transfer declared = system calculated (no manual input)
        declaredDebitCard: salesDebitCard,
        declaredCreditCard: salesCreditCard,
        declaredTransfer: salesTransfer,
        expectedAmount,
        difference,
        totalIncome,
        finalAmount,
        denominations: createCashCutDto.denominations || undefined,
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
      this.prisma.cashCut.count({ where }),
    ]);

    const enhancedCuts = cuts.map((cut) => {
      let enhancedCut = { ...cut } as any;

      if (cut.status === CashCutStatus.OPEN && cut.sales) {
        let salesCash = 0;
        let salesDebitCard = 0;
        let salesCreditCard = 0;
        let salesTransfer = 0;

        for (const sale of cut.sales) {
          if (sale.status === SaleStatus.PAGADO) {
            for (const payment of sale.payments) {
              const amount = Number(payment.amount);
              switch (payment.method) {
                case PaymentMethod.EFECTIVO:
                  salesCash += amount;
                  break;
                case PaymentMethod.TARJETA_DEBITO:
                  salesDebitCard += amount;
                  break;
                case PaymentMethod.TARJETA_CREDITO:
                  salesCreditCard += amount;
                  break;
                case PaymentMethod.TRANSFERENCIA:
                  salesTransfer += amount;
                  break;
              }
            }
          }
        }
        enhancedCut.salesCash = salesCash;
        enhancedCut.salesDebitCard = salesDebitCard;
        enhancedCut.salesCreditCard = salesCreditCard;
        enhancedCut.salesTransfer = salesTransfer;
        enhancedCut.totalIncome = salesCash + salesDebitCard + salesCreditCard + salesTransfer;
      }
      
      // Remove sales array so we don't send massive data in the list view
      delete enhancedCut.sales;
      return enhancedCut;
    });

    return {
      data: enhancedCuts,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getCashCutById(id: number, organizationId: number) {
    const cut = await this.prisma.cashCut.findFirst({
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
        sales: {
          include: {
            payments: true,
            customer: true,
            lines: {
               include: { variant: { include: { product: true } } }
            }
          }
        }
      },
    });

    if (cut && cut.status === CashCutStatus.OPEN && cut.sales) {
      let salesCash = 0;
      let salesDebitCard = 0;
      let salesCreditCard = 0;
      let salesTransfer = 0;

      for (const sale of cut.sales) {
        if (sale.status === SaleStatus.PAGADO) {
          for (const payment of sale.payments) {
            const amount = Number(payment.amount);
            switch (payment.method) {
              case PaymentMethod.EFECTIVO:
                salesCash += amount;
                break;
              case PaymentMethod.TARJETA_DEBITO:
                salesDebitCard += amount;
                break;
              case PaymentMethod.TARJETA_CREDITO:
                salesCreditCard += amount;
                break;
              case PaymentMethod.TRANSFERENCIA:
                salesTransfer += amount;
                break;
            }
          }
        }
      }

      return {
        ...cut,
        salesCash,
        salesDebitCard,
        salesCreditCard,
        salesTransfer,
        totalIncome: salesCash + salesDebitCard + salesCreditCard + salesTransfer,
      };
    }

    return cut;
  }

  async updateCashCut(id: number, updateDto: UpdateCashCutDto, organizationId: number) {
    const cut = await this.prisma.cashCut.findFirst({
      where: {
        id,
        branch: { organizationId },
        status: CashCutStatus.CLOSED,
      },
    });

    if (!cut) {
      throw new Error('Cash cut not found or is not closed.');
    }

    const expectedAmount = Number(cut.expectedAmount);
    const newDeclaredAmount = updateDto.declaredAmount !== undefined ? Number(updateDto.declaredAmount) : Number(cut.declaredAmount);
    const newDifference = newDeclaredAmount - expectedAmount;

    return this.prisma.cashCut.update({
      where: { id },
      data: {
        declaredAmount: newDeclaredAmount,
        finalAmount: newDeclaredAmount,
        difference: newDifference,
        denominations: updateDto.denominations !== undefined ? (Object.keys(updateDto.denominations).length > 0 ? updateDto.denominations : Prisma.JsonNull) : cut.denominations,
        notes: updateDto.notes !== undefined ? updateDto.notes : cut.notes,
      },
      include: {
        user: { select: { name: true, email: true } },
        cashRegister: true,
        branch: { select: { name: true, code: true } },
      },
    });
  }
}

