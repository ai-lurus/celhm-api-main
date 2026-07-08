import { Test, TestingModule } from '@nestjs/testing';
import { CustomersService } from './customers.service';
import { PrismaService } from '../common/prisma/prisma.service';

describe('CustomersService', () => {
  let service: CustomersService;

  const mockPrismaService = {
    $queryRaw: jest.fn(),
    customer: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.customer.findMany.mockResolvedValue([]);
    mockPrismaService.customer.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  describe('findAll', () => {
    it('matches customers regardless of accents in the search term', async () => {
      // "Núñez" is stored with an accent; a user searching without one ("nunez")
      // must still find it. This requires accent-insensitive matching, which
      // plain Prisma `contains` (ILIKE) does not provide.
      mockPrismaService.$queryRaw.mockResolvedValue([{ id: 42 }]);

      await service.findAll(1, { q: 'nunez' });

      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();

      const findManyArgs = mockPrismaService.customer.findMany.mock.calls[0][0];
      expect(findManyArgs.where.id).toEqual({ in: [42] });
    });

    it('returns no results without querying candidates when nothing matches', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const result = await service.findAll(1, { q: 'zzz-no-match' });

      const findManyArgs = mockPrismaService.customer.findMany.mock.calls[0][0];
      expect(findManyArgs.where.id).toEqual({ in: [] });
      expect(result.data).toEqual([]);
    });

    it('does not restrict by id when no search term is given', async () => {
      await service.findAll(1, {});

      expect(mockPrismaService.$queryRaw).not.toHaveBeenCalled();
      const findManyArgs = mockPrismaService.customer.findMany.mock.calls[0][0];
      expect(findManyArgs.where.id).toBeUndefined();
    });
  });
});
