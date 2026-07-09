import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerGroupsService } from './customer-groups.service';
import { FREQUENT_BUYER_GROUP, DEFAULT_CUSTOMER_GROUP } from './customers.constants';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private prisma: PrismaService,
    private customerGroupsService: CustomerGroupsService,
  ) {}

  async create(createCustomerDto: CreateCustomerDto, organizationId: number) {
    const defaultGroup = await this.customerGroupsService.getOrCreateSystemGroup(
      organizationId,
      'isDefault',
      DEFAULT_CUSTOMER_GROUP,
    );

    return this.prisma.customer.create({
      data: {
        ...createCustomerDto,
        organizationId,
        groupId: defaultGroup.id,
      },
      include: { group: true },
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
      // Plain Prisma `contains` (ILIKE) is case-insensitive but not
      // accent-insensitive, so e.g. searching "nunez" would never match a
      // customer stored as "Núñez". Resolve matching ids with unaccent()
      // first, then let Prisma handle the rest (includes, pagination, count).
      const pattern = `%${filters.q}%`;
      const matches = await this.prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM customers
        WHERE "organizationId" = ${organizationId}
          AND (
            unaccent(name) ILIKE unaccent(${pattern})
            OR unaccent(phone) ILIKE unaccent(${pattern})
            OR unaccent(COALESCE(email, '')) ILIKE unaccent(${pattern})
          )
      `;
      where.id = { in: matches.map((m) => m.id) };
    }

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        include: {
          group: true,
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
        group: true,
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

  /**
   * Increments a customer's purchase counter after a sale is paid, and
   * auto-promotes them to the frequent-buyer group once they cross the
   * organization's configurable threshold. Applied after the triggering
   * sale is already finalized, so the promotion only affects sales that
   * follow it, never the one that caused it.
   */
  async registerPurchase(customerId: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        group: true,
        organization: { select: { frequentBuyerThreshold: true } },
      },
    });

    if (!customer) {
      this.logger.warn(`registerPurchase: customer ${customerId} not found`);
      return;
    }

    const purchaseCount = customer.purchaseCount + 1;
    const shouldPromote =
      !customer.group.isFrequentBuyerTarget &&
      purchaseCount >= customer.organization.frequentBuyerThreshold;

    let groupId: number | undefined;
    if (shouldPromote) {
      const frequentGroup = await this.customerGroupsService.getOrCreateSystemGroup(
        customer.organizationId,
        'isFrequentBuyerTarget',
        FREQUENT_BUYER_GROUP,
      );
      groupId = frequentGroup.id;
    }

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        purchaseCount,
        ...(groupId && { groupId }),
      },
    });
  }

  async updateGroup(id: number, groupId: number, organizationId: number) {
    const customer = await this.prisma.customer.findFirst({ where: { id, organizationId } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const group = await this.prisma.customerGroup.findFirst({ where: { id: groupId, organizationId } });
    if (!group) {
      throw new BadRequestException('Group does not belong to this organization');
    }

    return this.prisma.customer.update({
      where: { id },
      data: { groupId },
      include: { group: true },
    });
  }
}
