import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { FoliosService } from '../folios/folios.service';
import { CommissionsService } from '../commissions/commissions.service';
import { AuthUser } from '../auth/auth.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { PaymentMethod, SaleStatus, MovementType } from '@prisma/client';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private prisma: PrismaService,
    private foliosService: FoliosService,
    private commissionsService: CommissionsService,
  ) { }

  async create(createSaleDto: CreateSaleDto, user: AuthUser) {
    // PgBouncer transaction mode: Sequential operations instead of interactive transaction
    // Generate folio first (handles its own atomicity)
    const folio = await this.foliosService.next('VTA', createSaleDto.branchId);

    // Fetch branch to get organization's vatRate
    const branch = await this.prisma.branch.findUnique({
      where: { id: createSaleDto.branchId },
      include: { organization: true },
    });
    const vatRate = Number(branch?.organization?.vatRate || 0.16);
    const rate = vatRate > 1 ? vatRate / 100 : vatRate;

    // Calculate totals
    const sumLines = createSaleDto.lines.reduce(
      (sum, line) => sum + (Number(line.unitPrice) * line.qty - Number(line.discount || 0)),
      0,
    );
    const discount = Number(createSaleDto.discount || 0);
    const total = sumLines - discount;
    const subtotal = total / (1 + rate);

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
            ticketId: line.ticketId,
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

      // Create commissions for each ticket line
      const ticketCommissions = new Map<number, number>();
      let productCommissionableSubtotal = 0;

      // Collect tickets from lines
      for (const line of createSaleDto.lines) {
        if (line.ticketId) {
          const lineTotal = Number(line.unitPrice) * line.qty - Number(line.discount || 0);
          const lineSubtotal = lineTotal / (1 + rate);
          ticketCommissions.set(
            line.ticketId,
            (ticketCommissions.get(line.ticketId) || 0) + lineSubtotal,
          );
        } else if (line.variantId) {
          // Verify if product is commissionable
          const variant = await this.prisma.variant.findUnique({
            where: { id: line.variantId },
            include: { product: true },
          });
          if (variant?.product?.isCommissionable) {
            const lineTotal = Number(line.unitPrice) * line.qty - Number(line.discount || 0);
            const lineSubtotal = lineTotal / (1 + rate);
            productCommissionableSubtotal += lineSubtotal;
          }
        }
      }

      // Also consider root ticketId if not already in lines
      if (createSaleDto.ticketId && !ticketCommissions.has(createSaleDto.ticketId)) {
        ticketCommissions.set(createSaleDto.ticketId, subtotal);
      }

      // Generate commissions
      for (const [tId, tSubtotal] of ticketCommissions.entries()) {
        try {
          await this.commissionsService.createCommissionForSale(
            sale.id,
            tId,
            tSubtotal,
          );
        } catch (error) {
          this.logger.error(`Error creating commission for ticket ${tId}:`, error);
        }
      }

      // Generate product commissions for VENTAS role
      if (productCommissionableSubtotal > 0 && user.role === 'VENTAS') {
        try {
          await this.commissionsService.createCommissionForProductSale(
            sale.id,
            user.id,
            user.organizationId,
            productCommissionableSubtotal,
          );
        } catch (error) {
          this.logger.error(`Error creating product commission for sale ${sale.id}:`, error);
        }
      }

      // If variant is provided, create stock movements and update stock
      for (const line of createSaleDto.lines) {
        if (line.variantId) {
          const variant = await this.prisma.variant.findUnique({
            where: { id: line.variantId },
            include: { product: true },
          });

          if (variant?.product?.tracksInventory !== false) {
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

    // If sale becomes fully paid, generate commissions
    if (newStatus === SaleStatus.PAGADO) {
      if (sale.ticketId) {
        try {
          await this.commissionsService.createCommissionForSale(
            sale.id,
            sale.ticketId,
            Number(sale.subtotal),
          );
        } catch (error) {
          this.logger.error('Error creating commission on addPayment:', error);
        }
      }

      if (user.role === 'VENTAS') {
        const saleWithLines = await this.prisma.sale.findUnique({
          where: { id: saleId },
          include: { lines: { include: { variant: { include: { product: true } } } } },
        });

        const branch = await this.prisma.branch.findUnique({ where: { id: sale.branchId }, include: { organization: true } });
        const vatRate = Number(branch?.organization?.vatRate || 0.16);
        const rate = vatRate > 1 ? vatRate / 100 : vatRate;

        let productSubtotal = 0;
        if (saleWithLines) {
          for (const line of saleWithLines.lines) {
            if (line.variant?.product?.isCommissionable) {
              const lineTotal = Number(line.unitPrice) * line.qty - Number(line.discount || 0);
              const lineSubtotal = lineTotal / (1 + rate);
              productSubtotal += lineSubtotal;
            }
          }
        }

        if (productSubtotal > 0) {
          try {
            await this.commissionsService.createCommissionForProductSale(
              sale.id,
              user.id,
              user.organizationId,
              productSubtotal,
            );
          } catch (error) {
            this.logger.error('Error creating product commission on addPayment:', error);
          }
        }
      }
    }

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

  async createReturn(originalSaleId: number, dto: CreateReturnDto, user: AuthUser) {
    // 1. Find and validate the original sale
    const originalSale = await this.prisma.sale.findFirst({
      where: {
        id: originalSaleId,
        branch: { organizationId: user.organizationId },
      },
      include: {
        lines: {
          include: {
            variant: { include: { product: true } },
          },
        },
        payments: true,
        branch: { include: { organization: true } },
      },
    });

    if (!originalSale) {
      throw new NotFoundException('Venta original no encontrada');
    }

    if (originalSale.status !== SaleStatus.PAGADO) {
      throw new BadRequestException('Solo se pueden hacer devoluciones de ventas pagadas');
    }

    if (originalSale.isReturn) {
      throw new BadRequestException('No se puede hacer una devolución de una devolución');
    }

    // 2. Validate return lines against original sale lines
    const returnLinesData: Array<{
      variantId?: number;
      description: string;
      qty: number;
      unitPrice: number;
      lineTotal: number;
    }> = [];

    for (const returnLine of dto.lines) {
      const originalLine = originalSale.lines.find((l) => l.id === returnLine.saleLineId);
      if (!originalLine) {
        throw new BadRequestException(`Línea de venta ${returnLine.saleLineId} no encontrada en la venta original`);
      }
      if (returnLine.qty > originalLine.qty) {
        throw new BadRequestException(
          `La cantidad a devolver (${returnLine.qty}) no puede ser mayor a la cantidad comprada (${originalLine.qty}) para "${originalLine.description}"`,
        );
      }
      returnLinesData.push({
        variantId: originalLine.variantId ?? undefined,
        description: originalLine.description,
        qty: returnLine.qty,
        unitPrice: Number(originalLine.unitPrice),
        lineTotal: Number(originalLine.unitPrice) * returnLine.qty,
      });
    }

    // 3. Calculate negative totals
    const vatRate = Number(originalSale.branch?.organization?.vatRate || 0.16);
    const rate = vatRate > 1 ? vatRate / 100 : vatRate;
    const sumLines = -returnLinesData.reduce((sum, l) => sum + l.lineTotal, 0);
    const total = sumLines; // no discount applied on returns
    const subtotal = total / (1 + rate);

    // 4. Generate DEV folio
    const folio = await this.foliosService.next('DEV', originalSale.branchId);

    // 5. Find or auto-open a cash cut for this register
    let cashCutId: number | undefined;
    let openCut = await this.prisma.cashCut.findFirst({
      where: { cashRegisterId: dto.cashRegisterId, status: 'OPEN' },
    });
    if (!openCut) {
      openCut = await this.prisma.cashCut.create({
        data: {
          branchId: originalSale.branchId,
          cashRegisterId: dto.cashRegisterId,
          date: new Date(),
          initialAmount: 0,
          userId: user.id,
          status: 'OPEN',
          notes: 'Auto-opened by return',
          totalIncome: 0,
          finalAmount: 0,
        } as import('@prisma/client').Prisma.CashCutUncheckedCreateInput,
      });
    }
    cashCutId = openCut.id;

    // 6. Create the return sale (negative amounts)
    const returnSale = await this.prisma.sale.create({
      data: {
        branchId: originalSale.branchId,
        folio,
        customerId: originalSale.customerId,
        status: SaleStatus.PAGADO,
        subtotal,
        discount: 0,
        total,
        userId: user.id,
        cashRegisterId: dto.cashRegisterId,
        cashCutId,
        isReturn: true,
        returnOfSaleId: originalSaleId,
        lines: {
          create: returnLinesData.map((l) => ({
            variantId: l.variantId,
            description: l.description,
            qty: l.qty,
            unitPrice: -l.unitPrice,          // negative unit price
            discount: 0,
            total: -l.lineTotal,              // negative total
          })),
        },
      },
      include: { lines: true },
    });

    // 7. Create the refund payment (negative amount = money out)
    await this.prisma.payment.create({
      data: {
        saleId: returnSale.id,
        amount: total,   // already negative
        method: dto.refundMethod,
        reference: `Devolución de ${originalSale.folio}`,
        userId: user.id,
      },
    });

    // 8. Restore stock for variant lines
    for (const line of returnLinesData) {
      if (line.variantId) {
        const variant = originalSale.lines.find(l => l.variantId === line.variantId)?.variant;
        if (variant?.product?.tracksInventory !== false) {
          await this.prisma.$transaction([
            this.prisma.movement.create({
              data: {
                branchId: originalSale.branchId,
                variantId: line.variantId,
                type: MovementType.DEV,
                qty: line.qty,
                reason: `Devolución ${folio} — venta original ${originalSale.folio}`,
                folio,
                userId: user.id,
              },
            }),
            this.prisma.stock.updateMany({
              where: { branchId: originalSale.branchId, variantId: line.variantId },
              data: { qty: { increment: line.qty } },
            }),
          ]);
        }
      }
    }

    return this.findOne(returnSale.id, user.organizationId);
  }
}
