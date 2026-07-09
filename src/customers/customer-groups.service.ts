import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateCustomerGroupDto } from './dto/create-customer-group.dto';
import { RenameCustomerGroupDto } from './dto/rename-customer-group.dto';

@Injectable()
export class CustomerGroupsService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: number) {
    return this.prisma.customerGroup.findMany({
      where: { organizationId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { customers: true } } },
    });
  }

  async create(dto: CreateCustomerGroupDto, organizationId: number) {
    try {
      return await this.prisma.customerGroup.create({
        data: { name: dto.name, discountPercent: dto.discountPercent ?? 0, organizationId },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A group named "${dto.name}" already exists`);
      }
      throw error;
    }
  }

  async rename(id: number, dto: RenameCustomerGroupDto, organizationId: number) {
    const group = await this.prisma.customerGroup.findFirst({ where: { id, organizationId } });
    if (!group) {
      throw new NotFoundException('Customer group not found');
    }

    try {
      return await this.prisma.customerGroup.update({
        where: { id },
        data: {
          name: dto.name,
          ...(dto.discountPercent !== undefined && { discountPercent: dto.discountPercent }),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A group named "${dto.name}" already exists`);
      }
      throw error;
    }
  }

  async remove(id: number, organizationId: number) {
    const group = await this.prisma.customerGroup.findFirst({ where: { id, organizationId } });
    if (!group) {
      throw new NotFoundException('Customer group not found');
    }

    if (group.isDefault || group.isFrequentBuyerTarget) {
      throw new BadRequestException('This group is used by the system and cannot be deleted');
    }

    const customersInGroup = await this.prisma.customer.count({ where: { groupId: id } });
    if (customersInGroup > 0) {
      throw new ConflictException('Reassign the customers in this group before deleting it');
    }

    await this.prisma.customerGroup.delete({ where: { id } });
  }

  /**
   * Returns the organization's group for the given system flag, creating it
   * with a default name if it's missing (e.g. for orgs created before this
   * catalog existed, or with the flag cleared by a bad migration).
   */
  async getOrCreateSystemGroup(
    organizationId: number,
    flag: 'isDefault' | 'isFrequentBuyerTarget',
    fallbackName: string,
  ) {
    const existing = await this.prisma.customerGroup.findFirst({ where: { organizationId, [flag]: true } });
    if (existing) return existing;

    return this.prisma.customerGroup.create({
      data: { organizationId, name: fallbackName, [flag]: true },
    });
  }
}
