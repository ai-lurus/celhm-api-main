import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { AddPaymentDto } from './dto/add-payment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { SaleStatus, PaymentMethod } from '@prisma/client';

@ApiTags('sales')
@Controller('sales')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new sale' })
  @ApiResponse({ status: 201, description: 'Sale created successfully' })
  create(@Body() createSaleDto: CreateSaleDto, @CurrentUser() user: AuthUser) {
    return this.salesService.create(createSaleDto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Get all sales with filters' })
  @ApiQuery({ name: 'branchId', required: false, type: Number })
  @ApiQuery({ name: 'customerId', required: false, type: Number })
  @ApiQuery({ name: 'ticketId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: SaleStatus })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of sales' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('branchId') branchId?: string,
    @Query('customerId') customerId?: string,
    @Query('ticketId') ticketId?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.salesService.findAll(user.organizationId, {
      branchId: branchId ? parseInt(branchId) : undefined,
      customerId: customerId ? parseInt(customerId) : undefined,
      ticketId: ticketId ? parseInt(ticketId) : undefined,
      status: status as SaleStatus,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sale by ID' })
  @ApiResponse({ status: 200, description: 'Sale details' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.salesService.findOne(parseInt(id), user.organizationId);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Add payment to sale' })
  @ApiResponse({ status: 201, description: 'Payment added successfully' })
  addPayment(
    @Param('id') id: string,
    @Body() addPaymentDto: AddPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.salesService.addPayment(parseInt(id), addPaymentDto, user);
  }
}

