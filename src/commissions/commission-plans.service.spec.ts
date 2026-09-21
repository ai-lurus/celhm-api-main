import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CommissionPlansService } from './commission-plans.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { resolveEffectiveRule } from './effective-commission-rule';

describe('CommissionPlansService', () => {
  let service: CommissionPlansService;

  const mockPrisma = {
    commissionPlan: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    commissionRule: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    orgMembership: { findFirst: jest.fn() },
    organization: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.organization.findUnique.mockResolvedValue({ timezone: 'America/Mexico_City' });
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
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

  it('revise closes the open rule one millisecond before today starts and creates the new one from the start of today', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-21T16:00:00.000Z')); // 10:00 in Mexico City
    try {
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
      mockPrisma.commissionRule.findMany.mockResolvedValue([
        { id: 5, validFrom: new Date('2026-08-01T06:00:00.000Z'), validTo: null },
      ]);
      mockPrisma.commissionRule.update.mockResolvedValue({});
      mockPrisma.commissionRule.create.mockResolvedValue({ id: 6 });

      const result = await service.reviseRule(5, 1, { calcMethod: 'PERCENTAGE', value: 8 } as any);

      expect(mockPrisma.commissionRule.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { validTo: new Date('2026-09-21T05:59:59.999Z') },
      });
      expect(mockPrisma.commissionRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          planId: 2,
          membershipId: null,
          value: 8,
          validFrom: new Date('2026-09-21T06:00:00.000Z'),
        }),
      });
      expect(result).toEqual({ id: 6 });
    } finally {
      jest.useRealTimers();
    }
  });

  it('lists override rules for a membership in the caller org', async () => {
    mockPrisma.orgMembership.findFirst.mockResolvedValue({ id: 9, organizationId: 1 });
    mockPrisma.commissionRule.findMany.mockResolvedValue([{ id: 1, membershipId: 9 }]);

    const result = await service.listOverrides(9, 1);

    expect(mockPrisma.orgMembership.findFirst).toHaveBeenCalledWith({ where: { id: 9, organizationId: 1 } });
    expect(mockPrisma.commissionRule.findMany).toHaveBeenCalledWith({
      where: { membershipId: 9 },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual([{ id: 1, membershipId: 9 }]);
  });

  it('throws NotFoundException when listing overrides for a membership outside the org', async () => {
    mockPrisma.orgMembership.findFirst.mockResolvedValue(null);
    await expect(service.listOverrides(9, 1)).rejects.toThrow(NotFoundException);
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

describe('CommissionPlansService.listKnownCategories', () => {
  let service: CommissionPlansService;

  const mockPrisma = {
    product: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommissionPlansService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(CommissionPlansService);
  });

  it('returns distinct non-null product categories for the organization', async () => {
    mockPrisma.product.findMany.mockResolvedValue([
      { category: { name: 'Accesorios' } },
      { category: { name: 'Pantallas' } },
    ]);

    const result = await service.listKnownCategories(1);

    expect(mockPrisma.product.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, categoryId: { not: null } },
      select: { category: { select: { name: true } } },
      distinct: ['categoryId'],
    });
    expect(result).toEqual(['Accesorios', 'Pantallas']);
  });
});

/**
 * In-memory commission_rules table: proves what the rows look like after a write,
 * and that the resolver then sees exactly one winner (no silent tie).
 */
describe('CommissionPlansService rule start and same-scope replacement', () => {
  const NOW = new Date('2026-09-21T16:00:00.000Z'); // 10:00 in America/Mexico_City
  const START_OF_TODAY = new Date('2026-09-21T06:00:00.000Z');
  const ONE_MS_BEFORE = new Date('2026-09-21T05:59:59.999Z');

  let service: CommissionPlansService;
  let rules: any[];
  let nextId: number;

  const matches = (rule: any, where: any): boolean =>
    Object.entries(where).every(([key, expected]: [string, any]) => {
      if (key === 'OR') {
        return expected.some((clause: any) => matches(rule, clause));
      }
      if (expected && typeof expected === 'object' && 'gt' in expected) {
        return rule[key] !== null && rule[key] > expected.gt;
      }
      return rule[key] === expected;
    });

  const prisma: any = {
    organization: { findUnique: jest.fn() },
    commissionPlan: { findFirst: jest.fn() },
    orgMembership: { findFirst: jest.fn() },
    commissionRule: {
      findMany: jest.fn(async ({ where }: any) => rules.filter((r) => matches(r, where))),
      update: jest.fn(async ({ where, data }: any) => Object.assign(rules.find((r) => r.id === where.id), data)),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextId++, planId: null, membershipId: null, validTo: null, ...data };
        rules.push(row);
        return row;
      }),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };

  const existing = (overrides: any = {}) => ({
    id: 1,
    planId: null,
    membershipId: 9,
    basis: 'SALE_TOTAL',
    scopeType: 'GENERAL',
    scopeValue: null,
    calcMethod: 'PERCENTAGE',
    value: 5,
    validFrom: new Date('2026-08-01T06:00:00.000Z'),
    validTo: null,
    ...overrides,
  });

  const newOverride = (overrides: any = {}) => ({
    membershipId: 9,
    basis: 'SALE_TOTAL',
    scopeType: 'GENERAL',
    calcMethod: 'PERCENTAGE',
    value: 7,
    ...overrides,
  });

  const winnerAt = (instant: Date) =>
    resolveEffectiveRule(
      { commissionPlan: null, overrideRules: rules.filter((r) => r.membershipId === 9) },
      { date: instant, productCategory: null, customerGroupId: null },
    );

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
    rules = [];
    nextId = 100;
    prisma.organization.findUnique.mockResolvedValue({ timezone: 'America/Mexico_City' });
    prisma.orgMembership.findFirst.mockResolvedValue({ id: 9, organizationId: 1 });
    prisma.commissionPlan.findFirst.mockResolvedValue({ id: 2, organizationId: 1 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommissionPlansService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CommissionPlansService);
  });

  afterEach(() => jest.useRealTimers());

  it('starts a new override at the start of today in the org timezone, not at the current time', async () => {
    const created = await service.createOverride(1, newOverride() as any);
    expect(created.validFrom).toEqual(START_OF_TODAY);
  });

  it('accepts a future day (date-only) and starts it at 00:00 local of that day', async () => {
    const created = await service.createOverride(1, newOverride({ validFrom: '2026-09-25' }) as any);
    expect(created.validFrom).toEqual(new Date('2026-09-25T06:00:00.000Z'));
  });

  it('rejects a start day before today and writes nothing', async () => {
    await expect(service.createOverride(1, newOverride({ validFrom: '2026-09-20' }) as any)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.commissionRule.create).not.toHaveBeenCalled();
  });

  it('adding a rule for the same employee and scope closes the previous one and leaves a single winner (no tie)', async () => {
    rules = [existing()];

    const created = await service.createOverride(1, newOverride() as any);

    expect(rules[0].validTo).toEqual(ONE_MS_BEFORE);
    const result = winnerAt(NOW);
    expect(result?.rule.id).toBe(created.id);
    expect(result?.hadTie).toBe(false);
  });

  it('replaces regardless of basis, because the resolver ranks by scope only', async () => {
    rules = [existing({ basis: 'PROFIT' })];
    await service.createOverride(1, newOverride({ basis: 'SALE_TOTAL' }) as any);
    expect(rules[0].validTo).toEqual(ONE_MS_BEFORE);
  });

  it('closes a legacy rule that started earlier the same day with an intraday timestamp', async () => {
    rules = [existing({ validFrom: new Date('2026-09-21T18:10:15.580Z') })];

    const created = await service.createOverride(1, newOverride() as any);

    expect(rules[0].validTo).toEqual(ONE_MS_BEFORE);
    const later = winnerAt(new Date('2026-09-21T20:00:00.000Z'));
    expect(later?.rule.id).toBe(created.id);
    expect(later?.hadTie).toBe(false);
  });

  it('leaves rules of another scope, another value of the same scope type, or another employee alone', async () => {
    rules = [
      existing({ id: 1, scopeType: 'PRODUCT_CATEGORY', scopeValue: 'Accesorios' }),
      existing({ id: 2, membershipId: 10 }),
    ];

    await service.createOverride(1, newOverride() as any); // GENERAL for employee 9
    await service.createOverride(1, newOverride({ scopeType: 'PRODUCT_CATEGORY', scopeValue: 'Pantallas' }) as any);

    expect(rules.find((r) => r.id === 1).validTo).toBeNull();
    expect(rules.find((r) => r.id === 2).validTo).toBeNull();
  });

  it('closes the same category scope but only that category', async () => {
    rules = [
      existing({ id: 1, scopeType: 'PRODUCT_CATEGORY', scopeValue: 'Accesorios' }),
      existing({ id: 2, scopeType: 'PRODUCT_CATEGORY', scopeValue: 'Pantallas' }),
    ];

    await service.createOverride(1, newOverride({ scopeType: 'PRODUCT_CATEGORY', scopeValue: 'Accesorios' }) as any);

    expect(rules.find((r) => r.id === 1).validTo).toEqual(ONE_MS_BEFORE);
    expect(rules.find((r) => r.id === 2).validTo).toBeNull();
  });

  it('does not touch a rule that already ended', async () => {
    const expiredTo = new Date('2026-08-31T05:59:59.999Z');
    rules = [existing({ validTo: expiredTo })];

    await service.createOverride(1, newOverride() as any);

    expect(rules[0].validTo).toEqual(expiredTo);
    expect(prisma.commissionRule.update).not.toHaveBeenCalled();
  });

  it('refuses to overwrite a rule scheduled for a later day, and writes nothing', async () => {
    rules = [existing({ validFrom: new Date('2026-10-01T06:00:00.000Z') })];

    await expect(service.createOverride(1, newOverride() as any)).rejects.toThrow(ConflictException);

    expect(prisma.commissionRule.create).not.toHaveBeenCalled();
    expect(prisma.commissionRule.update).not.toHaveBeenCalled();
  });

  it('also replaces plan rules of the same scope (same tie risk)', async () => {
    rules = [existing({ id: 1, planId: 2, membershipId: null })];

    await service.addRule(2, 1, { basis: 'SALE_TOTAL', scopeType: 'GENERAL', calcMethod: 'PERCENTAGE', value: 9 } as any);

    expect(rules[0].validTo).toEqual(ONE_MS_BEFORE);
    expect(rules[1]).toEqual(expect.objectContaining({ planId: 2, validFrom: START_OF_TODAY }));
  });

  it('revise on an already expired rule creates the new one without reopening the old one', async () => {
    const expiredTo = new Date('2026-08-31T05:59:59.999Z');
    rules = [existing({ validTo: expiredTo })];
    prisma.commissionRule.findFirst = jest.fn().mockResolvedValue({ ...rules[0], plan: null, membership: { organizationId: 1 } });

    await service.reviseRule(1, 1, { calcMethod: 'PERCENTAGE', value: 6 } as any);

    expect(rules[0].validTo).toEqual(expiredTo);
    expect(rules[1].validFrom).toEqual(START_OF_TODAY);
  });
});
