import { CommissionsService } from './commissions.service';
import { CommissionPlansService } from './commission-plans.service';
import { resolveEffectiveRule, RuleRow, RuleSourceMembership } from './effective-commission-rule';

/**
 * One membership, one instant, four surfaces. They must all name the same rule:
 * the direct function, the Comisiones summary card, Preview, and a real sale.
 */
describe('effective commission rule: every surface agrees', () => {
  const INSTANT = new Date('2026-09-21T20:00:00.000Z');

  const rule = (id: number, overrides: Partial<RuleRow> = {}): RuleRow => ({
    id,
    scopeType: 'GENERAL',
    scopeValue: null,
    basis: 'SALE_TOTAL',
    calcMethod: 'PERCENTAGE',
    value: 5,
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validTo: null,
    ...overrides,
  });

  const cases: Array<{ name: string; membership: RuleSourceMembership; expectedRuleId: number | null }> = [
    {
      name: 'an override that started earlier today (16:00Z)',
      membership: {
        commissionPlan: null,
        overrideRules: [rule(1, { validFrom: new Date('2026-09-21T16:00:00.000Z') })],
      },
      expectedRuleId: 1,
    },
    {
      name: 'only a plan rule',
      membership: { commissionPlan: { active: true, rules: [rule(10, { value: 8 })] }, overrideRules: [] },
      expectedRuleId: 10,
    },
    {
      name: 'neither a plan nor an override',
      membership: { commissionPlan: null, overrideRules: [] },
      expectedRuleId: null,
    },
    {
      name: 'an override and a plan rule at the same scope (override wins)',
      membership: { commissionPlan: { active: true, rules: [rule(10, { value: 8 })] }, overrideRules: [rule(1)] },
      expectedRuleId: 1,
    },
    {
      name: 'a plan that was deactivated (its rules stop counting)',
      membership: { commissionPlan: { active: false, rules: [rule(10, { value: 8 })] }, overrideRules: [] },
      expectedRuleId: null,
    },
  ];

  const prisma = {
    user: { findMany: jest.fn() },
    orgMembership: { findFirst: jest.fn(), findUnique: jest.fn() },
    sale: { findUnique: jest.fn() },
    commission: { findUnique: jest.fn(), create: jest.fn() },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(INSTANT);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function ruleIdPerSurface(membership: RuleSourceMembership) {
    const stored = { ...membership, commissionRate: null };
    prisma.user.findMany.mockResolvedValue([
      { id: 10, name: 'Empleado', email: null, memberships: [stored], commissions: [] },
    ]);
    prisma.orgMembership.findFirst.mockResolvedValue(stored);
    prisma.orgMembership.findUnique.mockResolvedValue(stored);
    prisma.sale.findUnique.mockResolvedValue({
      id: 1,
      userId: 10,
      createdAt: INSTANT,
      branch: { organizationId: 1 },
      customer: null,
      lines: [
        {
          id: 501,
          ticketId: null,
          variantId: 20,
          qty: 1,
          total: 100,
          variant: { purchasePrice: 40, product: { category: { name: 'Accesorios' } } },
          ticket: null,
        },
      ],
    });
    prisma.commission.findUnique.mockResolvedValue(null);

    const commissions = new CommissionsService(prisma as any);
    const plans = new CommissionPlansService(prisma as any);

    const direct = resolveEffectiveRule(membership, {
      date: INSTANT,
      productCategory: null,
      customerGroupId: null,
    });
    const [summary] = await commissions.getSummary(1);
    const preview = await plans.preview(7, 1, INSTANT, [], []);
    await commissions.generateForSale(1);

    return {
      direct: direct?.rule.id ?? null,
      summary: summary.effectiveRule?.ruleId ?? null,
      preview: preview[0]?.ruleId ?? null,
      sale: prisma.commission.create.mock.calls[0]?.[0].data.ruleId ?? null,
    };
  }

  it.each(cases)('$name', async ({ membership, expectedRuleId }) => {
    const result = await ruleIdPerSurface(membership);

    expect(result).toEqual({
      direct: expectedRuleId,
      summary: expectedRuleId,
      preview: expectedRuleId,
      sale: expectedRuleId,
    });
  });
});
