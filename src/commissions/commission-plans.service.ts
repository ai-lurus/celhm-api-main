import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CommissionRule, CommissionScope, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  DEFAULT_TIMEZONE,
  dateKeyInTimezone,
  endOfDayInTimezone,
  isValidTimezone,
  parseDateOnly,
  resolvePreviewInstant,
  startOfDayInTimezone,
} from './commission-dates';
import { CreateCommissionPlanDto, UpdateCommissionPlanDto } from './dto/commission-plan.dto';
import {
  CreateCommissionRuleDto,
  CreateCommissionRuleOverrideDto,
  ReviseCommissionRuleDto,
} from './dto/commission-rule.dto';
import { MEMBERSHIP_RULES_INCLUDE, resolveEffectiveRule } from './effective-commission-rule';

interface RuleStart {
  /** Start of the chosen day in the org timezone. */
  validFrom: Date;
  /** Last millisecond of that same day, used to tell "same day" from "scheduled later". */
  dayEnd: Date;
}

type RuleOwner = { planId: number } | { membershipId: number };

@Injectable()
export class CommissionPlansService {
  private readonly logger = new Logger(CommissionPlansService.name);

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
    return this.createReplacingScope(organizationId, { planId }, dto);
  }

  async createOverride(organizationId: number, dto: CreateCommissionRuleOverrideDto) {
    const membership = await this.prisma.orgMembership.findFirst({
      where: { id: dto.membershipId, organizationId },
    });
    if (!membership) throw new NotFoundException('Empleado no encontrado en tu organización');

    return this.createReplacingScope(organizationId, { membershipId: dto.membershipId }, dto);
  }

  async listOverrides(membershipId: number, organizationId: number): Promise<CommissionRule[]> {
    const membership = await this.prisma.orgMembership.findFirst({
      where: { id: membershipId, organizationId },
    });
    if (!membership) throw new NotFoundException('Empleado no encontrado en tu organización');

    return this.prisma.commissionRule.findMany({
      where: { membershipId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviseRule(ruleId: number, organizationId: number, dto: ReviseCommissionRuleDto) {
    const rule = await this.findRuleInOrg(ruleId, organizationId);
    const start = await this.resolveRuleStart(organizationId);
    const owner: RuleOwner = rule.planId !== null ? { planId: rule.planId } : { membershipId: rule.membershipId };

    return this.prisma.$transaction(async (tx) => {
      await this.closeOpenRulesForScope(tx, owner, rule.scopeType, rule.scopeValue, start);
      return tx.commissionRule.create({
        data: {
          planId: rule.planId,
          membershipId: rule.membershipId,
          basis: rule.basis,
          scopeType: rule.scopeType,
          scopeValue: rule.scopeValue,
          calcMethod: dto.calcMethod,
          value: dto.value,
          validFrom: start.validFrom,
          label: dto.label,
        },
      });
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
      include: MEMBERSHIP_RULES_INCLUDE,
    });
    if (!membership) throw new NotFoundException('Empleado no encontrado en tu organización');

    const scenarios: Array<{ scopeLabel: string; productCategory: string | null; customerGroupId: number | null }> = [
      { scopeLabel: 'General', productCategory: null, customerGroupId: null },
      ...knownCategories.map((c) => ({ scopeLabel: `Categoría: ${c}`, productCategory: c, customerGroupId: null })),
      ...knownCustomerGroupIds.map((id) => ({ scopeLabel: `Cliente: grupo ${id}`, productCategory: null, customerGroupId: id })),
    ];

    const results: Array<{ scopeLabel: string; ruleId: number; basis: string; calcMethod: string; value: number }> = [];
    for (const scenario of scenarios) {
      const resolved = resolveEffectiveRule(membership, {
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

  /**
   * Preview for a date-only input. The date is evaluated at the END of that day in
   * Organization.timezone, so a rule created earlier that same day (legacy rules keep
   * their intraday validFrom) is already in force. The Comisiones card, in contrast,
   * evaluates at "now", and real sales at their exact timestamp. The three are
   * deliberately different instants, not a bug.
   */
  async previewForDate(organizationId: number, membershipId: number, dateInput?: string) {
    const timezone = await this.getOrgTimezone(organizationId);
    const date = resolvePreviewInstant(dateInput, timezone);
    if (!date) {
      throw new BadRequestException('Formato de fecha inválido; usa ISO 8601 (ej. 2026-06-01)');
    }
    const [categories, groups] = await Promise.all([
      this.listKnownCategories(organizationId),
      this.listKnownCustomerGroupIds(organizationId),
    ]);
    return this.preview(membershipId, organizationId, date, categories, groups);
  }

  async listKnownCategories(organizationId: number): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      where: { deletedAt: null, categoryId: { not: null } },
      select: { category: { select: { name: true } } },
      distinct: ['categoryId'],
    });
    return rows
      .map((r) => r.category?.name)
      .filter((name): name is string => Boolean(name));
  }

  async listKnownCustomerGroupIds(organizationId: number): Promise<number[]> {
    const rows = await this.prisma.customerGroup.findMany({
      where: { organizationId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async getOrgTimezone(organizationId: number): Promise<string> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const timezone = organization?.timezone;
    if (timezone && isValidTimezone(timezone)) return timezone;
    this.logger.warn(`Organization ${organizationId} has no valid timezone (${timezone}); using ${DEFAULT_TIMEZONE}`);
    return DEFAULT_TIMEZONE;
  }

  /**
   * New rules start at the beginning of a calendar day in the org timezone (default:
   * today). Past days are rejected so a rule can never reach back to earlier sales.
   */
  private async resolveRuleStart(organizationId: number, requested?: string): Promise<RuleStart> {
    const timezone = await this.getOrgTimezone(organizationId);
    const today = dateKeyInTimezone(new Date(), timezone);

    let day = today;
    if (requested) {
      if (parseDateOnly(requested)) {
        day = requested;
      } else {
        const instant = new Date(requested);
        if (Number.isNaN(instant.getTime())) throw new BadRequestException('Fecha de inicio inválida');
        day = dateKeyInTimezone(instant, timezone);
      }
    }
    if (day < today) throw new BadRequestException('La fecha de inicio no puede ser anterior a hoy');

    return { validFrom: startOfDayInTimezone(day, timezone), dayEnd: endOfDayInTimezone(day, timezone) };
  }

  /**
   * Adding a rule for the same owner and scope replaces the previous one: any rule still
   * open for that scope (basis does not matter, the resolver ranks by scope only) ends one
   * millisecond before the new one starts. This keeps the UI from ever creating a tie.
   * A rule already scheduled for a later day is not silently overwritten.
   */
  private async closeOpenRulesForScope(
    tx: Prisma.TransactionClient,
    owner: RuleOwner,
    scopeType: CommissionScope,
    scopeValue: string | null,
    start: RuleStart,
  ): Promise<void> {
    const open = await tx.commissionRule.findMany({
      where: {
        ...owner,
        scopeType,
        scopeValue: scopeType === 'GENERAL' ? null : scopeValue,
        OR: [{ validTo: null }, { validTo: { gt: start.validFrom } }],
      },
    });

    if (open.some((rule) => rule.validFrom > start.dayEnd)) {
      throw new ConflictException(
        'Ya existe una regla programada para este alcance en una fecha posterior. Elimínala o elige otra fecha.',
      );
    }

    const closeAt = new Date(start.validFrom.getTime() - 1);
    for (const rule of open) {
      await tx.commissionRule.update({ where: { id: rule.id }, data: { validTo: closeAt } });
    }
  }

  private async createReplacingScope(
    organizationId: number,
    owner: RuleOwner,
    dto: CreateCommissionRuleDto,
  ) {
    const start = await this.resolveRuleStart(organizationId, dto.validFrom);
    const scopeValue = dto.scopeType === 'GENERAL' ? null : dto.scopeValue ?? null;

    return this.prisma.$transaction(async (tx) => {
      await this.closeOpenRulesForScope(tx, owner, dto.scopeType, scopeValue, start);
      return tx.commissionRule.create({
        data: {
          ...owner,
          basis: dto.basis,
          scopeType: dto.scopeType,
          scopeValue,
          calcMethod: dto.calcMethod,
          value: dto.value,
          validFrom: start.validFrom,
          label: dto.label,
        },
      });
    });
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
