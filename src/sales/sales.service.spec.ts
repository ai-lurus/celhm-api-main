import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { FoliosService } from '../folios/folios.service';
import { CommissionsService } from '../commissions/commissions.service';
import { AuthUser } from '../auth/auth.service';
import { Role, SaleStatus } from '@prisma/client';

describe('SalesService', () => {
  let service: SalesService;

  const mockPrismaService = {
    sale: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cashCut: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    payment: {
      create: jest.fn(),
    },
    movement: {
      create: jest.fn(),
    },
    stock: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockFoliosService = {
    next: jest.fn(),
  };

  const mockCommissionsService = {
    createCommissionForSale: jest.fn(),
    createCommissionForProductSale: jest.fn(),
  };

  const mockUser: AuthUser = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    role: Role.ADMINISTRADOR,
    organizationId: 1,
    branchId: 1,
  } as AuthUser;

  const baseOriginalSale = {
    id: 100,
    branchId: 1,
    folio: 'VTA-001-202607-0001',
    customerId: null,
    status: SaleStatus.PAGADO,
    isReturn: false,
    branch: { organizationId: 1, organization: { vatRate: 0.16 } },
    payments: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: FoliosService, useValue: mockFoliosService },
        { provide: CommissionsService, useValue: mockCommissionsService },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);

    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 999 } as any);

    mockFoliosService.next.mockResolvedValue('DEV-001-202607-0001');
    mockPrismaService.cashCut.findFirst.mockResolvedValue({ id: 5, status: 'OPEN', cashRegisterId: 1 });
    mockPrismaService.sale.create.mockResolvedValue({ id: 999, lines: [] });
    mockPrismaService.payment.create.mockResolvedValue({});
    mockPrismaService.movement.create.mockReturnValue({});
    mockPrismaService.stock.updateMany.mockReturnValue({});
    mockPrismaService.$transaction.mockImplementation((ops: any[]) => Promise.resolve(ops));
    mockPrismaService.sale.findMany.mockResolvedValue([]);
  });

  describe('createReturn', () => {
    it('rejects a return once the full quantity has already been returned in a prior return', async () => {
      mockPrismaService.sale.findFirst.mockResolvedValue({
        ...baseOriginalSale,
        lines: [
          {
            id: 10,
            variantId: 5,
            description: 'Pantalla',
            qty: 2,
            unitPrice: 100,
            discount: 0,
            variant: { product: { tracksInventory: true } },
          },
        ],
      });

      // A previous return already took back both units of variant 5.
      mockPrismaService.sale.findMany.mockResolvedValue([
        {
          id: 500,
          returnOfSaleId: 100,
          isReturn: true,
          lines: [{ variantId: 5, qty: 2 }],
        },
      ]);

      await expect(
        service.createReturn(
          100,
          { cashRegisterId: 1, refundMethod: 'EFECTIVO' as any, lines: [{ saleLineId: 10, qty: 1 }] },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('prorates the original per-line discount when calculating the refundable amount', async () => {
      mockPrismaService.sale.findFirst.mockResolvedValue({
        ...baseOriginalSale,
        lines: [
          {
            id: 20,
            variantId: 7,
            description: 'Batería',
            qty: 2,
            unitPrice: 100,
            discount: 20, // $20 total discount across the 2 units => net $90/unit
            variant: { product: { tracksInventory: true } },
          },
        ],
      });

      await service.createReturn(
        100,
        { cashRegisterId: 1, refundMethod: 'EFECTIVO' as any, lines: [{ saleLineId: 20, qty: 1 }] },
        mockUser,
      );

      const createArgs = mockPrismaService.sale.create.mock.calls[0][0];
      const createdLine = createArgs.data.lines.create[0];

      expect(createdLine.unitPrice).toBe(-90);
      expect(createdLine.total).toBe(-90);
    });
  });

  describe('cancelSale', () => {
    const basePendingSale = {
      id: 200,
      branchId: 1,
      folio: 'VTA-001-202607-0002',
      status: SaleStatus.PENDIENTE,
      payments: [] as { amount: number }[],
      lines: [] as any[],
    };

    it('rejects when the sale is not PENDIENTE', async () => {
      mockPrismaService.sale.findFirst.mockResolvedValue({
        ...basePendingSale,
        status: SaleStatus.PAGADO,
      });

      await expect(service.cancelSale(200, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('rejects when the sale already has a payment registered', async () => {
      mockPrismaService.sale.findFirst.mockResolvedValue({
        ...basePendingSale,
        payments: [{ amount: 50 }],
      });

      await expect(service.cancelSale(200, mockUser)).rejects.toThrow(ConflictException);
    });

    it('restores stock and marks the sale as CANCELADO', async () => {
      mockPrismaService.sale.findFirst.mockResolvedValue({
        ...basePendingSale,
        lines: [
          {
            variantId: 5,
            qty: 3,
            variant: { product: { tracksInventory: true } },
          },
        ],
      });
      mockPrismaService.sale.update.mockResolvedValue({ ...basePendingSale, status: SaleStatus.CANCELADO });

      await service.cancelSale(200, mockUser);

      expect(mockPrismaService.movement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          branchId: 1,
          variantId: 5,
          qty: 3,
          type: 'DEV',
          folio: 'VTA-001-202607-0002',
        }),
      });
      expect(mockPrismaService.stock.updateMany).toHaveBeenCalledWith({
        where: { branchId: 1, variantId: 5 },
        data: { qty: { increment: 3 } },
      });
      expect(mockPrismaService.sale.update).toHaveBeenCalledWith({
        where: { id: 200 },
        data: { status: SaleStatus.CANCELADO },
      });
    });

    it('skips stock restoration for lines whose product does not track inventory', async () => {
      mockPrismaService.sale.findFirst.mockResolvedValue({
        ...basePendingSale,
        lines: [
          {
            variantId: 9,
            qty: 1,
            variant: { product: { tracksInventory: false } },
          },
        ],
      });
      mockPrismaService.sale.update.mockResolvedValue({ ...basePendingSale, status: SaleStatus.CANCELADO });

      await service.cancelSale(200, mockUser);

      expect(mockPrismaService.movement.create).not.toHaveBeenCalled();
      expect(mockPrismaService.stock.updateMany).not.toHaveBeenCalled();
    });
  });
});
