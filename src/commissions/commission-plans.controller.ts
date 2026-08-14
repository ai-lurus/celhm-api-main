import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { Role, CommissionRule } from '@prisma/client';
import { CommissionPlansService } from './commission-plans.service';
import { CreateCommissionPlanDto, UpdateCommissionPlanDto } from './dto/commission-plan.dto';
import {
  CreateCommissionRuleDto,
  CreateCommissionRuleOverrideDto,
  ReviseCommissionRuleDto,
} from './dto/commission-rule.dto';

@ApiTags('commission-plans')
@Controller('commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR)
@ApiBearerAuth()
export class CommissionPlansController {
  constructor(private readonly plansService: CommissionPlansService) {}

  @Get('plans')
  @ApiOperation({ summary: 'List commission plan templates for the organization' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.plansService.findAll(user.organizationId);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List distinct product categories usable as PRODUCT_CATEGORY rule scope' })
  listCategories(@CurrentUser() user: AuthUser): Promise<string[]> {
    return this.plansService.listKnownCategories(user.organizationId);
  }

  @Post('plans')
  @ApiOperation({ summary: 'Create a commission plan template' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCommissionPlanDto) {
    return this.plansService.create(user.organizationId, dto);
  }

  @Patch('plans/:id')
  @ApiOperation({ summary: 'Update a commission plan template' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCommissionPlanDto,
  ) {
    return this.plansService.update(id, user.organizationId, dto);
  }

  @Delete('plans/:id')
  @ApiOperation({ summary: 'Deactivate a commission plan template' })
  deactivate(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.plansService.deactivate(id, user.organizationId);
  }

  @Post('plans/:id/rules')
  @ApiOperation({ summary: 'Add a rule to a commission plan template' })
  addRule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) planId: number,
    @Body() dto: CreateCommissionRuleDto,
  ) {
    return this.plansService.addRule(planId, user.organizationId, dto);
  }

  @Post('rules/override')
  @ApiOperation({ summary: 'Create an individual commission rule override for one employee' })
  createOverride(@CurrentUser() user: AuthUser, @Body() dto: CreateCommissionRuleOverrideDto) {
    return this.plansService.createOverride(user.organizationId, dto);
  }

  @Get('rules/overrides')
  @ApiOperation({ summary: 'List individual commission rule overrides for one employee' })
  listOverrides(@CurrentUser() user: AuthUser, @Query('membershipId', ParseIntPipe) membershipId: number): Promise<CommissionRule[]> {
    return this.plansService.listOverrides(membershipId, user.organizationId);
  }

  @Put('rules/:id/revise')
  @ApiOperation({ summary: 'Close a rule effective now and create a new one with the updated value' })
  reviseRule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviseCommissionRuleDto,
  ) {
    return this.plansService.reviseRule(id, user.organizationId, dto);
  }

  @Delete('rules/:id')
  @ApiOperation({ summary: 'Delete a rule, or close its validity if already used' })
  deleteRule(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.plansService.deleteRule(id, user.organizationId);
  }

  @Get('rules/preview')
  @ApiOperation({ summary: 'Preview which rule would win for an employee across known categories and customer groups' })
  async preview(@CurrentUser() user: AuthUser, @Query('membershipId', ParseIntPipe) membershipId: number, @Query('date') date?: string) {
    let parsedDate = new Date();
    if (date) {
      parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        throw new BadRequestException('Formato de fecha inválido; usa ISO 8601 (ej. 2026-06-01)');
      }
    }
    const [categories, groups] = await Promise.all([
      this.plansService.listKnownCategories(user.organizationId),
      this.plansService.listKnownCustomerGroupIds(user.organizationId),
    ]);
    return this.plansService.preview(membershipId, user.organizationId, parsedDate, categories, groups);
  }
}
