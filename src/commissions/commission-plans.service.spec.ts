import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CommissionPlansService } from './commission-plans.service';
import { PrismaService } from '../common/prisma/prisma.service';

describe('CommissionPlansService', () => {
  let service: CommissionPlansService;

  const mockPrisma = {
    commissionPlan: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    commissionRule: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommissionPlansService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(CommissionPlansService);
  });

  it('lists plans scoped to the organization', async () => {
    mockPrisma.commissionPlan.findMany.mockResolvedValue([{ id: 1 }]);
    const result = await service.findAll(1);
    expect(mockPrisma.commissionPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 1 } }),
    );
    expect(result).toEqual([{ id: 1 }]);
  });

  it('creates a plan under the caller organization', async () => {
    mockPrisma.commissionPlan.create.mockResolvedValue({ id: 1, name: 'Vendedor estándar' });
    await service.create(1, { name: 'Vendedor estándar' } as any);
    expect(mockPrisma.commissionPlan.create).toHaveBeenCalledWith({
      data: { organizationId: 1, name: 'Vendedor estándar', role: undefined },
    });
  });

  it('throws NotFoundException when adding a rule to a plan outside the org', async () => {
    mockPrisma.commissionPlan.findFirst.mockResolvedValue(null);
    await expect(
      service.addRule(1, 1, { basis: 'SALE_TOTAL', scopeType: 'GENERAL', calcMethod: 'PERCENTAGE', value: 5 } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('revise closes the old rule and creates a new one with the updated value', async () => {
    mockPrisma.commissionRule.findFirst.mockResolvedValue({
      id: 5,
      planId: 2,
      membershipId: null,
      basis: 'SALE_TOTAL',
      scopeType: 'GENERAL',
      scopeValue: null,
      plan: { organizationId: 1 },
      membership: null,
    });
    mockPrisma.commissionRule.update.mockResolvedValue({});
    mockPrisma.commissionRule.create.mockResolvedValue({ id: 6 });

    const result = await service.reviseRule(5, 1, { calcMethod: 'PERCENTAGE', value: 8 } as any);

    expect(mockPrisma.commissionRule.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { validTo: expect.any(Date) },
    });
    expect(mockPrisma.commissionRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ planId: 2, membershipId: null, value: 8 }),
    });
    expect(result).toEqual({ id: 6 });
  });
});

describe('CommissionPlansService.preview', () => {
  let service: CommissionPlansService;

  const mockPrisma = {
    orgMembership: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommissionPlansService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(CommissionPlansService);
  });

  it('reports the winning rule for GENERAL, each known product category, and each known customer group', async () => {
    mockPrisma.orgMembership.findFirst.mockResolvedValue({
      id: 1,
      commissionPlan: {
        active: true,
        rules: [
          { id: 1, scopeType: 'GENERAL', scopeValue: null, basis: 'SALE_TOTAL', calcMethod: 'PERCENTAGE', value: 5, validFrom: new Date('2026-01-01'), validTo: null },
          { id: 2, scopeType: 'PRODUCT_CATEGORY', scopeValue: 'Accesorios', basis: 'SALE_TOTAL', calcMethod: 'PERCENTAGE', value: 2, validFrom: new Date('2026-01-01'), validTo: null },
        ],
      },
      overrideRules: [],
    });

    const result = await service.preview(1, 1, new Date('2026-06-01'), ['Accesorios', 'Configuraciones'], []);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scopeLabel: 'General', ruleId: 1, value: 5 }),
        expect.objectContaining({ scopeLabel: 'Categoría: Accesorios', ruleId: 2, value: 2 }),
        expect.objectContaining({ scopeLabel: 'Categoría: Configuraciones', ruleId: 1, value: 5 }),
      ]),
    );
  });
});
