import { Controller, Get, Patch, Param, Query, Body, UseGuards, Res, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { Role, CommissionStatus } from '@prisma/client';
import { CommissionsService } from './commissions.service';
import { FindCommissionsDto, PayCommissionBatchDto } from './dto/commissions.dto';
import { Response } from 'express';

@ApiTags('commissions')
@Controller('commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR)
@ApiBearerAuth()
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all commissions with filters' })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: CommissionStatus })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of commissions' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() filters: FindCommissionsDto,
  ) {
    return this.commissionsService.findAll(user.organizationId, {
      userId: filters.userId,
      status: filters.status,
      startDate: filters.startDate,
      endDate: filters.endDate,
      page: filters.page,
      pageSize: filters.pageSize,
    });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get commission summary per user' })
  @ApiResponse({ status: 200, description: 'Summary of commissions per technician' })
  getSummary(@CurrentUser() user: AuthUser) {
    return this.commissionsService.getSummary(user.organizationId);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export commissions to CSV' })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: CommissionStatus })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'CSV file download' })
  async exportCsv(
    @CurrentUser() user: AuthUser,
    @Query() filters: FindCommissionsDto,
    @Res() res: Response,
  ) {
    const csv = await this.commissionsService.exportCsv(user.organizationId, {
      userId: filters.userId,
      status: filters.status,
      startDate: filters.startDate,
      endDate: filters.endDate,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=comisiones_${new Date().toISOString().split('T')[0]}.csv`);
    // Add BOM for Excel UTF-8 compatibility
    res.send('\uFEFF' + csv);
  }

  @Patch(':id/pay')
  @ApiOperation({ summary: 'Mark a commission as paid' })
  @ApiResponse({ status: 200, description: 'Commission marked as paid' })
  markAsPaid(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commissionsService.markAsPaid(id, user.organizationId);
  }

  @Patch('pay-batch')
  @ApiOperation({ summary: 'Mark multiple commissions as paid' })
  @ApiResponse({ status: 200, description: 'Commissions marked as paid' })
  markManyAsPaid(
    @Body() dto: PayCommissionBatchDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commissionsService.markManyAsPaid(dto.ids, user.organizationId);
  }
}
