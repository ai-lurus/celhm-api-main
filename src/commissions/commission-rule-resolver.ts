import { CommissionBasis, CommissionCalcMethod, CommissionScope } from '@prisma/client';

export type RuleSource = 'OVERRIDE' | 'PLAN';

export interface RuleCandidate {
  id: number;
  source: RuleSource;
  scopeType: CommissionScope;
  scopeValue: string | null;
  basis: CommissionBasis;
  calcMethod: CommissionCalcMethod;
  value: number;
  validFrom: Date;
  validTo: Date | null;
}

export interface ResolveContext {
  date: Date;
  productCategory: string | null;
  /**
   * Nombre de la categoría padre de productCategory, si productCategory es una
   * subcategoría. Una regla cuyo scopeValue coincide con la categoría padre aplica
   * también a todas sus subcategorías (herencia), sin tener que repetir la regla
   * por cada una.
   */
  productCategoryParent?: string | null;
  customerGroupId: number | null;
}

export interface ResolveResult {
  rule: RuleCandidate;
  hadTie: boolean;
}

export function resolveCommissionRule(
  candidates: RuleCandidate[],
  context: ResolveContext,
): ResolveResult | null {
  const active = candidates.filter(
    (r) => r.validFrom <= context.date && (r.validTo === null || context.date <= r.validTo),
  );

  const customerGroupMatches =
    context.customerGroupId !== null
      ? active.filter(
          (r) => r.scopeType === 'CUSTOMER_GROUP' && r.scopeValue === String(context.customerGroupId),
        )
      : [];

  const normalize = (value: string) => value.trim().toLowerCase();
  const categoryNames = [context.productCategory, context.productCategoryParent ?? null]
    .filter((name): name is string => name !== null)
    .map(normalize);

  const categoryMatches =
    categoryNames.length > 0
      ? active.filter(
          (r) =>
            r.scopeType === 'PRODUCT_CATEGORY' &&
            r.scopeValue !== null &&
            categoryNames.includes(normalize(r.scopeValue)),
        )
      : [];

  const generalMatches = active.filter((r) => r.scopeType === 'GENERAL');

  const pool = customerGroupMatches.length
    ? customerGroupMatches
    : categoryMatches.length
      ? categoryMatches
      : generalMatches;

  if (pool.length === 0) return null;

  const overridePool = pool.filter((r) => r.source === 'OVERRIDE');
  const finalPool = overridePool.length ? overridePool : pool;

  if (finalPool.length === 1) {
    return { rule: finalPool[0], hadTie: false };
  }

  const sorted = [...finalPool].sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());
  return { rule: sorted[0], hadTie: true };
}
