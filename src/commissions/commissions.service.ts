import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CommissionStatus } from '@prisma/client';
import {
  MEMBERSHIP_RULES_INCLUDE,
  RuleSourceMembership,
  countActiveScopedRules,
  resolveEffectiveRule,
} from './effective-commission-rule';

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
            variant: { include: { product: { include: { category: true } } } },
            ticket: { select: { id: true, assignedUserId: true, userId: true, finalCost: true } },
          },
        },
      },
    });

    if (!sale || !sale.branch) return;

    const organizationId = sale.branch.organizationId;
    const customerGroupId = sale.customer?.groupId ?? null;
    const membershipCache = new Map<number, RuleSourceMembership | null>();

    for (const line of sale.lines) {
      try {
        await this.generateForLine(line, sale, organizationId, customerGroupId, membershipCache);
      } catch (error) {
        this.logger.error(`Error generating commission for sale line ${line.id}:`, error);
      }
    }
  }

  async generateForReturn(
    returnSaleId: number,
    originalLineIdByReturnLineId: Map<number, number>,
  ): Promise<void> {
    for (const [returnLineId, originalLineId] of originalLineIdByReturnLineId.entries()) {
      try {
        const originalCommission = await this.prisma.commission.findFirst({
          where: { saleLineId: originalLineId },
        });
        if (!originalCommission) continue;

        const [returnLine, originalLine] = await Promise.all([
          this.prisma.saleLine.findUnique({ where: { id: returnLineId } }),
          this.prisma.saleLine.findUnique({ where: { id: originalLineId } }),
        ]);
        if (!returnLine || !originalLine || originalLine.qty === 0) continue;

        const refundRatio = returnLine.qty / originalLine.qty;
        const negativeAmount = -Math.round(Number(originalCommission.amount) * refundRatio * 100) / 100;

        await this.prisma.commission.create({
          data: {
            saleId: returnSaleId,
            saleLineId: returnLine.id,
            ticketId: originalCommission.ticketId,
            userId: originalCommission.userId,
            ruleId: originalCommission.ruleId,
            basis: originalCommission.basis,
            scopeLabel: originalCommission.scopeLabel,
            isEstimated: originalCommission.isEstimated,
            amount: negativeAmount,
            rate: originalCommission.rate,
            saleTotal: -Number(originalCommission.saleTotal) * refundRatio,
            status: CommissionStatus.PENDIENTE,
          },
        });
      } catch (error) {
        this.logger.error(`Error generating return commission for return line ${returnLineId}:`, error);
      }
    }
  }

  private loadMembership(userId: number, organizationId: number) {
    return this.prisma.orgMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: MEMBERSHIP_RULES_INCLUDE,
    });
  }

  private async generateForLine(
    line: any,
    sale: any,
    organizationId: number,
    customerGroupId: number | null,
    membershipCache: Map<number, RuleSourceMembership | null>,
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
      productCategory = line.variant.product?.category?.name ?? null;
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

    if (!membershipCache.has(responsibleUserId)) {
      membershipCache.set(responsibleUserId, await this.loadMembership(responsibleUserId, organizationId));
    }
    const membership = membershipCache.get(responsibleUserId);
    if (!membership) return;

    // Real sales resolve at the exact sale instant; only Preview uses a date-only input.
    const result = resolveEffectiveRule(membership, {
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
    // Who gets a card: an employee with an assigned plan (active or not, so a deactivated
    // plan still shows its warning), any individual rule, the TECNICO or VENDEDOR role, or an
    // existing commission. The legacy flat rate no longer decides this.
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVO',
        OR: [
          {
            memberships: {
              some: {
                organizationId,
                status: 'ACTIVO',
                OR: [
                  { role: { in: ['TECNICO', 'VENDEDOR'] } },
                  { commissionPlanId: { not: null } },
                  { overrideRules: { some: {} } },
                ],
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
          include: MEMBERSHIP_RULES_INCLUDE,
        },
        commissions: {
          select: {
            amount: true,
            status: true,
          },
        },
      },
    });

    // The card evaluates at "now". Preview evaluates a date-only input at the END of that day
    // in the org timezone, and real sales at their exact timestamp. Those differing instants
    // are deliberate; a difference between them is not a bug.
    const now = new Date();

    return users.map((user) => {
      const membership = user.memberships[0] ?? null;
      const effective = membership
        ? resolveEffectiveRule(membership, { date: now, productCategory: null, customerGroupId: null })
        : null;
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
        commissionPlanName: membership?.commissionPlan?.name ?? null,
        commissionPlanActive: membership?.commissionPlan?.active ?? null,
        // Category and customer-group rules in force now, shown next to the GENERAL winner.
        scopedRuleCount: membership ? countActiveScopedRules(membership, now) : 0,
        // Winning GENERAL-scope rule right now, from the same function Preview and real sales use.
        effectiveRule: effective
          ? {
              ruleId: effective.rule.id,
              source: effective.rule.source,
              basis: effective.rule.basis,
              calcMethod: effective.rule.calcMethod,
              value: effective.rule.value,
            }
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

    const header = 'ID,Técnico,Email,Ticket,Cliente,Dispositivo,Venta Folio,Subtotal Venta,Tasa (%),Monto Comisión,Base,Alcance,Estimado,Estado,Fecha Creación,Fecha Pago\n';
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
        c.basis || '',
        `"${(c.scopeLabel || '').replace(/"/g, '""')}"`,
        c.isEstimated ? 'Sí' : 'No',
        c.status,
        c.createdAt.toISOString(),
        c.paidAt ? c.paidAt.toISOString() : '',
      ].join(',');
    }).join('\n');

    return header + rows;
  }
}
