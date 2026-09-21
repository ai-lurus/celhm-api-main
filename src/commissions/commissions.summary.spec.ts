import { CommissionsService } from './commissions.service';
import type { RuleRow } from './effective-commission-rule';

describe('CommissionsService.getSummary: who appears and what the card says', () => {
  const NOW = new Date('2026-09-21T20:00:00.000Z');

  const prisma = { user: { findMany: jest.fn() } };
  let service: CommissionsService;

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

  const summaryFor = async (membership: {
    commissionPlan: { id: number; name: string; active: boolean; rules: RuleRow[] } | null;
    overrideRules: RuleRow[];
    commissionRate?: number | null;
  }) => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 10,
        name: 'Empleado',
        email: null,
        memberships: [{ commissionRate: null, ...membership }],
        commissions: [],
      },
    ]);
    const [card] = await service.getSummary(1);
    return card;
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
    service = new CommissionsService(prisma as any);
  });

  afterEach(() => jest.useRealTimers());

  describe('inclusion', () => {
    it('includes an employee with an assigned plan, any override rule, the TECNICO or VENDEDOR role, or an existing commission, and no longer keys on the legacy rate', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.getSummary(1);

      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('ACTIVO');
      expect(where.OR).toEqual([
        {
          memberships: {
            some: {
              organizationId: 1,
              status: 'ACTIVO',
              OR: [
                { role: { in: ['TECNICO', 'VENDEDOR'] } },
                { commissionPlanId: { not: null } },
                { overrideRules: { some: {} } },
              ],
            },
          },
        },
        {
          commissions: {
            some: { OR: [{ ticket: { branch: { organizationId: 1 } } }, { sale: { branch: { organizationId: 1 } } }] },
          },
        },
      ]);
      expect(JSON.stringify(where)).not.toContain('commissionRate');
    });
  });

  describe('what the card says about the rule (evaluated at now)', () => {
    it('a GENERAL rule with no scoped rules: the rule and no chip', async () => {
      const card = await summaryFor({ commissionPlan: null, overrideRules: [rule(1)] });
      expect(card.effectiveRule).toEqual({ ruleId: 1, source: 'OVERRIDE', basis: 'SALE_TOTAL', calcMethod: 'PERCENTAGE', value: 5 });
      expect(card.scopedRuleCount).toBe(0);
    });

    it('a GENERAL rule plus 2 scoped rules valid now: the rule and a count of 2', async () => {
      const card = await summaryFor({
        commissionPlan: null,
        overrideRules: [
          rule(1),
          rule(2, { scopeType: 'PRODUCT_CATEGORY', scopeValue: 'Accesorios' }),
          rule(3, { scopeType: 'CUSTOMER_GROUP', scopeValue: '7' }),
        ],
      });
      expect(card.effectiveRule?.ruleId).toBe(1);
      expect(card.scopedRuleCount).toBe(2);
    });

    it('only scoped rules: no general rule, but they are counted', async () => {
      const card = await summaryFor({
        commissionPlan: null,
        overrideRules: [rule(2, { scopeType: 'PRODUCT_CATEGORY', scopeValue: 'Accesorios' })],
      });
      expect(card.effectiveRule).toBeNull();
      expect(card.scopedRuleCount).toBe(1);
    });

    it('no rules of any kind: nothing, so the card can say it does not generate commissions', async () => {
      const card = await summaryFor({ commissionPlan: null, overrideRules: [] });
      expect(card.effectiveRule).toBeNull();
      expect(card.scopedRuleCount).toBe(0);
    });

    it('scoped rules that ended, have not started, or belong to an inactive plan are not counted', async () => {
      const card = await summaryFor({
        commissionPlan: {
          id: 2,
          name: 'Plan inactivo',
          active: false,
          rules: [rule(5, { scopeType: 'PRODUCT_CATEGORY', scopeValue: 'Pantallas' })],
        },
        overrideRules: [
          rule(2, { scopeType: 'PRODUCT_CATEGORY', scopeValue: 'Accesorios', validTo: new Date('2026-08-31T00:00:00.000Z') }),
          rule(3, { scopeType: 'PRODUCT_CATEGORY', scopeValue: 'Cables', validFrom: new Date('2026-10-01T00:00:00.000Z') }),
        ],
      });
      expect(card.effectiveRule).toBeNull();
      expect(card.scopedRuleCount).toBe(0);
    });
  });

  it('keeps returning the deprecated commissionRate so an older web build keeps working', async () => {
    const card = await summaryFor({ commissionPlan: null, overrideRules: [], commissionRate: 10 });
    expect(card.commissionRate).toBe(10);
  });
});
