import { Test, TestingModule } from '@nestjs/testing';
import { SkuGeneratorService } from './sku-generator.service';
import { PrismaService } from '../common/prisma/prisma.service';

describe('SkuGeneratorService', () => {
  let service: SkuGeneratorService;

  const mockPrismaService = {
    productCategory: {
      findUnique: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    skuSequence: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const leafCategory = { id: 2, name: 'Cables', parentId: 1 };
  const rootCategory = { id: 1, name: 'Accesorios', parentId: null };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkuGeneratorService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SkuGeneratorService>(SkuGeneratorService);
  });

  describe('preview', () => {
    it('uses the default mask when the organization has no config', async () => {
      mockPrismaService.productCategory.findUnique
        .mockResolvedValueOnce(leafCategory)
        .mockResolvedValueOnce(rootCategory);
      mockPrismaService.organization.findUnique.mockResolvedValue({ skuMaskConfig: [] });
      mockPrismaService.skuSequence.findUnique.mockResolvedValue(null);

      const result = await service.preview(1, 2, 'Cable USB-C');

      expect(result).toBe('CAC0001');
    });

    it('increments from the existing sequence for the same prefix', async () => {
      mockPrismaService.productCategory.findUnique
        .mockResolvedValueOnce(leafCategory)
        .mockResolvedValueOnce(rootCategory);
      mockPrismaService.organization.findUnique.mockResolvedValue({ skuMaskConfig: [] });
      mockPrismaService.skuSequence.findUnique.mockResolvedValue({ seq: 116 });

      const result = await service.preview(1, 2, 'Cable USB-C');

      expect(result).toBe('CAC0117');
    });

    it('uses the organization mask config when present', async () => {
      mockPrismaService.productCategory.findUnique
        .mockResolvedValueOnce(rootCategory)
        .mockResolvedValueOnce(rootCategory);
      mockPrismaService.organization.findUnique.mockResolvedValue({
        skuMaskConfig: [
          { type: 'literal', value: 'ACC-' },
          { type: 'sequence', digits: 3 },
        ],
      });
      mockPrismaService.skuSequence.findUnique.mockResolvedValue(null);

      const result = await service.preview(1, 1, 'Cargador');

      expect(result).toBe('ACC-001');
    });

    it('throws when the category does not exist', async () => {
      mockPrismaService.productCategory.findUnique.mockResolvedValue(null);

      await expect(service.preview(1, 999, 'X')).rejects.toThrow('999');
    });
  });

  describe('next', () => {
    it('creates the first sequence for a new prefix', async () => {
      mockPrismaService.productCategory.findUnique
        .mockResolvedValueOnce(leafCategory)
        .mockResolvedValueOnce(rootCategory);
      mockPrismaService.organization.findUnique.mockResolvedValue({ skuMaskConfig: [] });
      mockPrismaService.skuSequence.upsert.mockResolvedValue({ seq: 1 });

      const result = await service.next(1, 2, 'Cable USB-C');

      expect(result).toBe('CAC0001');
      expect(mockPrismaService.skuSequence.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { prefix: 'CAC' } }),
      );
    });

    it('retries on a unique constraint collision and succeeds', async () => {
      mockPrismaService.productCategory.findUnique
        .mockResolvedValueOnce(leafCategory)
        .mockResolvedValueOnce(rootCategory);
      mockPrismaService.organization.findUnique.mockResolvedValue({ skuMaskConfig: [] });
      mockPrismaService.skuSequence.upsert
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockResolvedValueOnce({ seq: 2 });

      const result = await service.next(1, 2, 'Cable USB-C');

      expect(result).toBe('CAC0002');
      expect(mockPrismaService.skuSequence.upsert).toHaveBeenCalledTimes(2);
    });
  });
});
