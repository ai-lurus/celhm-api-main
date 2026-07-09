import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { CustomerGroupsService } from './customer-groups.service';

describe('CustomersService', () => {
  let service: CustomersService;

  const mockPrismaService = {
    $queryRaw: jest.fn(),
    customer: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    customerGroup: {
      findFirst: jest.fn(),
    },
  };

  const mockCustomerGroupsService = {
    getOrCreateSystemGroup: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.customer.findMany.mockResolvedValue([]);
    mockPrismaService.customer.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CustomerGroupsService, useValue: mockCustomerGroupsService },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  describe('create', () => {
    it('assigns the organization\'s default group to a new customer', async () => {
      mockCustomerGroupsService.getOrCreateSystemGroup.mockResolvedValue({ id: 5, name: 'General' });
      mockPrismaService.customer.create.mockResolvedValue({ id: 1, groupId: 5 });

      await service.create({ name: 'Ana', phone: '5512345678' } as any, 10);

      expect(mockCustomerGroupsService.getOrCreateSystemGroup).toHaveBeenCalledWith(10, 'isDefault', 'General');
      const createArgs = mockPrismaService.customer.create.mock.calls[0][0];
      expect(createArgs.data.groupId).toBe(5);
    });

    it('assigns the given group when one is provided', async () => {
      mockPrismaService.customerGroup.findFirst.mockResolvedValue({ id: 7, organizationId: 10, name: 'Mayorista' });
      mockPrismaService.customer.create.mockResolvedValue({ id: 1, groupId: 7 });

      await service.create({ name: 'Ana', phone: '5512345678', groupId: 7 } as any, 10);

      expect(mockCustomerGroupsService.getOrCreateSystemGroup).not.toHaveBeenCalled();
      const createArgs = mockPrismaService.customer.create.mock.calls[0][0];
      expect(createArgs.data.groupId).toBe(7);
    });

    it('rejects a group that does not belong to the organization', async () => {
      mockPrismaService.customerGroup.findFirst.mockResolvedValue(null);

      await expect(
        service.create({ name: 'Ana', phone: '5512345678', groupId: 999 } as any, 10),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.customer.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('ignores a groupId in the body (group changes go through updateGroup)', async () => {
      await service.update(1, { name: 'Ana Updated', groupId: 7 } as any, 10);

      expect(mockPrismaService.customer.updateMany).toHaveBeenCalledWith({
        where: { id: 1, organizationId: 10 },
        data: { name: 'Ana Updated' },
      });
    });
  });

  describe('findAll', () => {
    it('matches customers regardless of accents in the search term', async () => {
      // "Núñez" is stored with an accent; a user searching without one ("nunez")
      // must still find it. This requires accent-insensitive matching, which
      // plain Prisma `contains` (ILIKE) does not provide.
      mockPrismaService.$queryRaw.mockResolvedValue([{ id: 42 }]);

      await service.findAll(1, { q: 'nunez' });

      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();

      const findManyArgs = mockPrismaService.customer.findMany.mock.calls[0][0];
      expect(findManyArgs.where.id).toEqual({ in: [42] });
    });

    it('returns no results without querying candidates when nothing matches', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const result = await service.findAll(1, { q: 'zzz-no-match' });

      const findManyArgs = mockPrismaService.customer.findMany.mock.calls[0][0];
      expect(findManyArgs.where.id).toEqual({ in: [] });
      expect(result.data).toEqual([]);
    });

    it('does not restrict by id when no search term is given', async () => {
      await service.findAll(1, {});

      expect(mockPrismaService.$queryRaw).not.toHaveBeenCalled();
      const findManyArgs = mockPrismaService.customer.findMany.mock.calls[0][0];
      expect(findManyArgs.where.id).toBeUndefined();
    });
  });

  describe('registerPurchase', () => {
    const baseCustomer = {
      id: 1,
      organizationId: 10,
      purchaseCount: 1,
      group: { isFrequentBuyerTarget: false },
      organization: { frequentBuyerThreshold: 3 },
    };

    it('increments the purchase count without promoting when below the threshold', async () => {
      mockPrismaService.customer.findUnique.mockResolvedValue({ ...baseCustomer, purchaseCount: 1 });

      await service.registerPurchase(1);

      expect(mockCustomerGroupsService.getOrCreateSystemGroup).not.toHaveBeenCalled();
      expect(mockPrismaService.customer.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { purchaseCount: 2 },
      });
    });

    it('promotes the customer to the frequent-buyer group once the threshold is reached', async () => {
      mockPrismaService.customer.findUnique.mockResolvedValue({ ...baseCustomer, purchaseCount: 2 });
      mockCustomerGroupsService.getOrCreateSystemGroup.mockResolvedValue({ id: 99, name: 'Cliente Frecuente' });

      await service.registerPurchase(1);

      expect(mockCustomerGroupsService.getOrCreateSystemGroup).toHaveBeenCalledWith(
        10,
        'isFrequentBuyerTarget',
        'Cliente Frecuente',
      );
      expect(mockPrismaService.customer.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { purchaseCount: 3, groupId: 99 },
      });
    });

    it('respects a lower organization-configured threshold', async () => {
      mockPrismaService.customer.findUnique.mockResolvedValue({
        ...baseCustomer,
        purchaseCount: 0,
        organization: { frequentBuyerThreshold: 1 },
      });
      mockCustomerGroupsService.getOrCreateSystemGroup.mockResolvedValue({ id: 99, name: 'Cliente Frecuente' });

      await service.registerPurchase(1);

      expect(mockPrismaService.customer.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { purchaseCount: 1, groupId: 99 },
      });
    });

    it('does not re-trigger promotion once already in the frequent-buyer group', async () => {
      mockPrismaService.customer.findUnique.mockResolvedValue({
        ...baseCustomer,
        purchaseCount: 5,
        group: { isFrequentBuyerTarget: true },
      });

      await service.registerPurchase(1);

      expect(mockCustomerGroupsService.getOrCreateSystemGroup).not.toHaveBeenCalled();
      expect(mockPrismaService.customer.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { purchaseCount: 6 },
      });
    });

    it('does nothing when the customer does not exist', async () => {
      mockPrismaService.customer.findUnique.mockResolvedValue(null);

      await service.registerPurchase(999);

      expect(mockPrismaService.customer.update).not.toHaveBeenCalled();
    });
  });

  describe('updateGroup', () => {
    it('updates the group without touching the purchase count', async () => {
      mockPrismaService.customer.findFirst.mockResolvedValue({ id: 1, purchaseCount: 5 });
      mockPrismaService.customerGroup.findFirst.mockResolvedValue({ id: 7, organizationId: 10, name: 'Mayorista' });
      mockPrismaService.customer.update.mockResolvedValue({ id: 1, groupId: 7 });

      await service.updateGroup(1, 7, 10);

      expect(mockPrismaService.customerGroup.findFirst).toHaveBeenCalledWith({ where: { id: 7, organizationId: 10 } });
      expect(mockPrismaService.customer.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { groupId: 7 },
        include: { group: true },
      });
    });

    it('throws when the customer does not belong to the organization', async () => {
      mockPrismaService.customer.findFirst.mockResolvedValue(null);

      await expect(service.updateGroup(1, 7, 10)).rejects.toThrow(NotFoundException);
    });

    it('throws when the group does not belong to the organization', async () => {
      mockPrismaService.customer.findFirst.mockResolvedValue({ id: 1 });
      mockPrismaService.customerGroup.findFirst.mockResolvedValue(null);

      await expect(service.updateGroup(1, 7, 10)).rejects.toThrow(BadRequestException);
    });
  });
});
