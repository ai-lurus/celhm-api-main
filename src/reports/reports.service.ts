import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { TicketState, PaymentMethod, MovementType } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // RF-REP-01: Reporte de ventas por día y sucursal
  async getSalesReport(organizationId: number, filters: {
    branchId?: number;
    startDate: Date;
    endDate: Date;
  }) {
    const where: any = {
      branch: { organizationId },
      createdAt: {
        gte: filters.startDate,
        lte: filters.endDate,
      },
      status: 'PAGADO',
    };

    if (filters.branchId) {
      where.branchId = filters.branchId;
    }

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        lines: true,
        payments: true,
        branch: {
          select: {
            name: true,
            code: true,
          },
        },
      },
    });

    // Group by payment method
    const byPaymentMethod: Record<PaymentMethod, number> = {
      EFECTIVO: 0,
      TARJETA_DEBITO: 0,
      TARJETA_CREDITO: 0,
      TRANSFERENCIA: 0,
      CHEQUE: 0,
      OTRO: 0,
    };

    // Group by service type (repair vs products)
    let repairSales = 0;
    let productSales = 0;

    for (const sale of sales) {
      for (const payment of sale.payments) {
        byPaymentMethod[payment.method] += Number(payment.amount);
      }

      if (sale.ticketId) {
        repairSales += Number(sale.total);
      } else {
        productSales += Number(sale.total);
      }
    }

    const totalSales = repairSales + productSales;

    const paymentMethodCounts: Record<PaymentMethod, number> = {
      EFECTIVO: 0,
      TARJETA_DEBITO: 0,
      TARJETA_CREDITO: 0,
      TRANSFERENCIA: 0,
      CHEQUE: 0,
      OTRO: 0,
    };
    for (const sale of sales) {
      for (const payment of sale.payments) {
        paymentMethodCounts[payment.method]++;
      }
    }

    return {
      period: {
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
      totalSales,
      salesCount: sales.length,
      totalByPaymentMethod: (Object.entries(byPaymentMethod) as [PaymentMethod, number][])
        .filter(([, amount]) => amount > 0)
        .map(([method, amount]) => ({
          method,
          amount,
          count: paymentMethodCounts[method],
        })),
      totalByServiceType: [
        {
          type: 'Reparaciones',
          amount: repairSales,
          count: sales.filter((s) => s.ticketId).length,
        },
        {
          type: 'Productos',
          amount: productSales,
          count: sales.filter((s) => !s.ticketId).length,
        },
      ].filter((item) => item.count > 0),
    };
  }

  // RF-REP-02: Reporte de órdenes
  async getTicketsReport(organizationId: number, filters: {
    branchId?: number;
    startDate?: Date;
    endDate?: Date;
    state?: TicketState;
  }) {
    const where: any = {
      branch: { organizationId },
    };

    if (filters.branchId) {
      where.branchId = filters.branchId;
    }

    if (filters.state) {
      where.state = filters.state;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const tickets = await this.prisma.ticket.findMany({
      where,
      include: {
        branch: {
          select: {
            name: true,
            code: true,
          },
        },
      },
    });

    // Group by state
    const byState: Record<TicketState, number> = {
      RECIBIDO: 0,
      DIAGNOSTICO: 0,
      ESPERANDO_PIEZA: 0,
      EN_REPARACION: 0,
      REPARADO: 0,
      ENTREGADO: 0,
      CANCELADO: 0,
    };

    for (const ticket of tickets) {
      byState[ticket.state]++;
    }

    // Closed tickets (ENTREGADO or CANCELADO)
    const closedTickets = tickets.filter(
      (t) => t.state === TicketState.ENTREGADO || t.state === TicketState.CANCELADO,
    );

    const closedRevenue = closedTickets.reduce(
      (sum, t) => sum + Number((t as any).finalCost || (t as any).estimatedCost || 0),
      0,
    );

    return {
      period: {
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
      totalTickets: tickets.length,
      ticketsByState: (Object.entries(byState) as [TicketState, number][]).map(
        ([state, count]) => ({ state, count }),
      ),
      closedTickets: {
        count: closedTickets.length,
        totalRevenue: closedRevenue,
      },
    };
  }

  // RF-REP-03: Reporte de inventario
  // RF-REP-04: Reporte de movimientos de inventario
  async getMovementsReport(organizationId: number, filters: {
    branchId?: number;
    startDate: Date;
    endDate: Date;
    type?: MovementType;
  }) {
    const where: any = {
      branch: { organizationId },
      createdAt: {
        gte: filters.startDate,
        lte: filters.endDate,
      },
    };

    if (filters.branchId) {
      where.branchId = filters.branchId;
    }

    if (filters.type) {
      where.type = filters.type;
    }

    const movements = await this.prisma.movement.findMany({
      where,
      include: {
        variant: {
          include: {
            product: {
              select: { id: true, name: true, brand: true, model: true },
            },
          },
        },
        user: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Totals by type
    const byType: Record<string, { count: number; qty: number }> = {};
    for (const m of movements) {
      if (!byType[m.type]) byType[m.type] = { count: 0, qty: 0 };
      byType[m.type].count += 1;
      byType[m.type].qty += m.qty;
    }

    return {
      period: { startDate: filters.startDate, endDate: filters.endDate },
      total: movements.length,
      byType: Object.entries(byType).map(([type, data]) => ({ type, ...data })),
      movements: movements.map((m) => ({
        id: m.id,
        folio: m.folio,
        type: m.type,
        qty: m.qty,
        reason: m.reason,
        createdAt: m.createdAt,
        variant: {
          id: m.variant.id,
          name: m.variant.name,
          sku: m.variant.sku,
        },
        product: {
          id: m.variant.product.id,
          name: m.variant.product.name,
          brand: m.variant.product.brand,
        },
        user: m.user ? { id: m.user.id, name: m.user.name } : null,
        branch: { id: m.branch.id, name: m.branch.name },
      })),
    };
  }

  async getInventoryReport(organizationId: number, filters: {
    branchId?: number;
  }) {
    const where: any = {
      branch: { organizationId },
    };

    if (filters.branchId) {
      where.branchId = filters.branchId;
    }

    // Inventory valuation (using purchase price)
    const allStocks = await this.prisma.stock.findMany({
      where,
      include: {
        variant: {
          include: {
            product: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Products under minimum stock (filter in JS since Prisma doesn't support field-to-field comparison)
    const lowStockItems = allStocks.filter((s) => s.qty <= s.min);

    let totalValue = 0;
    for (const stock of allStocks) {
      const purchasePrice = stock.variant.purchasePrice || 0;
      totalValue += Number(purchasePrice) * stock.qty;
    }

    return {
      totalValue,
      totalItems: allStocks.length,
      lowStockItems: lowStockItems.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        branchId: item.branchId,
        qty: item.qty,
        min: item.min,
        variant: {
          id: item.variant.id,
          name: item.variant.name,
          sku: item.variant.sku,
        },
        branch: {
          id: item.branch.id,
          name: item.branch.name,
        },
      })),
    };
  }

  // RF-REP-05: Reporte de ventas para comisiones
  async getCommissionsSalesReport(organizationId: number, filters: {
    branchId?: number;
    startDate: Date;
    endDate: Date;
  }) {
    const where: any = {
      branch: { organizationId },
      createdAt: {
        gte: filters.startDate,
        lte: filters.endDate,
      },
      status: 'PAGADO',
    };

    if (filters.branchId) {
      where.branchId = filters.branchId;
    }

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        branch: { select: { name: true, code: true } },
        user: { select: { id: true, name: true } },
        commissions: { select: { amount: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const rows = sales.map((sale) => {
      const commissionAmount = sale.commissions.reduce((sum, c) => sum + Number(c.amount), 0);
      const commissionStatus: 'SIN_COMISION' | 'PENDIENTE' | 'PARCIAL' | 'PAGADA' =
        sale.commissions.length === 0
          ? 'SIN_COMISION'
          : sale.commissions.every((c) => c.status === 'PAGADA')
            ? 'PAGADA'
            : sale.commissions.some((c) => c.status === 'PAGADA')
              ? 'PARCIAL'
              : 'PENDIENTE';

      return {
        saleId: sale.id,
        folio: sale.folio,
        date: sale.createdAt,
        branch: sale.branch.name,
        sellerId: sale.user?.id ?? null,
        seller: sale.user?.name || 'Sin asignar',
        subtotal: Number(sale.subtotal),
        total: Number(sale.total),
        commissionAmount,
        commissionStatus,
      };
    });

    return {
      period: {
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
      salesCount: rows.length,
      totalSales: rows.reduce((sum, r) => sum + r.total, 0),
      totalCommissions: rows.reduce((sum, r) => sum + r.commissionAmount, 0),
      rows,
    };
  }

  // RF-REP-06: Reporte de ventas por vendedor
  async getSalesBySellerReport(organizationId: number, filters: {
    branchId?: number;
    sellerId?: number;
    startDate: Date;
    endDate: Date;
    detailLevel: 'TOTALS_BY_SELLER' | 'TOTALS_BY_DOCUMENT' | 'DOCUMENT_DETAILS' | 'DOCUMENT_DETAILS_SERIAL';
  }) {
    const where: any = {
      branch: { organizationId },
      createdAt: {
        gte: filters.startDate,
        lte: filters.endDate,
      },
      status: 'PAGADO',
    };

    if (filters.branchId) {
      where.branchId = filters.branchId;
    }
    if (filters.sellerId) {
      where.userId = filters.sellerId;
    }

    const needsLines = filters.detailLevel === 'DOCUMENT_DETAILS' || filters.detailLevel === 'DOCUMENT_DETAILS_SERIAL';

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        branch: { select: { name: true } },
        user: { select: { id: true, name: true } },
        lines: needsLines
          ? {
              include: {
                ticket: { select: { serialNumber: true, imei: true } },
              },
            }
          : false,
      },
      orderBy: { createdAt: 'asc' },
    });

    const period = { startDate: filters.startDate, endDate: filters.endDate };

    if (filters.detailLevel === 'TOTALS_BY_SELLER') {
      const bySeller = new Map<string, { sellerId: number | null; seller: string; salesCount: number; total: number }>();
      for (const sale of sales) {
        const key = sale.user ? String(sale.user.id) : 'sin_asignar';
        const entry = bySeller.get(key) || {
          sellerId: sale.user?.id ?? null,
          seller: sale.user?.name || 'Sin asignar',
          salesCount: 0,
          total: 0,
        };
        entry.salesCount += 1;
        entry.total += Number(sale.total);
        bySeller.set(key, entry);
      }
      const rows = Array.from(bySeller.values()).sort((a, b) => b.total - a.total);
      return {
        period,
        detailLevel: filters.detailLevel,
        salesCount: sales.length,
        totalSales: rows.reduce((sum, r) => sum + r.total, 0),
        rows,
      };
    }

    if (filters.detailLevel === 'TOTALS_BY_DOCUMENT') {
      const rows = sales.map((sale) => ({
        saleId: sale.id,
        folio: sale.folio,
        date: sale.createdAt,
        branch: sale.branch.name,
        sellerId: sale.user?.id ?? null,
        seller: sale.user?.name || 'Sin asignar',
        total: Number(sale.total),
      }));
      return {
        period,
        detailLevel: filters.detailLevel,
        salesCount: rows.length,
        totalSales: rows.reduce((sum, r) => sum + r.total, 0),
        rows,
      };
    }

    // DOCUMENT_DETAILS / DOCUMENT_DETAILS_SERIAL: one row per sale line
    const includeSerial = filters.detailLevel === 'DOCUMENT_DETAILS_SERIAL';
    const rows: any[] = [];
    for (const sale of sales) {
      for (const line of (sale as any).lines) {
        const row: any = {
          saleId: sale.id,
          folio: sale.folio,
          date: sale.createdAt,
          branch: sale.branch.name,
          sellerId: sale.user?.id ?? null,
          seller: sale.user?.name || 'Sin asignar',
          description: line.description,
          qty: line.qty,
          unitPrice: Number(line.unitPrice),
          discount: Number(line.discount),
          total: Number(line.total),
        };
        if (includeSerial) {
          row.serialNumber = line.serialNumber || line.ticket?.serialNumber || line.ticket?.imei || null;
        }
        rows.push(row);
      }
    }

    return {
      period,
      detailLevel: filters.detailLevel,
      salesCount: sales.length,
      totalSales: sales.reduce((sum, s) => sum + Number(s.total), 0),
      rows,
    };
  }

  // CSV export shared by the two commission-related reports above.
  exportCommissionsSalesCsv(report: Awaited<ReturnType<ReportsService['getCommissionsSalesReport']>>) {
    const header = 'Folio,Fecha,Sucursal,Vendedor,Subtotal,Total,Comisión,Estado Comisión\n';
    const rows = report.rows.map((r) => [
      r.folio,
      r.date.toISOString(),
      `"${r.branch.replace(/"/g, '""')}"`,
      `"${r.seller.replace(/"/g, '""')}"`,
      r.subtotal.toFixed(2),
      r.total.toFixed(2),
      r.commissionAmount.toFixed(2),
      r.commissionStatus,
    ].join(',')).join('\n');
    return header + rows;
  }

  exportSalesBySellerCsv(report: Awaited<ReturnType<ReportsService['getSalesBySellerReport']>>) {
    if (report.detailLevel === 'TOTALS_BY_SELLER') {
      const header = 'Vendedor,Num. Ventas,Total\n';
      const rows = report.rows.map((r: any) => [
        `"${String(r.seller).replace(/"/g, '""')}"`,
        r.salesCount,
        Number(r.total).toFixed(2),
      ].join(',')).join('\n');
      return header + rows;
    }
    if (report.detailLevel === 'TOTALS_BY_DOCUMENT') {
      const header = 'Folio,Fecha,Sucursal,Vendedor,Total\n';
      const rows = report.rows.map((r: any) => [
        r.folio,
        new Date(r.date).toISOString(),
        `"${String(r.branch).replace(/"/g, '""')}"`,
        `"${String(r.seller).replace(/"/g, '""')}"`,
        Number(r.total).toFixed(2),
      ].join(',')).join('\n');
      return header + rows;
    }
    const includeSerial = report.detailLevel === 'DOCUMENT_DETAILS_SERIAL';
    const header = (includeSerial
      ? 'Folio,Fecha,Sucursal,Vendedor,Descripción,Cant,Precio Unit,Descuento,Total,Número de Serie\n'
      : 'Folio,Fecha,Sucursal,Vendedor,Descripción,Cant,Precio Unit,Descuento,Total\n');
    const rows = report.rows.map((r: any) => {
      const base = [
        r.folio,
        new Date(r.date).toISOString(),
        `"${String(r.branch).replace(/"/g, '""')}"`,
        `"${String(r.seller).replace(/"/g, '""')}"`,
        `"${String(r.description).replace(/"/g, '""')}"`,
        r.qty,
        Number(r.unitPrice).toFixed(2),
        Number(r.discount).toFixed(2),
        Number(r.total).toFixed(2),
      ];
      if (includeSerial) base.push(r.serialNumber || '');
      return base.join(',');
    }).join('\n');
    return header + rows;
  }
}

