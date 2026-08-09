import { Test, TestingModule } from '@nestjs/testing';
import { CommissionsService } from './commissions.service';
import { PrismaService } from '../common/prisma/prisma.service';

describe('CommissionsService.generateForSale', () => {
  let service: CommissionsService;

  const mockPrisma = {
    sale: { findUnique: jest.fn() },
    orgMembership: { findUnique: jest.fn() },
    ticketPart: { findMany: jest.fn() },
    commission: { findUnique: jest.fn(), create: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommissionsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(CommissionsService);
  });

  const baseSale = {
    id: 1,
    userId: 10,
    createdAt: new Date('2026-06-01'),
    branch: { organizationId: 1 },
    customer: null,
    lines: [] as any[],
  };

  it('does nothing when the sale has no lines', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({ ...baseSale, lines: [] });
    await service.generateForSale(1);
    expect(mockPrisma.commission.create).not.toHaveBeenCalled();
  });

  it('does nothing when the sale is not found', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(null);
    await service.generateForSale(1);
    expect(mockPrisma.commission.create).not.toHaveBeenCalled();
  });

  it('creates a PERCENTAGE/SALE_TOTAL commission for a product line matching a GENERAL plan rule', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({
      ...baseSale,
      lines: [
        {
          id: 501,
          ticketId: null,
          variantId: 20,
          qty: 1,
          total: 100,
          variant: { purchasePrice: 40, product: { category: 'Accesorios' } },
          ticket: null,
        },
      ],
    });
    mockPrisma.orgMembership.findUnique.mockResolvedValue({
      commissionPlan: {
        active: true,
        rules: [
          {
            id: 900,
            scopeType: 'GENERAL',
            scopeValue: null,
            basis: 'SALE_TOTAL',
            calcMethod: 'PERCENTAGE',
            value: 5,
            validFrom: new Date('2026-01-01'),
            validTo: null,
          },
        ],
      },
      overrideRules: [],
    });
    mockPrisma.commission.findUnique.mockResolvedValue(null);

    await service.generateForSale(1);

    expect(mockPrisma.commission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        saleId: 1,
        saleLineId: 501,
        userId: 10,
        ruleId: 900,
        basis: 'SALE_TOTAL',
        amount: 5,
        isEstimated: false,
        status: 'PENDIENTE',
      }),
    });
  });

  it('marks the commission as estimated when purchasePrice is missing on a PROFIT rule', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({
      ...baseSale,
      lines: [
        {
          id: 502,
          ticketId: null,
          variantId: 21,
          qty: 1,
          total: 100,
          variant: { purchasePrice: null, product: { category: 'Accesorios' } },
          ticket: null,
        },
      ],
    });
    mockPrisma.orgMembership.findUnique.mockResolvedValue({
      commissionPlan: {
        active: true,
        rules: [
          {
            id: 901,
            scopeType: 'GENERAL',
            scopeValue: null,
            basis: 'PROFIT',
            calcMethod: 'PERCENTAGE',
            value: 30,
            validFrom: new Date('2026-01-01'),
            validTo: null,
          },
        ],
      },
      overrideRules: [],
    });
    mockPrisma.commission.findUnique.mockResolvedValue(null);

    await service.generateForSale(1);

    expect(mockPrisma.commission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isEstimated: true, basis: 'PROFIT', amount: 30 }),
    });
  });

  it('skips a line when the responsible user has no matching rule', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({
      ...baseSale,
      lines: [
        {
          id: 503,
          ticketId: null,
          variantId: 22,
          qty: 1,
          total: 100,
          variant: { purchasePrice: 40, product: { category: 'Accesorios' } },
          ticket: null,
        },
      ],
    });
    mockPrisma.orgMembership.findUnique.mockResolvedValue({ commissionPlan: null, overrideRules: [] });

    await service.generateForSale(1);

    expect(mockPrisma.commission.create).not.toHaveBeenCalled();
  });

  it('does not create a duplicate commission for a line that already has one', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({
      ...baseSale,
      lines: [
        {
          id: 504,
          ticketId: null,
          variantId: 23,
          qty: 1,
          total: 100,
          variant: { purchasePrice: 40, product: { category: 'Accesorios' } },
          ticket: null,
        },
      ],
    });
    mockPrisma.orgMembership.findUnique.mockResolvedValue({
      commissionPlan: {
        active: true,
        rules: [
          {
            id: 902,
            scopeType: 'GENERAL',
            scopeValue: null,
            basis: 'SALE_TOTAL',
            calcMethod: 'PERCENTAGE',
            value: 5,
            validFrom: new Date('2026-01-01'),
            validTo: null,
          },
        ],
      },
      overrideRules: [],
    });
    mockPrisma.commission.findUnique.mockResolvedValue({ id: 999 });

    await service.generateForSale(1);

    expect(mockPrisma.commission.create).not.toHaveBeenCalled();
  });

  it('computes PROFIT for a ticket line from TicketPart costs and picks the assigned technician', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({
      ...baseSale,
      lines: [
        {
          id: 505,
          ticketId: 77,
          variantId: null,
          qty: 1,
          total: 500,
          variant: null,
          ticket: { id: 77, assignedUserId: 33, userId: 10, finalCost: 500 },
        },
      ],
    });
    mockPrisma.ticketPart.findMany.mockResolvedValue([
      { qty: 2, variant: { purchasePrice: 50 } },
    ]);
    mockPrisma.orgMembership.findUnique.mockResolvedValue({
      commissionPlan: {
        active: true,
        rules: [
          {
            id: 903,
            scopeType: 'GENERAL',
            scopeValue: null,
            basis: 'PROFIT',
            calcMethod: 'PERCENTAGE',
            value: 30,
            validFrom: new Date('2026-01-01'),
            validTo: null,
          },
        ],
      },
      overrideRules: [],
    });
    mockPrisma.commission.findUnique.mockResolvedValue(null);

    await service.generateForSale(1);

    // profit = 500 - (2 * 50) = 400; amount = 400 * 30 / 100 = 120
    expect(mockPrisma.orgMembership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_userId: { organizationId: 1, userId: 33 } },
      }),
    );
    expect(mockPrisma.commission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 120, isEstimated: false }),
    });
  });
});

describe('CommissionsService.generateForReturn', () => {
  let service: CommissionsService;

  const mockPrisma = {
    commission: { findFirst: jest.fn(), create: jest.fn() },
    saleLine: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommissionsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(CommissionsService);
  });

  it('creates a prorated negative commission mirroring the original rule', async () => {
    mockPrisma.commission.findFirst.mockResolvedValue({
      id: 1,
      ruleId: 900,
      ticketId: null,
      userId: 10,
      basis: 'SALE_TOTAL',
      scopeLabel: 'Categoría: Accesorios',
      isEstimated: false,
      amount: 10,
      rate: 5,
      saleTotal: 200,
    });
    mockPrisma.saleLine.findUnique
      .mockResolvedValueOnce({ id: 700, qty: 1 }) // return line
      .mockResolvedValueOnce({ id: 501, qty: 2 }); // original line (qty 2, returning 1 = 50%)

    await service.generateForReturn(99, new Map([[700, 501]]));

    expect(mockPrisma.commission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        saleId: 99,
        saleLineId: 700,
        userId: 10,
        ruleId: 900,
        amount: -5,
        saleTotal: -100,
        status: 'PENDIENTE',
      }),
    });
  });

  it('does nothing when the original line never earned a commission', async () => {
    mockPrisma.commission.findFirst.mockResolvedValue(null);

    await service.generateForReturn(99, new Map([[700, 501]]));

    expect(mockPrisma.commission.create).not.toHaveBeenCalled();
  });
});
