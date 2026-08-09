import { resolveCommissionRule, RuleCandidate } from './commission-rule-resolver';

function rule(overrides: Partial<RuleCandidate>): RuleCandidate {
  return {
    id: 1,
    source: 'PLAN',
    scopeType: 'GENERAL',
    scopeValue: null,
    basis: 'SALE_TOTAL',
    calcMethod: 'PERCENTAGE',
    value: 5,
    validFrom: new Date('2026-01-01'),
    validTo: null,
    ...overrides,
  };
}

describe('resolveCommissionRule', () => {
  const context = { date: new Date('2026-06-01'), productCategory: null, customerGroupId: null };

  it('returns null when there are no candidates', () => {
    expect(resolveCommissionRule([], context)).toBeNull();
  });

  it('picks the only GENERAL rule when nothing more specific exists', () => {
    const general = rule({ id: 1 });
    const result = resolveCommissionRule([general], context);
    expect(result?.rule.id).toBe(1);
    expect(result?.hadTie).toBe(false);
  });

  it('prefers PRODUCT_CATEGORY over GENERAL', () => {
    const general = rule({ id: 1, scopeType: 'GENERAL' });
    const category = rule({ id: 2, scopeType: 'PRODUCT_CATEGORY', scopeValue: 'Accesorios' });
    const result = resolveCommissionRule([general, category], {
      ...context,
      productCategory: 'Accesorios',
    });
    expect(result?.rule.id).toBe(2);
  });

  it('matches PRODUCT_CATEGORY case-insensitively and trims whitespace', () => {
    const category = rule({ id: 2, scopeType: 'PRODUCT_CATEGORY', scopeValue: ' accesorios ' });
    const result = resolveCommissionRule([category], { ...context, productCategory: 'Accesorios' });
    expect(result?.rule.id).toBe(2);
  });

  it('prefers CUSTOMER_GROUP over PRODUCT_CATEGORY and GENERAL', () => {
    const general = rule({ id: 1, scopeType: 'GENERAL' });
    const category = rule({ id: 2, scopeType: 'PRODUCT_CATEGORY', scopeValue: 'Accesorios' });
    const group = rule({ id: 3, scopeType: 'CUSTOMER_GROUP', scopeValue: '7' });
    const result = resolveCommissionRule([general, category, group], {
      date: context.date,
      productCategory: 'Accesorios',
      customerGroupId: 7,
    });
    expect(result?.rule.id).toBe(3);
  });

  it('prefers an OVERRIDE rule over a PLAN rule at the same specificity', () => {
    const planRule = rule({ id: 1, source: 'PLAN' });
    const overrideRule = rule({ id: 2, source: 'OVERRIDE' });
    const result = resolveCommissionRule([planRule, overrideRule], context);
    expect(result?.rule.id).toBe(2);
  });

  it('ignores rules outside their validity window', () => {
    const expired = rule({ id: 1, validTo: new Date('2026-05-01') });
    const notYetActive = rule({ id: 2, validFrom: new Date('2026-07-01') });
    const result = resolveCommissionRule([expired, notYetActive], context);
    expect(result).toBeNull();
  });

  it('breaks ties between equally specific rules by picking the most recent validFrom, and flags hadTie', () => {
    const older = rule({ id: 1, validFrom: new Date('2026-01-01') });
    const newer = rule({ id: 2, validFrom: new Date('2026-03-01') });
    const result = resolveCommissionRule([older, newer], context);
    expect(result?.rule.id).toBe(2);
    expect(result?.hadTie).toBe(true);
  });
});
