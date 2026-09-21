import { Prisma } from '@prisma/client';
import {
  ResolveContext,
  ResolveResult,
  RuleCandidate,
  resolveCommissionRule,
} from './commission-rule-resolver';

/**
 * Single answer to "which rule applies to employee E on date D".
 *
 * Every surface that needs it (real commission on a sale, Preview, the
 * Comisiones summary card) loads a membership with MEMBERSHIP_RULES_INCLUDE and
 * calls resolveEffectiveRule. Priority and tie handling stay in
 * commission-rule-resolver.ts; nothing here decides which rule wins.
 */
export const MEMBERSHIP_RULES_INCLUDE = Prisma.validator<Prisma.OrgMembershipInclude>()({
  commissionPlan: { include: { rules: true } },
  overrideRules: true,
});

export interface RuleRow {
  id: number;
  scopeType: RuleCandidate['scopeType'];
  scopeValue: string | null;
  basis: RuleCandidate['basis'];
  calcMethod: RuleCandidate['calcMethod'];
  value: Prisma.Decimal | number;
  validFrom: Date;
  validTo: Date | null;
}

export interface RuleSourceMembership {
  commissionPlan: { active: boolean; rules: RuleRow[] } | null;
  overrideRules: RuleRow[];
}

function toCandidate(row: RuleRow, source: RuleCandidate['source']): RuleCandidate {
  return {
    id: row.id,
    source,
    scopeType: row.scopeType,
    scopeValue: row.scopeValue,
    basis: row.basis,
    calcMethod: row.calcMethod,
    value: Number(row.value),
    validFrom: row.validFrom,
    validTo: row.validTo,
  };
}

/** Plan rules count only while the assigned plan is active; overrides always count. */
export function buildRuleCandidates(membership: RuleSourceMembership): RuleCandidate[] {
  const planRules = membership.commissionPlan?.active ? membership.commissionPlan.rules : [];
  return [
    ...planRules.map((row) => toCandidate(row, 'PLAN')),
    ...membership.overrideRules.map((row) => toCandidate(row, 'OVERRIDE')),
  ];
}

export function resolveEffectiveRule(
  membership: RuleSourceMembership,
  context: ResolveContext,
): ResolveResult | null {
  return resolveCommissionRule(buildRuleCandidates(membership), context);
}
