import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { SkuGeneratorService } from '../sku/sku-generator.service';

describe('CatalogService', () => {
  let service: CatalogService;

  const mockPrismaService = {
    product: {
      findUnique: jest.fn(),
    },
    variant: {
      create: jest.fn(),
    },
  };

  const mockSkuGenerator = {
    next: jest.fn(),
    preview: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SkuGeneratorService, useValue: mockSkuGenerator },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
  });

  describe('createVariant', () => {
    it('uses the provided sku as-is without calling the generator', async () => {
      mockPrismaService.variant.create.mockResolvedValue({ id: 1, sku: 'MANUAL-1' });

      await service.createVariant({ productId: 1, sku: 'MANUAL-1' } as any, 1);

      expect(mockSkuGenerator.next).not.toHaveBeenCalled();
      expect(mockPrismaService.variant.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sku: 'MANUAL-1' }) }),
      );
    });

    it('generates the sku from the mask when omitted', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue({
        id: 1,
        name: 'Cable USB-C',
        categoryId: 2,
      });
      mockSkuGenerator.next.mockResolvedValue('CAC0001');
      mockPrismaService.variant.create.mockResolvedValue({ id: 1, sku: 'CAC0001' });

      await service.createVariant({ productId: 1 } as any, 1);

      expect(mockSkuGenerator.next).toHaveBeenCalledWith(1, 2, 'Cable USB-C');
      expect(mockPrismaService.variant.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sku: 'CAC0001' }) }),
      );
    });

    it('throws when the product has no category and no sku was provided', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue({
        id: 1,
        name: 'Cable USB-C',
        categoryId: null,
      });

      await expect(service.createVariant({ productId: 1 } as any, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when the product does not exist', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(null);

      await expect(service.createVariant({ productId: 999 } as any, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('previewSku', () => {
    it('delegates to SkuGeneratorService.preview', async () => {
      mockSkuGenerator.preview.mockResolvedValue('CAC0001');

      const result = await service.previewSku(1, 2, 'Cable USB-C');

      expect(result).toBe('CAC0001');
      expect(mockSkuGenerator.preview).toHaveBeenCalledWith(1, 2, 'Cable USB-C');
    });
  });
});
