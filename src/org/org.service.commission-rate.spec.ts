import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { OrgService } from './org.service';
import { UpdateMemberDto } from './dto/update-member.dto';
import { PrismaService } from '../common/prisma/prisma.service';
import { SupabaseService } from '../common/supabase/supabase.service';

/**
 * The legacy flat commissionRate is no longer editable in the UI, so the clients stop
 * sending the key. An omitted key must mean "no change": saving Edit User must never
 * null a stored rate. Bodies go through the same ValidationPipe options as main.ts.
 */
describe('OrgService.updateMember and the legacy commissionRate', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const user = { organizationId: 1 };

  let service: OrgService;
  let prisma: any;

  const asDto = (body: Record<string, unknown>) =>
    pipe.transform(body, { type: 'body', metatype: UpdateMemberDto }) as Promise<UpdateMemberDto>;

  const membershipUpdateData = () => prisma.orgMembership.update.mock.calls[0][0].data;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      orgMembership: { findUnique: jest.fn(), update: jest.fn() },
      commissionPlan: { findFirst: jest.fn() },
      user: { update: jest.fn() },
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    prisma.orgMembership.findUnique.mockResolvedValue({ id: 4, organizationId: 1, userId: 4, commissionRate: 10 });
    prisma.commissionPlan.findFirst.mockResolvedValue({ id: 5, organizationId: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrgService,
        { provide: PrismaService, useValue: prisma },
        { provide: SupabaseService, useValue: { deleteAuthUser: jest.fn() } },
      ],
    }).compile();
    service = module.get(OrgService);
  });

  it('a body without commissionRate leaves the stored rate alone (role, branch and plan saved)', async () => {
    const body = await asDto({ role: 'ADMINISTRADOR', branchId: 2, commissionPlanId: 5 });

    await service.updateMember(user as any, 4, body);

    expect(membershipUpdateData()).toEqual({ role: 'ADMINISTRADOR', commissionPlanId: 5 });
    expect(membershipUpdateData()).not.toHaveProperty('commissionRate');
  });

  it('the validation pipe does not add a commissionRate key to a body that omitted it', async () => {
    const body = await asDto({ role: 'VENDEDOR' });

    expect('commissionRate' in body).toBe(false);
    await service.updateMember(user as any, 4, body);
    expect(membershipUpdateData()).toEqual({ role: 'VENDEDOR' });
  });

  it('an explicit null still clears the rate (unchanged contract for other clients)', async () => {
    const body = await asDto({ commissionRate: null });

    await service.updateMember(user as any, 4, body);

    expect(membershipUpdateData()).toEqual({ commissionRate: null });
  });

  it('an explicit number still sets the rate (unchanged contract for other clients)', async () => {
    const body = await asDto({ commissionRate: 12.5 });

    await service.updateMember(user as any, 4, body);

    expect(membershipUpdateData()).toEqual({ commissionRate: 12.5 });
  });
});
