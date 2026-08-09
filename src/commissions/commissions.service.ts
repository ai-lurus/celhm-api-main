import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CommissionStatus } from '@prisma/client';
import { resolveCommissionRule, RuleCandidate } from './commission-rule-resolver';

@Injectable()
export class CommissionsService {
  private readonly logger = new Logger(CommissionsService.name);

  constructor(private prisma: PrismaService) {}

  async generateForSale(saleId: number): Promise<void> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        branch: { select: { organizationId: true } },
        customer: { select: { groupId: true } },
        lines: {
          include: {
            variant: { include: { product: true } },
            ticket: { select: { id: true, assignedUserId: true, userId: true, finalCost: true } },
          },
        },
      },
    });

    if (!sale || !sale.branch) return;

    const organizationId = sale.branch.organizationId;
    const customerGroupId = sale.customer?.groupId ?? null;
    const candidateCache = new Map<number, RuleCandidate[]>();

    for (const line of sale.lines) {
      try {
        await this.generateForLine(line, sale, organizationId, customerGroupId, candidateCache);
      } catch (error) {
        this.logger.error(`Error generating commission for sale line ${line.id}:`, error);
      }
    }
  }

  private async getCandidateRules(userId: number, organizationId: number): Promise<RuleCandidate[]> {
    const membership = await this.prisma.orgMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: {
        commissionPlan: { include: { rules: true } },
        overrideRules: true,
      },
    });

    if (!membership) return [];

    const planRules: RuleCandidate[] = (
      membership.commissionPlan?.active ? membership.commissionPlan.rules : []
    ).map((r) => ({
      id: r.id,
      source: 'PLAN' as const,
      scopeType: r.scopeType,
      scopeValue: r.scopeValue,
      basis: r.basis,
      calcMethod: r.calcMethod,
      value: Number(r.value),
      validFrom: r.validFrom,
      validTo: r.validTo,
    }));

    const overrideRules: RuleCandidate[] = membership.overrideRules.map((r) => ({
      id: r.id,
      source: 'OVERRIDE' as const,
      scopeType: r.scopeType,
      scopeValue: r.scopeValue,
      basis: r.basis,
      calcMethod: r.calcMethod,
      value: Number(r.value),
      validFrom: r.validFrom,
      validTo: r.validTo,
    }));

    return [...planRules, ...overrideRules];
  }

  private async generateForLine(
    line: any,
    sale: any,
    organizationId: number,
    customerGroupId: number | null,
    candidateCache: Map<number, RuleCandidate[]>,
  ): Promise<void> {
    let responsibleUserId: number | null = null;
    let productCategory: string | null = null;
    let saleTotalBase = Number(line.total);
    let profitBase = Number(line.total);
    let isEstimated = false;

    if (line.ticketId && line.ticket) {
      responsibleUserId = line.ticket.assignedUserId ?? line.ticket.userId ?? null;
      const parts = await this.prisma.ticketPart.findMany({
        where: { ticketId: line.ticketId },
        include: { variant: true },
      });
      let cost = 0;
      for (const part of parts) {
        if (part.variant.purchasePrice === null) {
          isEstimated = true;
        } else {
          cost += Number(part.variant.purchasePrice) * part.qty;
        }
      }
      profitBase = Number(line.total) - cost;
    } else if (line.variantId && line.variant) {
      responsibleUserId = sale.userId;
      productCategory = line.variant.product?.category ?? null;
      const purchasePrice = line.variant.purchasePrice;
      if (purchasePrice === null) {
        isEstimated = true;
      } else {
        profitBase = Number(line.total) - Number(purchasePrice) * line.qty;
      }
    } else {
      responsibleUserId = sale.userId;
    }

    if (!responsibleUserId) return;

    if (!candidateCache.has(responsibleUserId)) {
      candidateCache.set(responsibleUserId, await this.getCandidateRules(responsibleUserId, organizationId));
    }
    const candidates = candidateCache.get(responsibleUserId)!;
    if (candidates.length === 0) return;

    const result = resolveCommissionRule(candidates, {
      date: sale.createdAt,
      productCategory,
      customerGroupId,
    });

    if (!result) return;
    if (result.hadTie) {
      this.logger.warn(
        `Multiple equally-specific commission rules matched for user ${responsibleUserId} on sale ${sale.id} line ${line.id}; using the most recently created one`,
      );
    }

    const { rule } = result;
    const baseAmount = rule.basis === 'PROFIT' ? profitBase : saleTotalBase;
    const amount =
      rule.calcMethod === 'PERCENTAGE'
        ? Math.round(((baseAmount * rule.value) / 100) * 100) / 100
        : rule.value;

    const scopeLabel =
      rule.scopeType === 'GENERAL'
        ? 'General'
        : rule.scopeType === 'PRODUCT_CATEGORY'
          ? `Categoría: ${productCategory ?? rule.scopeValue}`
          : `Cliente: grupo ${rule.scopeValue}`;

    const existing = await this.prisma.commission.findUnique({
      where: { saleLineId_userId: { saleLineId: line.id, userId: responsibleUserId } },
    });
    if (existing) return;

    await this.prisma.commission.create({
      data: {
        saleId: sale.id,
        saleLineId: line.id,
        ticketId: line.ticketId ?? null,
        userId: responsibleUserId,
        ruleId: rule.id,
        basis: rule.basis,
        scopeLabel,
        isEstimated,
        amount,
        rate: rule.calcMethod === 'PERCENTAGE' ? rule.value : 0,
        saleTotal: baseAmount,
        status: CommissionStatus.PENDIENTE,
      },
    });

    this.logger.log(
      `Commission created: $${amount} (${scopeLabel}, ${rule.basis}) for user ${responsibleUserId} on sale ${sale.id} line ${line.id}`,
    );
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
                role: { in: ['TECNICO', 'VENDEDOR'] },
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
                OR: [
                  { ticket: { branch: { organizationId } } },
                  { sale: { branch: { organizationId } } }
                ],
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
        c.ticket?.folio || '',
        `"${(c.ticket?.customerName || '').replace(/"/g, '""')}"`,
        `"${(c.ticket?.device || 'Productos').replace(/"/g, '""')}"`,
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
