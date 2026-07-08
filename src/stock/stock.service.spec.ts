import { Test, TestingModule } from '@nestjs/testing';
import { StockService } from './stock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthUser } from '../auth/auth.service';
import { Role } from '@prisma/client';

describe('StockService', () => {
  let service: StockService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    stock: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    product: {
      update: jest.fn(),
    },
    variant: {
      update: jest.fn(),
    },
  };

  const mockUser: AuthUser = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    role: Role.ADMINISTRADOR,
    organizationId: 1,
    branchId: 1,
  } as AuthUser;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<StockService>(StockService);
  });

  describe('updateInventoryItem', () => {
    it('persists the barcode when updating an inventory item', async () => {
      const stockId = 1;
      const existingStock = {
        id: stockId,
        qty: 10,
        min: 2,
        max: 100,
        variantId: 5,
        variant: {
          id: 5,
          productId: 9,
          sku: 'SKU-1',
          name: 'Pantalla',
          price: 100,
          product: {
            id: 9,
            name: 'Pantalla',
            brand: 'Generic',
            model: 'X',
          },
        },
      };

      mockPrismaService.stock.findFirst.mockResolvedValue(existingStock);
      mockPrismaService.product.update.mockReturnValue({});
      mockPrismaService.variant.update.mockReturnValue({});
      mockPrismaService.stock.update.mockReturnValue({});
      mockPrismaService.$transaction.mockImplementation((ops: any[]) => Promise.resolve(ops));

      await service.updateInventoryItem(
        stockId,
        { barcode: '7501234567890' } as any,
        mockUser,
      );

      expect(mockPrismaService.variant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ barcode: '7501234567890' }),
        }),
      );
    });
  });
});
