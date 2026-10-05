import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { Role, TicketState, MovementType } from '@prisma/client';
import type { Response } from 'express';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) { }

  @Get('sales')
  @ApiOperation({ summary: 'Get sales report (RF-REP-01)' })
  @ApiQuery({ name: 'branchId', required: false, type: Number })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Sales report' })
  getSalesReport(
    @CurrentUser() user: AuthUser,
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate: string = new Date().toISOString(),
    @Query('endDate') endDate: string = new Date().toISOString(),
  ) {
    return this.reportsService.getSalesReport(user.organizationId, {
      branchId: branchId ? parseInt(branchId) : undefined,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
  }

  @Get('tickets')
  @ApiOperation({ summary: 'Get tickets report (RF-REP-02)' })
  @ApiQuery({ name: 'branchId', required: false, type: Number })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'state', required: false, enum: TicketState })
  @ApiResponse({ status: 200, description: 'Tickets report' })
  getTicketsReport(
    @CurrentUser() user: AuthUser,
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('state') state?: string,
  ) {
    return this.reportsService.getTicketsReport(user.organizationId, {
      branchId: branchId ? parseInt(branchId) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      state: state as TicketState,
    });
  }

  @Get('movements')
  @ApiOperation({ summary: 'Get movements report (RF-REP-04)' })
  @ApiQuery({ name: 'branchId', required: false, type: Number })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiQuery({ name: 'type', required: false, enum: MovementType })
  @ApiResponse({ status: 200, description: 'Movements report' })
  getMovementsReport(
    @CurrentUser() user: AuthUser,
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate: string = new Date().toISOString(),
    @Query('endDate') endDate: string = new Date().toISOString(),
    @Query('type') type?: string,
  ) {
    return this.reportsService.getMovementsReport(user.organizationId, {
      branchId: branchId ? parseInt(branchId) : undefined,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      type: type as MovementType | undefined,
    });
  }

  @Get('inventory')
  @ApiOperation({ summary: 'Get inventory report (RF-REP-03)' })
  @ApiQuery({ name: 'branchId', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Inventory report' })
  getInventoryReport(
    @CurrentUser() user: AuthUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.reportsService.getInventoryReport(user.organizationId, {
      branchId: branchId ? parseInt(branchId) : undefined,
    });
  }

  @Get('commissions-sales')
  @ApiOperation({ summary: 'Get sales report for commissions (RF-REP-05)' })
  @ApiQuery({ name: 'branchId', required: false, type: Number })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Commissions sales report' })
  getCommissionsSalesReport(
    @CurrentUser() user: AuthUser,
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate: string = new Date().toISOString(),
    @Query('endDate') endDate: string = new Date().toISOString(),
  ) {
    return this.reportsService.getCommissionsSalesReport(user.organizationId, {
      branchId: branchId ? parseInt(branchId) : undefined,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
  }

  @Get('commissions-sales/export')
  @ApiOperation({ summary: 'Export sales report for commissions to CSV' })
  @ApiQuery({ name: 'branchId', required: false, type: Number })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiResponse({ status: 200, description: 'CSV file download' })
  async exportCommissionsSalesReport(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate: string = new Date().toISOString(),
    @Query('endDate') endDate: string = new Date().toISOString(),
  ) {
    const report = await this.reportsService.getCommissionsSalesReport(user.organizationId, {
      branchId: branchId ? parseInt(branchId) : undefined,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
    const csv = this.reportsService.exportCommissionsSalesCsv(report);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=ventas_comisiones_${new Date().toISOString().split('T')[0]}.csv`);
    res.send('﻿' + csv);
  }

  @Get('sales-by-seller')
  @ApiOperation({ summary: 'Get sales by seller report (RF-REP-06)' })
  @ApiQuery({ name: 'branchId', required: false, type: Number })
  @ApiQuery({ name: 'sellerId', required: false, type: Number })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiQuery({ name: 'detailLevel', required: true, enum: ['TOTALS_BY_SELLER', 'TOTALS_BY_DOCUMENT', 'DOCUMENT_DETAILS', 'DOCUMENT_DETAILS_SERIAL'] })
  @ApiResponse({ status: 200, description: 'Sales by seller report' })
  getSalesBySellerReport(
    @CurrentUser() user: AuthUser,
    @Query('branchId') branchId?: string,
    @Query('sellerId') sellerId?: string,
    @Query('startDate') startDate: string = new Date().toISOString(),
    @Query('endDate') endDate: string = new Date().toISOString(),
    @Query('detailLevel') detailLevel: 'TOTALS_BY_SELLER' | 'TOTALS_BY_DOCUMENT' | 'DOCUMENT_DETAILS' | 'DOCUMENT_DETAILS_SERIAL' = 'TOTALS_BY_SELLER',
  ) {
    return this.reportsService.getSalesBySellerReport(user.organizationId, {
      branchId: branchId ? parseInt(branchId) : undefined,
      sellerId: sellerId ? parseInt(sellerId) : undefined,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      detailLevel,
    });
  }

  @Get('sales-by-seller/export')
  @ApiOperation({ summary: 'Export sales by seller report to CSV' })
  @ApiQuery({ name: 'branchId', required: false, type: Number })
  @ApiQuery({ name: 'sellerId', required: false, type: Number })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiQuery({ name: 'detailLevel', required: true, enum: ['TOTALS_BY_SELLER', 'TOTALS_BY_DOCUMENT', 'DOCUMENT_DETAILS', 'DOCUMENT_DETAILS_SERIAL'] })
  @ApiResponse({ status: 200, description: 'CSV file download' })
  async exportSalesBySellerReport(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('branchId') branchId?: string,
    @Query('sellerId') sellerId?: string,
    @Query('startDate') startDate: string = new Date().toISOString(),
    @Query('endDate') endDate: string = new Date().toISOString(),
    @Query('detailLevel') detailLevel: 'TOTALS_BY_SELLER' | 'TOTALS_BY_DOCUMENT' | 'DOCUMENT_DETAILS' | 'DOCUMENT_DETAILS_SERIAL' = 'TOTALS_BY_SELLER',
  ) {
    const report = await this.reportsService.getSalesBySellerReport(user.organizationId, {
      branchId: branchId ? parseInt(branchId) : undefined,
      sellerId: sellerId ? parseInt(sellerId) : undefined,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      detailLevel,
    });
    const csv = this.reportsService.exportSalesBySellerCsv(report);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=ventas_por_vendedor_${new Date().toISOString().split('T')[0]}.csv`);
    res.send('﻿' + csv);
  }
}

