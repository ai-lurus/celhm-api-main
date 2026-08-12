import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { OrgService } from './org.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { SupabaseService } from '../common/supabase/supabase.service';

describe('OrgService.updateMember', () => {
  let service: OrgService;
  let mockPrisma: any;

  const mockSupabase = {
    deleteAuthUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma = {
      orgMembership: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      commissionPlan: {
        findFirst: jest.fn(),
      },
      user: {
        update: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrgService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SupabaseService, useValue: mockSupabase },
      ],
    }).compile();
    service = module.get(OrgService);
  });

  it('throws NotFoundException when assigning a commission plan from a different organization', async () => {
    const membership = { id: 1, organizationId: 1, userId: 10 };
    const user = { organizationId: 1 };
    const data = { commissionPlanId: 99 };

    mockPrisma.orgMembership.findUnique.mockResolvedValue(membership);
    mockPrisma.commissionPlan.findFirst.mockResolvedValue(null);

    await expect(service.updateMember(user as any, 1, data as any)).rejects.toThrow(NotFoundException);
  });

  it('succeeds when assigning a commission plan from the same organization', async () => {
    const membership = { id: 1, organizationId: 1, userId: 10 };
    const user = { organizationId: 1 };
    const data = { commissionPlanId: 5 };

    mockPrisma.orgMembership.findUnique.mockResolvedValue(membership);
    mockPrisma.commissionPlan.findFirst.mockResolvedValue({ id: 5, organizationId: 1 });
    mockPrisma.orgMembership.findUnique.mockResolvedValueOnce(membership);
    mockPrisma.orgMembership.findUnique.mockResolvedValueOnce({
      id: 1,
      organizationId: 1,
      user: { id: 10, name: 'Test', email: 'test@example.com', branch: null },
    });

    await service.updateMember(user as any, 1, data as any);

    expect(mockPrisma.commissionPlan.findFirst).toHaveBeenCalledWith({
      where: { id: 5, organizationId: 1 },
    });
  });

  it('succeeds when unsetting commission plan (setting to null)', async () => {
    const membership = { id: 1, organizationId: 1, userId: 10 };
    const user = { organizationId: 1 };
    const data = { commissionPlanId: null };

    mockPrisma.orgMembership.findUnique.mockResolvedValue(membership);
    mockPrisma.orgMembership.findUnique.mockResolvedValueOnce(membership);
    mockPrisma.orgMembership.findUnique.mockResolvedValueOnce({
      id: 1,
      organizationId: 1,
      user: { id: 10, name: 'Test', email: 'test@example.com', branch: null },
    });

    await service.updateMember(user as any, 1, data as any);

    // Should not call findFirst on commissionPlan when unsetting
    expect(mockPrisma.commissionPlan.findFirst).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when member does not belong to caller organization', async () => {
    const membership = { id: 1, organizationId: 2, userId: 10 };
    const user = { organizationId: 1 };
    const data = { commissionPlanId: 5 };

    mockPrisma.orgMembership.findUnique.mockResolvedValue(membership);

    await expect(service.updateMember(user as any, 1, data as any)).rejects.toThrow(ForbiddenException);
  });
});
