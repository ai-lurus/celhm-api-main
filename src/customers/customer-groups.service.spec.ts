import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CustomerGroupsService } from './customer-groups.service';
import { PrismaService } from '../common/prisma/prisma.service';

describe('CustomerGroupsService', () => {
  let service: CustomerGroupsService;

  const mockPrismaService = {
    customerGroup: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    customer: {
      count: jest.fn(),
    },
  };

  const uniqueConstraintError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerGroupsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CustomerGroupsService>(CustomerGroupsService);
  });

  describe('create', () => {
    it('creates a group scoped to the organization', async () => {
      mockPrismaService.customerGroup.create.mockResolvedValue({ id: 1, name: 'Mayorista', organizationId: 10 });

      await service.create({ name: 'Mayorista' }, 10);

      expect(mockPrismaService.customerGroup.create).toHaveBeenCalledWith({
        data: { name: 'Mayorista', organizationId: 10 },
      });
    });

    it('rejects a duplicate name within the same organization', async () => {
      mockPrismaService.customerGroup.create.mockRejectedValue(uniqueConstraintError);

      await expect(service.create({ name: 'General' }, 10)).rejects.toThrow(ConflictException);
    });
  });

  describe('rename', () => {
    it('renames a group belonging to the organization', async () => {
      mockPrismaService.customerGroup.findFirst.mockResolvedValue({ id: 1, organizationId: 10 });
      mockPrismaService.customerGroup.update.mockResolvedValue({ id: 1, name: 'VIP' });

      await service.rename(1, { name: 'VIP' }, 10);

      expect(mockPrismaService.customerGroup.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'VIP' },
      });
    });

    it('throws when the group does not belong to the organization', async () => {
      mockPrismaService.customerGroup.findFirst.mockResolvedValue(null);

      await expect(service.rename(1, { name: 'VIP' }, 10)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes an empty, non-system group', async () => {
      mockPrismaService.customerGroup.findFirst.mockResolvedValue({
        id: 3,
        organizationId: 10,
        isDefault: false,
        isFrequentBuyerTarget: false,
      });
      mockPrismaService.customer.count.mockResolvedValue(0);

      await service.remove(3, 10);

      expect(mockPrismaService.customerGroup.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    });

    it('refuses to delete a system-protected group', async () => {
      mockPrismaService.customerGroup.findFirst.mockResolvedValue({
        id: 1,
        organizationId: 10,
        isDefault: true,
        isFrequentBuyerTarget: false,
      });

      await expect(service.remove(1, 10)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.customerGroup.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a group that still has customers assigned', async () => {
      mockPrismaService.customerGroup.findFirst.mockResolvedValue({
        id: 3,
        organizationId: 10,
        isDefault: false,
        isFrequentBuyerTarget: false,
      });
      mockPrismaService.customer.count.mockResolvedValue(2);

      await expect(service.remove(3, 10)).rejects.toThrow(ConflictException);
      expect(mockPrismaService.customerGroup.delete).not.toHaveBeenCalled();
    });
  });

  describe('getOrCreateSystemGroup', () => {
    it('returns the existing flagged group without creating a new one', async () => {
      mockPrismaService.customerGroup.findFirst.mockResolvedValue({ id: 9, isDefault: true });

      const result = await service.getOrCreateSystemGroup(10, 'isDefault', 'General');

      expect(result).toEqual({ id: 9, isDefault: true });
      expect(mockPrismaService.customerGroup.create).not.toHaveBeenCalled();
    });

    it('creates the flagged group when the organization has none yet', async () => {
      mockPrismaService.customerGroup.findFirst.mockResolvedValue(null);
      mockPrismaService.customerGroup.create.mockResolvedValue({ id: 11, isDefault: true, name: 'General' });

      const result = await service.getOrCreateSystemGroup(10, 'isDefault', 'General');

      expect(mockPrismaService.customerGroup.create).toHaveBeenCalledWith({
        data: { organizationId: 10, name: 'General', isDefault: true },
      });
      expect(result).toEqual({ id: 11, isDefault: true, name: 'General' });
    });
  });
});
