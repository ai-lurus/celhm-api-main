import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CommissionStatus } from '@prisma/client';

@Injectable()
export class CommissionsService {
  private readonly logger = new Logger(CommissionsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Creates a commission record for a lab technician when a ticket sale is paid.
   * Called from SalesService.create() when a sale with a ticketId is fully paid.
   */
  async createCommissionForSale(saleId: number, ticketId: number, saleSubtotal: number) {
    // Look up the ticket to get the assigned technician (assignedUserId, fallback to userId) and the organizationId
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { 
        assignedUserId: true, 
        userId: true,
        branch: { select: { organizationId: true } }
      },
    });

    const technicianId = ticket?.assignedUserId || ticket?.userId;

    if (!technicianId || !ticket?.branch?.organizationId) {
      this.logger.warn(`Ticket ${ticketId} has no assigned user or organization — skipping commission`);
      return null;
    }

    // Find the technician's commission rate from their OrgMembership (without role restriction)
    const membership = await this.prisma.orgMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: ticket.branch.organizationId,
          userId: technicianId,
        },
      },
      select: { commissionRate: true },
    });

    if (!membership?.commissionRate || Number(membership.commissionRate) <= 0) {
      this.logger.log(`User ${technicianId} has no commission rate configured — skipping`);
      return null;
    }

    const rate = Number(membership.commissionRate);
    const amount = Math.round((saleSubtotal * rate) / 100 * 100) / 100; // Round to 2 decimals

    // Prevent duplicate commissions (upsert by saleId+ticketId+userId unique constraint)
    const existing = await this.prisma.commission.findUnique({
      where: {
        saleId_ticketId_userId: { saleId, ticketId, userId: technicianId },
      },
    });

    if (existing) {
      this.logger.warn(`Commission already exists for sale ${saleId} and user ${technicianId}`);
      return existing;
    }

    const commission = await this.prisma.commission.create({
      data: {
        saleId,
        ticketId,
        userId: technicianId,
        amount,
        rate,
        saleTotal: saleSubtotal,
        status: CommissionStatus.PENDIENTE,
      },
    });

    this.logger.log(
      `Commission created: $${amount} (${rate}% of $${saleSubtotal}) for user ${technicianId} on sale ${saleId}`,
    );

    return commission;
  }

  async findAll(organizationId: number, filters?: {
    userId?: number;
    status?: CommissionStatus;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where: any = {
      user: {
        memberships: {
          some: {
            organizationId,
          },
        },
      },
    };

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.createdAt.lte = new Date(filters.endDate);
      }
    }

    const [commissions, total] = await Promise.all([
      this.prisma.commission.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          sale: {
            select: {
              id: true,
              folio: true,
              total: true,
              subtotal: true,
              createdAt: true,
            },
          },
          ticket: {
            select: {
              id: true,
              folio: true,
              customerName: true,
              device: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.commission.count({ where }),
    ]);

    return {
      data: commissions,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getSummary(organizationId: number) {
    // Get users in the organization who are technicians, have a commission rate, or have received commissions
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVO',
        OR: [
          {
            memberships: {
              some: {
                organizationId,
                status: 'ACTIVO',
                role: 'LABORATORIO',
              },
            },
          },
          {
            memberships: {
              some: {
                organizationId,
                status: 'ACTIVO',
                commissionRate: { not: null },
              },
            },
          },
          {
            commissions: {
              some: {
                ticket: {
                  branch: { organizationId },
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        memberships: {
          where: { organizationId },
          select: { commissionRate: true },
        },
        commissions: {
          select: {
            amount: true,
            status: true,
          },
        },
      },
    });

    return users.map((user) => {
      const pending = user.commissions
        .filter((c) => c.status === CommissionStatus.PENDIENTE)
        .reduce((sum, c) => sum + Number(c.amount), 0);
      const paid = user.commissions
        .filter((c) => c.status === CommissionStatus.PAGADA)
        .reduce((sum, c) => sum + Number(c.amount), 0);
      const total = user.commissions.reduce((sum, c) => sum + Number(c.amount), 0);

      return {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        commissionRate: user.memberships[0]?.commissionRate
          ? Number(user.memberships[0].commissionRate)
          : null,
        pendingAmount: pending,
        paidAmount: paid,
        totalAmount: total,
        pendingCount: user.commissions.filter((c) => c.status === CommissionStatus.PENDIENTE).length,
        paidCount: user.commissions.filter((c) => c.status === CommissionStatus.PAGADA).length,
      };
    });
  }

  async markAsPaid(commissionId: number, organizationId: number) {
    const commission = await this.prisma.commission.findFirst({
      where: {
        id: commissionId,
        user: {
          memberships: { some: { organizationId } },
        },
      },
    });

    if (!commission) {
      throw new NotFoundException('Commission not found');
    }

    return this.prisma.commission.update({
      where: { id: commissionId },
      data: {
        status: CommissionStatus.PAGADA,
        paidAt: new Date(),
      },
    });
  }

  async markManyAsPaid(ids: number[], organizationId: number) {
    // Verify all commissions belong to org
    const count = await this.prisma.commission.count({
      where: {
        id: { in: ids },
        user: {
          memberships: { some: { organizationId } },
        },
      },
    });

    if (count !== ids.length) {
      throw new NotFoundException('Some commissions were not found');
    }

    await this.prisma.commission.updateMany({
      where: { id: { in: ids } },
      data: {
        status: CommissionStatus.PAGADA,
        paidAt: new Date(),
      },
    });

    return { updated: ids.length };
  }

  async exportCsv(organizationId: number, filters?: {
    userId?: number;
    status?: CommissionStatus;
    startDate?: string;
    endDate?: string;
  }) {
    const where: any = {
      user: {
        memberships: {
          some: { organizationId },
        },
      },
    };

    if (filters?.userId) where.userId = filters.userId;
    if (filters?.status) where.status = filters.status;
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const commissions = await this.prisma.commission.findMany({
      where,
      include: {
        user: { select: { name: true, email: true } },
        sale: { select: { folio: true, subtotal: true } },
        ticket: { select: { folio: true, customerName: true, device: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const header = 'ID,Técnico,Email,Ticket,Cliente,Dispositivo,Venta Folio,Subtotal Venta,Tasa (%),Monto Comisión,Estado,Fecha Creación,Fecha Pago\n';
    const rows = commissions.map((c) => {
      return [
        c.id,
        `"${(c.user.name || '').replace(/"/g, '""')}"`,
        c.user.email || '',
        c.ticket.folio,
        `"${(c.ticket.customerName || '').replace(/"/g, '""')}"`,
        `"${(c.ticket.device || '').replace(/"/g, '""')}"`,
        c.sale.folio,
        Number(c.saleTotal).toFixed(2),
        Number(c.rate).toFixed(2),
        Number(c.amount).toFixed(2),
        c.status,
        c.createdAt.toISOString(),
        c.paidAt ? c.paidAt.toISOString() : '',
      ].join(',');
    }).join('\n');

    return header + rows;
  }
}
