import { Test, TestingModule } from '@nestjs/testing';
import { StockService } from './stock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthUser } from '../auth/auth.service';
import { Role } from '@prisma/client';
import { SkuGeneratorService } from '../sku/sku-generator.service';

describe('StockService', () => {
  let service: StockService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    stock: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    product: {
      update: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    variant: {
      update: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockSkuGenerator = {
    next: jest.fn(),
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
        {
          provide: SkuGeneratorService,
          useValue: mockSkuGenerator,
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

  describe('createInventoryItem', () => {
    it('generates the sku from the mask for a new inline product', async () => {
      mockPrismaService.product.create.mockResolvedValue({ id: 1, name: 'Cable USB-C', categoryId: 2 });
      mockSkuGenerator.next.mockResolvedValue('CAC0001');
      mockPrismaService.variant.create.mockResolvedValue({ id: 1, sku: 'CAC0001' });
      mockPrismaService.stock.create.mockResolvedValue({ id: 1, qty: 10, min: 2 });

      await service.createInventoryItem(
        { name: 'Cable USB-C', categoryId: 2, qty: 10, min: 2 } as any,
        mockUser,
      );

      expect(mockSkuGenerator.next).toHaveBeenCalledWith(mockUser.organizationId, 2, 'Cable USB-C');
      expect(mockPrismaService.product.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ categoryId: 2 }) }),
      );
    });

    it('respects a manually provided sku without calling the generator', async () => {
      mockPrismaService.product.create.mockResolvedValue({ id: 1, name: 'Cable USB-C', categoryId: 2 });
      mockPrismaService.variant.create.mockResolvedValue({ id: 1, sku: 'MANUAL-1' });
      mockPrismaService.stock.create.mockResolvedValue({ id: 1, qty: 10, min: 2 });

      await service.createInventoryItem(
        { name: 'Cable USB-C', categoryId: 2, sku: 'MANUAL-1', qty: 10, min: 2 } as any,
        mockUser,
      );

      expect(mockSkuGenerator.next).not.toHaveBeenCalled();
    });

    it('throws when there is no sku and no category', async () => {
      mockPrismaService.product.create.mockResolvedValue({ id: 1, name: 'Cable USB-C', categoryId: null });

      await expect(
        service.createInventoryItem({ name: 'Cable USB-C', qty: 10, min: 2 } as any, mockUser),
      ).rejects.toThrow('categoría');
    });
  });
});
