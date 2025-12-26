import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { MovementType } from '@prisma/client';
import { AuthUser } from '../auth/auth.service';
import { FoliosService } from '../folios/folios.service';
import { CreateMovementDto } from './dto/create-movement.dto';

@Injectable()
export class MovementsService {
  constructor(
    private prisma: PrismaService,
    private foliosService: FoliosService,
  ) {}

  async createMovement(createMovementDto: CreateMovementDto, user: AuthUser, ip?: string, userAgent?: string) {
    // PgBouncer transaction mode: Generate folio first, then batch transaction
    let folio = createMovementDto.folio;
    if (!folio) {
      const prefix = this.getPrefixForMovementType(createMovementDto.type);
      folio = await this.foliosService.next(prefix, createMovementDto.branchId);
    }

    // Prepare movement creation
    const movementData = {
      ...createMovementDto,
      folio,
      userId: user.id,
      ip,
      userAgent,
    };

    // Use batch transaction for movement and stock update
    if (createMovementDto.type === MovementType.ING) {
      // Increase stock - use batch transaction
      const [movement] = await this.prisma.$transaction([
        this.prisma.movement.create({
          data: movementData,
        }),
        this.prisma.stock.upsert({
          where: {
            branchId_variantId: {
              branchId: createMovementDto.branchId,
              variantId: createMovementDto.variantId,
            },
          },
          update: {
            qty: {
              increment: createMovementDto.qty,
            },
          },
          create: {
            branchId: createMovementDto.branchId,
            variantId: createMovementDto.variantId,
            qty: createMovementDto.qty,
            min: 0,
            max: 1000,
            reserved: 0,
          },
        }),
      ]);
      return movement;
    } else if (createMovementDto.type === MovementType.EGR || createMovementDto.type === MovementType.VTA) {
      // Decrease stock - read first to validate
      const stock = await this.prisma.stock.findFirst({
        where: {
          branchId: createMovementDto.branchId,
          variantId: createMovementDto.variantId,
        },
      });

      if (!stock || stock.qty < createMovementDto.qty) {
        throw new Error('Insufficient stock');
      }

      // Use batch transaction for movement and stock update
      const [movement] = await this.prisma.$transaction([
        this.prisma.movement.create({
          data: movementData,
        }),
        this.prisma.stock.update({
          where: { id: stock.id },
          data: {
            qty: stock.qty - createMovementDto.qty,
          },
        }),
      ]);
      return movement;
    } else {
      // Other movement types - just create movement
      return this.prisma.movement.create({
        data: movementData,
      });
    }
  }

  async getMovements(
    branchId: number,
    organizationId: number,
    filters?: {
      tipo?: MovementType;
      variantId?: number;
      userId?: number;
      fechaDesde?: Date;
      fechaHasta?: Date;
      q?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where: any = {
      branchId,
      branch: { organizationId },
    };

    if (filters?.tipo) {
      where.type = filters.tipo;
    }

    if (filters?.variantId) {
      where.variantId = filters.variantId;
    }

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    if (filters?.fechaDesde || filters?.fechaHasta) {
      where.createdAt = {};
      if (filters.fechaDesde) {
        where.createdAt.gte = filters.fechaDesde;
      }
      if (filters.fechaHasta) {
        // Add one day to include the entire day
        const endDate = new Date(filters.fechaHasta);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }

    if (filters?.q) {
      where.OR = [
        { folio: { contains: filters.q, mode: 'insensitive' } },
        { variant: { sku: { contains: filters.q, mode: 'insensitive' } } },
        { variant: { name: { contains: filters.q, mode: 'insensitive' } } },
        { variant: { product: { name: { contains: filters.q, mode: 'insensitive' } } } },
        { variant: { product: { model: { contains: filters.q, mode: 'insensitive' } } } },
      ];
    }

    const [movements, total] = await Promise.all([
      this.prisma.movement.findMany({
        where,
        include: {
          variant: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  brand: true,
                  model: true,
                },
              },
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.movement.count({ where }),
    ]);

    return {
      data: movements,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  private getPrefixForMovementType(type: MovementType): string {
    switch (type) {
      case MovementType.ING:
        return 'ING';
      case MovementType.EGR:
        return 'EGR';
      case MovementType.VTA:
        return 'VTA';
      case MovementType.AJU:
        return 'AJU';
      case MovementType.TRF_OUT:
        return 'TRF_OUT';
      case MovementType.TRF_IN:
        return 'TRF_IN';
      default:
        return 'MOV';
    }
  }
}

