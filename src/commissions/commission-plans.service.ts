import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateCommissionPlanDto, UpdateCommissionPlanDto } from './dto/commission-plan.dto';
import {
  CreateCommissionRuleDto,
  CreateCommissionRuleOverrideDto,
  ReviseCommissionRuleDto,
} from './dto/commission-rule.dto';
import { resolveCommissionRule, RuleCandidate } from './commission-rule-resolver';

@Injectable()
export class CommissionPlansService {
  constructor(private prisma: PrismaService) {}

  findAll(organizationId: number) {
    return this.prisma.commissionPlan.findMany({
      where: { organizationId },
      include: { rules: true },
      orderBy: { name: 'asc' },
    });
  }

  create(organizationId: number, dto: CreateCommissionPlanDto) {
    return this.prisma.commissionPlan.create({
      data: { organizationId, name: dto.name, role: dto.role },
    });
  }

  async update(id: number, organizationId: number, dto: UpdateCommissionPlanDto) {
    await this.assertPlanInOrg(id, organizationId);
    return this.prisma.commissionPlan.update({ where: { id }, data: dto });
  }

  async deactivate(id: number, organizationId: number) {
    await this.assertPlanInOrg(id, organizationId);
    return this.prisma.commissionPlan.update({ where: { id }, data: { active: false } });
  }

  async addRule(planId: number, organizationId: number, dto: CreateCommissionRuleDto) {
    await this.assertPlanInOrg(planId, organizationId);
    return this.prisma.commissionRule.create({
      data: {
        planId,
        basis: dto.basis,
        scopeType: dto.scopeType,
        scopeValue: dto.scopeType === 'GENERAL' ? null : dto.scopeValue ?? null,
        calcMethod: dto.calcMethod,
        value: dto.value,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        label: dto.label,
      },
    });
  }

  async createOverride(organizationId: number, dto: CreateCommissionRuleOverrideDto) {
    const membership = await this.prisma.orgMembership.findFirst({
      where: { id: dto.membershipId, organizationId },
    });
    if (!membership) throw new NotFoundException('Empleado no encontrado en tu organización');

    return this.prisma.commissionRule.create({
      data: {
        membershipId: dto.membershipId,
        basis: dto.basis,
        scopeType: dto.scopeType,
        scopeValue: dto.scopeType === 'GENERAL' ? null : dto.scopeValue ?? null,
        calcMethod: dto.calcMethod,
        value: dto.value,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        label: dto.label,
      },
    });
  }

  async reviseRule(ruleId: number, organizationId: number, dto: ReviseCommissionRuleDto) {
    const rule = await this.findRuleInOrg(ruleId, organizationId);

    await this.prisma.commissionRule.update({
      where: { id: rule.id },
      data: { validTo: new Date() },
    });

    return this.prisma.commissionRule.create({
      data: {
        planId: rule.planId,
        membershipId: rule.membershipId,
        basis: rule.basis,
        scopeType: rule.scopeType,
        scopeValue: rule.scopeValue,
        calcMethod: dto.calcMethod,
        value: dto.value,
        validFrom: new Date(),
        label: dto.label,
      },
    });
  }

  async deleteRule(ruleId: number, organizationId: number) {
    const rule = await this.findRuleInOrg(ruleId, organizationId);
    const usageCount = await this.prisma.commission.count({ where: { ruleId: rule.id } });

    if (usageCount > 0) {
      return this.prisma.commissionRule.update({ where: { id: rule.id }, data: { validTo: new Date() } });
    }
    return this.prisma.commissionRule.delete({ where: { id: rule.id } });
  }

  async preview(
    membershipId: number,
    organizationId: number,
    date: Date,
    knownCategories: string[],
    knownCustomerGroupIds: number[],
  ): Promise<Array<{ scopeLabel: string; ruleId: number; basis: string; calcMethod: string; value: number }>> {
    const membership = await this.prisma.orgMembership.findFirst({
      where: { id: membershipId, organizationId },
      include: { commissionPlan: { include: { rules: true } }, overrideRules: true },
    });
    if (!membership) throw new NotFoundException('Empleado no encontrado en tu organización');

    const candidates: RuleCandidate[] = [
      ...(membership.commissionPlan?.active ? membership.commissionPlan.rules : []).map((r) => ({
        id: r.id,
        source: 'PLAN' as const,
        scopeType: r.scopeType,
        scopeValue: r.scopeValue,
        basis: r.basis,
        calcMethod: r.calcMethod,
        value: Number(r.value),
        validFrom: r.validFrom,
        validTo: r.validTo,
      })),
      ...membership.overrideRules.map((r) => ({
        id: r.id,
        source: 'OVERRIDE' as const,
        scopeType: r.scopeType,
        scopeValue: r.scopeValue,
        basis: r.basis,
        calcMethod: r.calcMethod,
        value: Number(r.value),
        validFrom: r.validFrom,
        validTo: r.validTo,
      })),
    ];

    const scenarios: Array<{ scopeLabel: string; productCategory: string | null; customerGroupId: number | null }> = [
      { scopeLabel: 'General', productCategory: null, customerGroupId: null },
      ...knownCategories.map((c) => ({ scopeLabel: `Categoría: ${c}`, productCategory: c, customerGroupId: null })),
      ...knownCustomerGroupIds.map((id) => ({ scopeLabel: `Cliente: grupo ${id}`, productCategory: null, customerGroupId: id })),
    ];

    const results: Array<{ scopeLabel: string; ruleId: number; basis: string; calcMethod: string; value: number }> = [];
    for (const scenario of scenarios) {
      const resolved = resolveCommissionRule(candidates, {
        date,
        productCategory: scenario.productCategory,
        customerGroupId: scenario.customerGroupId,
      });
      if (resolved) {
        results.push({
          scopeLabel: scenario.scopeLabel,
          ruleId: resolved.rule.id,
          basis: resolved.rule.basis,
          calcMethod: resolved.rule.calcMethod,
          value: resolved.rule.value,
        });
      }
    }
    return results;
  }

  async listKnownCategories(organizationId: number): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      where: { deletedAt: null, category: { not: null } },
      select: { category: true },
      distinct: ['category'],
    });
    return rows.map((r) => r.category!).filter(Boolean);
  }

  async listKnownCustomerGroupIds(organizationId: number): Promise<number[]> {
    const rows = await this.prisma.customerGroup.findMany({
      where: { organizationId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async assertPlanInOrg(planId: number, organizationId: number) {
    const plan = await this.prisma.commissionPlan.findFirst({ where: { id: planId, organizationId } });
    if (!plan) throw new NotFoundException('Plan de comisión no encontrado');
    return plan;
  }

  private async findRuleInOrg(ruleId: number, organizationId: number) {
    const rule = await this.prisma.commissionRule.findFirst({
      where: {
        id: ruleId,
        OR: [{ plan: { organizationId } }, { membership: { organizationId } }],
      },
      include: { plan: true, membership: true },
    });
    if (!rule) throw new NotFoundException('Regla de comisión no encontrada');
    return rule;
  }
}
