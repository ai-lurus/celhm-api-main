import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

  async getProducts(filters?: {
    categoria?: string;
    marca?: string;
    modelo?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (filters?.categoria) {
      where.category = { contains: filters.categoria, mode: 'insensitive' };
    }

    if (filters?.marca) {
      where.brand = { contains: filters.marca, mode: 'insensitive' };
    }

    if (filters?.modelo) {
      where.model = { contains: filters.modelo, mode: 'insensitive' };
    }

    if (filters?.q) {
      where.OR = [
        { name: { contains: filters.q, mode: 'insensitive' } },
        { description: { contains: filters.q, mode: 'insensitive' } },
        { brand: { contains: filters.q, mode: 'insensitive' } },
        { model: { contains: filters.q, mode: 'insensitive' } },
        { category: { contains: filters.q, mode: 'insensitive' } },
      ];
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          variants: {
            orderBy: { name: 'asc' },
          },
          _count: {
            select: {
              variants: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: products,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async createProduct(createProductDto: CreateProductDto) {
    return this.prisma.product.create({
      data: createProductDto,
      include: {
        variants: true,
        _count: {
          select: {
            variants: true,
          },
        },
      },
    });
  }

  async updateProduct(id: number, updateProductDto: UpdateProductDto) {
    return this.prisma.product.update({
      where: { id },
      data: updateProductDto,
      include: {
        variants: true,
        _count: {
          select: {
            variants: true,
          },
        },
      },
    });
  }

  async deleteProduct(id: number) {
    // Delete product (cascade will delete variants)
    return this.prisma.product.delete({
      where: { id },
    });
  }

  async getVariants(filters?: {
    marca?: string;
    modelo?: string;
    categoria?: string;
    productId?: number;
    q?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    const andConditions: any[] = [];

    // Brand filter (OR between variant and product brand)
    if (filters?.marca) {
      andConditions.push({
        OR: [
          { brand: { contains: filters.marca, mode: 'insensitive' } },
          { product: { brand: { contains: filters.marca, mode: 'insensitive' } } },
        ],
      });
    }

    // Model filter (OR between variant and product model)
    if (filters?.modelo) {
      andConditions.push({
        OR: [
          { model: { contains: filters.modelo, mode: 'insensitive' } },
          { product: { model: { contains: filters.modelo, mode: 'insensitive' } } },
        ],
      });
    }

    // Category filter
    if (filters?.categoria) {
      andConditions.push({
        product: {
          category: { contains: filters.categoria, mode: 'insensitive' },
        },
      });
    }

    // Product ID filter
    if (filters?.productId) {
      where.productId = filters.productId;
    }

    // Search query (OR across multiple fields)
    if (filters?.q) {
      andConditions.push({
        OR: [
          { sku: { contains: filters.q, mode: 'insensitive' } },
          { name: { contains: filters.q, mode: 'insensitive' } },
          { product: { name: { contains: filters.q, mode: 'insensitive' } } },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const [variants, total] = await Promise.all([
      this.prisma.variant.findMany({
        where,
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
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
      }),
      this.prisma.variant.count({ where }),
    ]);

    return {
      data: variants,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async createVariant(createVariantDto: CreateVariantDto) {
    return this.prisma.variant.create({
      data: createVariantDto,
      include: {
        product: true,
      },
    });
  }

  async updateVariant(id: number, updateVariantDto: UpdateVariantDto) {
    return this.prisma.variant.update({
      where: { id },
      data: updateVariantDto,
      include: {
        product: true,
      },
    });
  }

  async deleteVariant(id: number) {
    return this.prisma.variant.delete({
      where: { id },
    });
  }

  async getVariantById(id: number) {
    return this.prisma.variant.findUnique({
      where: { id },
      include: {
        product: true,
      },
    });
  }

  async getCategories() {
    const categories = await this.prisma.product.findMany({
      select: {
        category: true,
      },
      distinct: ['category'],
      where: {
        category: {
          not: null,
        },
      },
      orderBy: {
        category: 'asc',
      },
    });

    return categories.map((c) => c.category).filter(Boolean);
  }

  async getBrands() {
    const brands = await this.prisma.product.findMany({
      select: {
        brand: true,
      },
      distinct: ['brand'],
      where: {
        brand: {
          not: null,
        },
      },
      orderBy: {
        brand: 'asc',
      },
    });

    return brands.map((b) => b.brand).filter(Boolean);
  }
}

