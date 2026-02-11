import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SaleStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
    constructor(private prisma: PrismaService) { }

    async getSummary(organizationId: number) {
        const [totalRevenueResult, totalClients, totalSales, inventoryItems] = await Promise.all([
            this.prisma.sale.aggregate({
                where: {
                    branch: { organizationId },
                    status: SaleStatus.PAGADO,
                },
                _sum: {
                    total: true,
                },
            }),
            this.prisma.customer.count({
                where: { organizationId },
            }),
            this.prisma.sale.count({
                where: {
                    branch: { organizationId },
                    status: SaleStatus.PAGADO,
                },
            }),
            this.prisma.stock.count({
                where: {
                    branch: { organizationId },
                },
            }),
        ]);

        return {
            totalRevenue: Number(totalRevenueResult._sum.total || 0),
            totalClients,
            totalSales,
            inventoryItems,
        };
    }

    async getChartData(organizationId: number) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 5);
        startDate.setDate(1);

        const sales = await this.prisma.sale.findMany({
            where: {
                branch: { organizationId },
                status: SaleStatus.PAGADO,
                createdAt: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            select: {
                createdAt: true,
                total: true,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthlyData = new Map<string, number>();

        for (let i = 0; i < 6; i++) {
            const d = new Date();
            d.setMonth(d.getMonth() - (5 - i));
            const monthName = months[d.getMonth()];
            monthlyData.set(monthName, 0);
        }

        sales.forEach((sale) => {
            const monthName = months[sale.createdAt.getMonth()];
            if (monthlyData.has(monthName)) {
                monthlyData.set(monthName, monthlyData.get(monthName)! + Number(sale.total));
            }
        });

        return Array.from(monthlyData.entries()).map(([month, value]) => ({
            month,
            value,
        }));
    }

    async getTopProducts(organizationId: number) {
        const saleLines = await this.prisma.saleLine.findMany({
            where: {
                sale: {
                    branch: { organizationId },
                    status: SaleStatus.PAGADO,
                },
            },
            include: {
                variant: {
                    include: {
                        product: true,
                    },
                },
            },
            take: 1000,
            orderBy: {
                sale: {
                    createdAt: 'desc',
                },
            },
        });

        const productMap = new Map<string, { units: number; revenue: number }>();

        saleLines.forEach((line) => {
            const productName = line.variant?.product?.name || line.description || 'Unknown Product';
            const current = productMap.get(productName) || { units: 0, revenue: 0 };

            productMap.set(productName, {
                units: current.units + (line.qty || 0),
                revenue: current.revenue + (Number(line.total || 0)),
            });
        });

        return Array.from(productMap.entries())
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);
    }

    async getRecentActivity(organizationId: number) {
        const [sales, tickets, lowStock] = await Promise.all([
            this.prisma.sale.findMany({
                where: { branch: { organizationId } },
                orderBy: { createdAt: 'desc' },
                take: 5,
                include: {
                    lines: true,
                },
            }),
            this.prisma.ticket.findMany({
                where: { branch: { organizationId } },
                orderBy: { createdAt: 'desc' },
                take: 5,
            }),
            this.prisma.stock.findMany({
                where: {
                    branch: { organizationId },
                    qty: { lte: this.prisma.stock.fields.min },
                },
                include: {
                    variant: {
                        include: {
                            product: true,
                        },
                    },
                    branch: true,
                },
                take: 5,
            }),
        ]);

        const activities = [
            ...sales.map((s) => ({
                type: 'sale',
                message: `New sale: ${s.lines[0]?.description || 'items'} - $${Number(s.total).toFixed(2)}`,
                time: s.createdAt,
            })),
            ...tickets.map((t) => ({
                type: 'ticket',
                message: `New ticket: #${t.folio} - ${t.state}`,
                time: t.createdAt,
            })),
            ...lowStock.map((s) => ({
                type: 'stock',
                message: `Low stock: ${s.variant?.product?.name} (${s.variant?.name}) - Only ${s.qty} left`,
                time: new Date(),
            })),
        ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
            .slice(0, 10);

        return activities;
    }
}
