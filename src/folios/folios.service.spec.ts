import { Test, TestingModule } from '@nestjs/testing';
import { FoliosService } from './folios.service';
import { PrismaService } from '../common/prisma/prisma.service';

describe('FoliosService', () => {
  let service: FoliosService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    branch: {
      findUnique: jest.fn(),
    },
    folioSequence: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(async () => {
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
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('next', () => {
    it('should generate first folio for new sequence', async () => {
      const mockBranch = { code: 'SUC01' };
      const currentPeriod = new Date().toISOString().slice(0, 7).replace('-', '');

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          branch: {
            findUnique: jest.fn().mockResolvedValue(mockBranch),
          },
          folioSequence: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ seq: 1 }),
          },
        });
      });

      const result = await service.next('LAB', 1);

      expect(result).toBe(`LAB-SUC01-${currentPeriod}-0001`);
    });

    it('should increment existing sequence', async () => {
      const mockBranch = { code: 'SUC01' };
      const mockSequence = { id: 1, seq: 5 };
      const currentPeriod = new Date().toISOString().slice(0, 7).replace('-', '');

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          branch: {
            findUnique: jest.fn().mockResolvedValue(mockBranch),
          },
          folioSequence: {
            findUnique: jest.fn().mockResolvedValue(mockSequence),
            update: jest.fn().mockResolvedValue({ seq: 6 }),
          },
        });
      });

      const result = await service.next('LAB', 1);

      expect(result).toBe(`LAB-SUC01-${currentPeriod}-0006`);
    });

    it('should throw error if branch not found', async () => {
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          branch: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        });
      });

      await expect(service.next('LAB', 999)).rejects.toThrow('Branch not found');
    });
  });

  describe('preview', () => {
    it('should preview next folio for new sequence', async () => {
      const mockBranch = { code: 'SUC01' };
      const currentPeriod = new Date().toISOString().slice(0, 7).replace('-', '');

      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.folioSequence.findUnique.mockResolvedValue(null);

      const result = await service.preview('LAB', 1);

      expect(result).toBe(`LAB-SUC01-${currentPeriod}-0001`);
    });

    it('should preview next folio for existing sequence', async () => {
      const mockBranch = { code: 'SUC01' };
      const mockSequence = { seq: 10 };
      const currentPeriod = new Date().toISOString().slice(0, 7).replace('-', '');

      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.folioSequence.findUnique.mockResolvedValue(mockSequence);

      const result = await service.preview('LAB', 1);

      expect(result).toBe(`LAB-SUC01-${currentPeriod}-0011`);
    });
  });
});

