import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async create(createCustomerDto: CreateCustomerDto, organizationId: number) {
    return this.prisma.customer.create({
      data: {
        ...createCustomerDto,
        organizationId,
      },
    });
  }

  async findAll(organizationId: number, filters?: {
    q?: string;
    branchId?: number;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where: any = {
      organizationId,
    };

    if (filters?.branchId) {
      where.branchId = filters.branchId;
    }

    if (filters?.q) {
      where.OR = [
        { name: { contains: filters.q, mode: 'insensitive' } },
        { phone: { contains: filters.q, mode: 'insensitive' } },
        { email: { contains: filters.q, mode: 'insensitive' } },
      ];
    }

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        include: {
          tickets: {
            select: {
              id: true,
              folio: true,
              state: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 10, // Últimas 10 órdenes
          },
          sales: {
            select: {
              id: true,
              folio: true,
              total: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 10, // Últimas 10 ventas
          },
        },
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data: customers,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: number, organizationId: number) {
    return this.prisma.customer.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        tickets: {
          include: {
            branch: {
              select: {
                name: true,
                code: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        sales: {
          include: {
            branch: {
              select: {
                name: true,
                code: true,
              },
            },
            lines: true,
            payments: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async update(id: number, updateCustomerDto: UpdateCustomerDto, organizationId: number) {
    return this.prisma.customer.updateMany({
      where: {
        id,
        organizationId,
      },
      data: updateCustomerDto,
    });
  }

  async remove(id: number, organizationId: number) {
    return this.prisma.customer.deleteMany({
      where: {
        id,
        organizationId,
      },
    });
  }
}

