import { Test, TestingModule } from '@nestjs/testing';
import { FoliosService } from './folios.service';
import { PrismaService } from '../common/prisma/prisma.service';

describe('FoliosService', () => {
  let service: FoliosService;

  const mockPrismaService = {
    branch: {
      findUnique: jest.fn(),
    },
    folioSequence: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FoliosService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<FoliosService>(FoliosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('next', () => {
    it('should generate first folio for new sequence', async () => {
      const now = new Date();
      const currentPeriod = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const mockBranch = { code: 'SUC01' };

      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.folioSequence.upsert.mockResolvedValue({ seq: 1 });

      const result = await service.next('LAB', 1);

      expect(result).toBe(`${currentPeriod}0001`);
      expect(mockPrismaService.folioSequence.upsert).toHaveBeenCalled();
    });

    it('should increment existing sequence', async () => {
      const now = new Date();
      const currentPeriod = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const mockBranch = { code: 'SUC01' };

      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.folioSequence.upsert.mockResolvedValue({ seq: 6 });

      const result = await service.next('LAB', 1);

      expect(result).toBe(`${currentPeriod}0006`);
    });

    it('should throw error if branch not found', async () => {
      mockPrismaService.branch.findUnique.mockResolvedValue(null);

      await expect(service.next('LAB', 999)).rejects.toThrow('Branch not found');
    });
  });

  describe('preview', () => {
    it('should preview next folio for new sequence', async () => {
      const now = new Date();
      const currentPeriod = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const mockBranch = { code: 'SUC01' };

      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.folioSequence.findUnique.mockResolvedValue(null);

      const result = await service.preview('LAB', 1);

      expect(result).toBe(`${currentPeriod}0001`);
    });

    it('should preview next folio for existing sequence', async () => {
      const now = new Date();
      const currentPeriod = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const mockBranch = { code: 'SUC01' };
      const mockSequence = { seq: 10 };

      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.folioSequence.findUnique.mockResolvedValue(mockSequence);

      const result = await service.preview('LAB', 1);

      expect(result).toBe(`${currentPeriod}0011`);
    });
  });
});
