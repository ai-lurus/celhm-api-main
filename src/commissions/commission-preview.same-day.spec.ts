import { CommissionPlansController } from './commission-plans.controller';
import { CommissionPlansService } from './commission-plans.service';
import type { AuthUser } from '../auth/auth.service';

/**
 * Regression: an override created "today" (validFrom is a full timestamp, not a
 * date) was invisible to Preview for that same calendar day, because the
 * date-only input "2026-09-21" was parsed as UTC midnight.
 *
 * Wired through the real controller and service; only Prisma is faked.
 */
describe('Preview of a rule created the same day (America/Mexico_City)', () => {
  const user = { organizationId: 1 } as AuthUser;

  const overrideCreatedAt1600Z = {
    id: 1,
    scopeType: 'GENERAL',
    scopeValue: null,
    basis: 'SALE_TOTAL',
    calcMethod: 'PERCENTAGE',
    value: 5,
    validFrom: new Date('2026-09-21T16:00:00.000Z'), // 10:00 in Mexico City
    validTo: null,
  };

  const prisma = {
    organization: { findUnique: jest.fn() },
    orgMembership: { findFirst: jest.fn() },
    product: { findMany: jest.fn() },
    customerGroup: { findMany: jest.fn() },
  };

  let controller: CommissionPlansController;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.organization.findUnique.mockResolvedValue({ timezone: 'America/Mexico_City' });
    prisma.orgMembership.findFirst.mockResolvedValue({
      id: 7,
      commissionPlan: null,
      overrideRules: [overrideCreatedAt1600Z],
    });
    prisma.product.findMany.mockResolvedValue([]);
    prisma.customerGroup.findMany.mockResolvedValue([]);
    controller = new CommissionPlansController(new CommissionPlansService(prisma as any));
  });

  it('applies an override with validFrom 2026-09-21T16:00Z when previewing 2026-09-21', async () => {
    const result = await controller.preview(user, 7, '2026-09-21');

    expect(result).toEqual([
      { scopeLabel: 'General', ruleId: 1, basis: 'SALE_TOTAL', calcMethod: 'PERCENTAGE', value: 5 },
    ]);
  });
});
