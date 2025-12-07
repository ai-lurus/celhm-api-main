import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { TicketState, PaymentMethod } from '@prisma/client';

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
      TARJETA: 0,
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

    return {
      period: {
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
      totals: {
        byPaymentMethod,
        byServiceType: {
          repairs: repairSales,
          products: productSales,
          total: repairSales + productSales,
        },
      },
      salesCount: sales.length,
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

    return {
      period: {
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
      totals: {
        byState,
        total: tickets.length,
        closed: closedTickets.length,
        active: tickets.length - closedTickets.length,
      },
    };
  }

  // RF-REP-03: Reporte de inventario
  async getInventoryReport(organizationId: number, filters: {
    branchId?: number;
  }) {
    const where: any = {
      branch: { organizationId },
    };

    if (filters.branchId) {
      where.branchId = filters.branchId;
    }

    // Products under minimum stock
    const lowStockItems = await this.prisma.stock.findMany({
      where: {
        ...where,
        qty: {
          lte: this.prisma.stock.fields.min,
        },
      },
      include: {
        variant: {
          include: {
            product: true,
          },
        },
        branch: {
          select: {
            name: true,
            code: true,
          },
        },
      },
    });

    // Inventory valuation (using purchase price)
    const allStocks = await this.prisma.stock.findMany({
      where,
      include: {
        variant: {
          include: {
            product: true,
          },
        },
      },
    });

    let totalValue = 0;
    for (const stock of allStocks) {
      const purchasePrice = stock.variant.purchasePrice || 0;
      totalValue += Number(purchasePrice) * stock.qty;
    }

    return {
      lowStockItems: lowStockItems.map((item) => ({
        id: item.id,
        variant: {
          sku: item.variant.sku,
          name: item.variant.name,
          product: item.variant.product.name,
        },
        branch: item.branch.name,
        qty: item.qty,
        min: item.min,
        deficit: item.min - item.qty,
      })),
      valuation: {
        totalValue,
        totalItems: allStocks.length,
        itemsWithStock: allStocks.filter((s) => s.qty > 0).length,
      },
    };
  }
}

