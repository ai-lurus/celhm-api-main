import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { TicketState } from '@prisma/client';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

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
}

