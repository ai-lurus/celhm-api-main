import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { FoliosService } from '../folios/folios.service';
import { AuthUser } from '../auth/auth.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { PaymentMethod, SaleStatus, MovementType } from '@prisma/client';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private prisma: PrismaService,
    private foliosService: FoliosService,
  ) { }

  async create(createSaleDto: CreateSaleDto, user: AuthUser) {
    // PgBouncer transaction mode: Sequential operations instead of interactive transaction
    // Generate folio first (handles its own atomicity)
    const folio = await this.foliosService.next('VTA', createSaleDto.branchId);

    // Calculate totals
    const subtotal = createSaleDto.lines.reduce(
      (sum, line) => sum + (Number(line.unitPrice) * line.qty - Number(line.discount || 0)),
      0,
    );
    const discount = Number(createSaleDto.discount || 0);
    const total = subtotal - discount;

    let cashCutId: number | undefined;

    if (createSaleDto.cashRegisterId) {
      let openCut = await this.prisma.cashCut.findFirst({
        where: {
          cashRegisterId: createSaleDto.cashRegisterId,
          status: 'OPEN',
        },
      });

      if (!openCut) {
        openCut = await this.prisma.cashCut.create({
          data: {
            branchId: createSaleDto.branchId,
            cashRegisterId: createSaleDto.cashRegisterId,
            date: new Date(),
            initialAmount: 0,
            userId: user.id,
            status: 'OPEN',
            notes: 'Auto-opened by sale',
            totalIncome: 0,
            finalAmount: 0,
          } as import('@prisma/client').Prisma.CashCutUncheckedCreateInput,
        });
      }

      cashCutId = openCut.id;
    }

    // Create sale with nested lines (atomic at DB level)
    const sale = await this.prisma.sale.create({
      data: {
        branchId: createSaleDto.branchId,
        folio,
        customerId: createSaleDto.customerId,
        ticketId: createSaleDto.ticketId,
        status: SaleStatus.PENDIENTE,
        subtotal,
        discount,
        total,
        userId: user.id,
        cashRegisterId: createSaleDto.cashRegisterId,
        cashCutId,
        lines: {
          create: createSaleDto.lines.map((line) => ({
            variantId: line.variantId,
            description: line.description,
            qty: line.qty,
            unitPrice: line.unitPrice,
            discount: line.discount || 0,
            total: Number(line.unitPrice) * line.qty - Number(line.discount || 0),
          })),
        },
      },
      include: {
        lines: {
          include: {
            variant: {
              include: {
                product: true,
              },
            },
          },
        },
        customer: true,
        ticket: true,
      },
    });

    // If payments are provided, process them
    if (createSaleDto.payments && createSaleDto.payments.length > 0) {
      let totalPaymentAmount = 0;
      let totalEfectivoAmount = 0;

      for (const payment of createSaleDto.payments) {
        const paymentAmount = Number(payment.amount);
        if (paymentAmount > 0) {
          totalPaymentAmount += paymentAmount;
          await this.processPayment(sale.id, payment, user, null);
          if (payment.method === PaymentMethod.EFECTIVO) {
            totalEfectivoAmount += paymentAmount;
          }
        }
      }

      // Mark as paid (either real payment or covered by advance)
      await this.prisma.sale.update({
        where: { id: sale.id },
        data: { status: SaleStatus.PAGADO },
      });

      // If sale is for a ticket, update ticket advance payment
      if (createSaleDto.ticketId && totalEfectivoAmount > 0) {
        await this.prisma.ticket.update({
          where: { id: createSaleDto.ticketId },
          data: {
            advancePayment: {
              increment: totalEfectivoAmount,
            },
          },
        });
      }

      // If variant is provided, create stock movements and update stock
      for (const line of createSaleDto.lines) {
        if (line.variantId) {
          // Use batch transaction for movement and stock update
          await this.prisma.$transaction([
            this.prisma.movement.create({
              data: {
                branchId: createSaleDto.branchId,
                variantId: line.variantId,
                type: MovementType.VTA,
                qty: line.qty,
                reason: `Venta ${folio}`,
                folio,
                userId: user.id,
              },
            }),
            this.prisma.stock.updateMany({
              where: {
                branchId: createSaleDto.branchId,
                variantId: line.variantId,
              },
              data: {
                qty: { decrement: line.qty },
              },
            }),
          ]);
        }
      }
    }

    return this.findOne(sale.id, user.organizationId);
  }

  async findAll(organizationId: number, filters?: {
    branchId?: number;
    customerId?: number;
    ticketId?: number;
    status?: SaleStatus;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
  }) {
    try {
      const page = filters?.page || 1;
      const pageSize = filters?.pageSize || 50;
      const skip = (page - 1) * pageSize;

      const where: any = {
        branch: { organizationId },
      };

      if (filters?.branchId) {
        where.branchId = filters.branchId;
      }

      if (filters?.customerId) {
        where.customerId = filters.customerId;
      }

      if (filters?.ticketId) {
        where.ticketId = filters.ticketId;
      }

      if (filters?.status) {
        where.status = filters.status;
      }

      if (filters?.startDate || filters?.endDate) {
        where.createdAt = {};
        if (filters.startDate) {
          where.createdAt.gte = filters.startDate;
        }
        if (filters.endDate) {
          where.createdAt.lte = filters.endDate;
        }
      }

      const [sales, total] = await Promise.all([
        this.prisma.sale.findMany({
          where,
          include: {
            lines: {
              include: {
                variant: {
                  include: {
                    product: true,
                  },
                },
              },
            },
            payments: {
              include: {
                user: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
            customer: true,
            ticket: {
              select: {
                id: true,
                folio: true,
                state: true,
              },
            },
            user: {
              select: {
                name: true,
                email: true,
              },
            },
            cashRegister: {
              select: {
                name: true,
                code: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        this.prisma.sale.count({ where }),
      ]);

      const salesWithPaidAmount = sales.map((sale) => {
        const paidAmount = sale.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
        return { ...sale, paidAmount };
      });

      return {
        data: salesWithPaidAmount,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    } catch (error) {
      this.logger.error('Error getting sales:', error);
      throw error;
    }
  }

  async findOne(id: number, organizationId: number) {
    const sale = await this.prisma.sale.findFirst({
      where: {
        id,
        branch: { organizationId },
      },
      include: {
        lines: {
          include: {
            variant: {
              include: {
                product: true,
              },
            },
          },
        },
        payments: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        customer: true,
        ticket: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        branch: {
          select: {
            name: true,
            code: true,
          },
        },
        cashRegister: {
          select: {
            name: true,
            code: true,
          },
        },
      },
    });

    if (!sale) return null;

    const paidAmount = sale.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

    return { ...sale, paidAmount };
  }

  async addPayment(saleId: number, paymentDto: { amount: number; method: PaymentMethod; reference?: string }, user: AuthUser) {
    // PgBouncer transaction mode: Read first, validate, then batch transaction
    const sale = await this.prisma.sale.findFirst({
      where: {
        id: saleId,
        branch: { organizationId: user.organizationId },
      },
      include: {
        payments: true,
      },
    });

    if (!sale) {
      throw new Error('Sale not found');
    }

    const totalPaid = sale.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const remaining = Number(sale.total) - totalPaid;

    if (paymentDto.amount > remaining) {
      throw new Error('Payment amount exceeds remaining balance');
    }

    const newTotalPaid = totalPaid + Number(paymentDto.amount);
    const newStatus = newTotalPaid >= Number(sale.total) ? SaleStatus.PAGADO : SaleStatus.PENDIENTE;

    // Use batch transaction for atomic payment creation and sale status update
    const [payment] = await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          saleId,
          amount: paymentDto.amount,
          method: paymentDto.method,
          reference: paymentDto.reference,
          userId: user.id,
        },
      }),
      this.prisma.sale.update({
        where: { id: saleId },
        data: { status: newStatus },
      }),
    ]);

    return payment;
  }

  // PgBouncer compatible: No transaction context needed
  private async processPayment(saleId: number, payment: { amount: number; method: PaymentMethod; reference?: string }, user: AuthUser, tx: any) {
    return this.prisma.payment.create({
      data: {
        saleId,
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference,
        userId: user.id,
      },
    });
  }
}
