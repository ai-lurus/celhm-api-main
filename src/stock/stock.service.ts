import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthUser } from '../auth/auth.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

@Injectable()
export class StockService {
  constructor(private prisma: PrismaService) {}

  async getStock(
    branchId: number,
    organizationId: number,
    filters?: {
      marca?: string;
      modelo?: string;
      estado?: 'normal' | 'low' | 'critical';
      categoriaId?: string;
      q?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where: any = {
      branch: {
        id: branchId,
        organizationId,
      },
    };

    if (filters?.marca) {
      where.OR = [
        ...(where.OR || []),
        {
          variant: {
            brand: {
              contains: filters.marca,
              mode: 'insensitive',
            },
          },
        },
        {
          variant: {
            product: {
              brand: {
                contains: filters.marca,
                mode: 'insensitive',
              },
            },
          },
        },
      ];
    }

    if (filters?.modelo) {
      where.OR = [
        ...(where.OR || []),
        {
          variant: {
            model: {
              contains: filters.modelo,
              mode: 'insensitive',
            },
          },
        },
        {
          variant: {
            product: {
              model: {
                contains: filters.modelo,
                mode: 'insensitive',
              },
            },
          },
        },
      ];
    }

    if (filters?.categoriaId) {
      where.variant = {
        ...(where.variant || {}),
        product: {
          ...(where.variant?.product || {}),
          category: {
            contains: filters.categoriaId,
            mode: 'insensitive',
          },
        },
      };
    }

    if (filters?.q) {
      where.OR = [
        ...(where.OR || []),
        {
          variant: {
            sku: {
              contains: filters.q,
              mode: 'insensitive',
            },
          },
        },
        {
          variant: {
            name: {
              contains: filters.q,
              mode: 'insensitive',
            },
          },
        },
        {
          variant: {
            product: {
              name: {
                contains: filters.q,
                mode: 'insensitive',
              },
            },
          },
        },
      ];
    }

    if (filters?.estado) {
      if (filters.estado === 'critical') {
        where.qty = { lte: 0 };
      } else if (filters.estado === 'low') {
        where.AND = [
          ...(where.AND || []),
          {
            qty: {
              lte: this.prisma.stock.fields.min,
              gt: 0,
            },
          },
        ];
      } else if (filters.estado === 'normal') {
        where.qty = {
          gt: this.prisma.stock.fields.min,
        };
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.stock.findMany({
        where,
        include: {
          variant: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                  brand: true,
                  model: true,
                },
              },
            },
          },
        },
        orderBy: {
          variant: {
            product: { name: 'asc' },
          },
        },
        skip,
        take: pageSize,
      }),
      this.prisma.stock.count({ where }),
    ]);

    return {
      data: items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async updateStockMin(branchId: number, variantId: number, min: number, organizationId: number) {
    return this.prisma.stock.updateMany({
      where: {
        branchId,
        variantId,
        branch: {
          organizationId,
        },
      },
      data: { min },
    });
  }

  async getLowStockAlerts(organizationId: number) {
    return this.prisma.stock.findMany({
      where: {
        branch: { organizationId },
        qty: {
          lte: this.prisma.stock.fields.min,
        },
      },
      include: {
        variant: {
          include: {
            product: {
              select: {
                name: true,
                brand: true,
                model: true,
              },
            },
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
  }

  async reserveStock(branchId: number, variantId: number, qty: number, organizationId: number) {
    return this.prisma.$transaction(async (tx) => {
      const stock = await tx.stock.findFirst({
        where: {
          branchId,
          variantId,
          branch: { organizationId },
        },
      });

      if (!stock) {
        throw new Error('Stock not found');
      }

      const availableQty = stock.qty - stock.reserved;
      if (availableQty < qty) {
        throw new Error('Insufficient stock available');
      }

      return tx.stock.update({
        where: { id: stock.id },
        data: {
          reserved: stock.reserved + qty,
        },
      });
    });
  }

  async releaseStock(branchId: number, variantId: number, qty: number, organizationId: number) {
    return this.prisma.$transaction(async (tx) => {
      const stock = await tx.stock.findFirst({
        where: {
          branchId,
          variantId,
          branch: { organizationId },
        },
      });

      if (!stock) {
        throw new Error('Stock not found');
      }

      const newReserved = Math.max(0, stock.reserved - qty);

      return tx.stock.update({
        where: { id: stock.id },
        data: {
          reserved: newReserved,
        },
      });
    });
  }

  async consumeStock(branchId: number, variantId: number, qty: number, organizationId: number) {
    return this.prisma.$transaction(async (tx) => {
      const stock = await tx.stock.findFirst({
        where: {
          branchId,
          variantId,
          branch: { organizationId },
        },
      });

      if (!stock) {
        throw new Error('Stock not found');
      }

      if (stock.reserved < qty) {
        throw new Error('Insufficient reserved stock');
      }

      return tx.stock.update({
        where: { id: stock.id },
        data: {
          qty: stock.qty - qty,
          reserved: stock.reserved - qty,
        },
      });
    });
  }

  async createInventoryItem(dto: CreateInventoryItemDto, user: AuthUser) {
    const branchId = dto.branchId ?? user.branchId;
    if (!branchId) {
      throw new Error('BranchId is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: dto.name,
          brand: dto.brand,
          model: dto.model,
        },
      });

      const variant = await tx.variant.create({
        data: {
          productId: product.id,
          sku: dto.sku || `SKU-${Date.now()}`,
          name: dto.name,
          brand: dto.brand,
          model: dto.model,
          price: dto.price,
        },
      });

      const stock = await tx.stock.create({
        data: {
          branchId,
          variantId: variant.id,
          qty: dto.qty,
          min: dto.min,
          max: dto.max ?? 1000,
        },
      });

      return {
        ...stock,
        variant: {
          ...variant,
          product,
        },
      };
    });
  }

  async updateInventoryItem(id: number, dto: UpdateInventoryItemDto, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const stock = await tx.stock.findFirst({
        where: {
          id,
          branch: { organizationId: user.organizationId },
        },
        include: {
          variant: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!stock) {
        throw new Error('Stock item not found');
      }

      const updatedProduct = await tx.product.update({
        where: { id: stock.variant.productId },
        data: {
          name: dto.name ?? stock.variant.product.name,
          brand: dto.brand ?? stock.variant.product.brand,
          model: dto.model ?? stock.variant.product.model,
        },
      });

      const updatedVariant = await tx.variant.update({
        where: { id: stock.variantId },
        data: {
          sku: dto.sku ?? stock.variant.sku,
          name: dto.name ?? stock.variant.name,
          brand: dto.brand ?? stock.variant.brand,
          model: dto.model ?? stock.variant.model,
          price: dto.price ?? stock.variant.price,
        },
      });

      const updatedStock = await tx.stock.update({
        where: { id: stock.id },
        data: {
          qty: dto.qty ?? stock.qty,
          min: dto.min ?? stock.min,
          max: dto.max ?? stock.max,
        },
      });

      return {
        ...updatedStock,
        variant: {
          ...updatedVariant,
          product: updatedProduct,
        },
      };
    });
  }

  async deleteInventoryItem(id: number, user: AuthUser) {
    return this.prisma.stock.deleteMany({
      where: {
        id,
        branch: {
          organizationId: user.organizationId,
        },
      },
    });
  }
}

