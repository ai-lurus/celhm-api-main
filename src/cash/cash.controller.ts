import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CashService } from './cash.service';
import { CreateCashCutDto } from './dto/create-cash-cut.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';

@ApiTags('cash')
@Controller('cash')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CashController {
  constructor(private readonly cashService: CashService) {}

  @Get('registers')
  @ApiOperation({ summary: 'Get cash registers for a branch' })
  @ApiQuery({ name: 'branchId', required: true, type: Number })
  @ApiResponse({ status: 200, description: 'List of cash registers' })
  getCashRegisters(@Query('branchId') branchId: string, @CurrentUser() user: AuthUser) {
    return this.cashService.getCashRegisters(parseInt(branchId), user.organizationId);
  }

  @Post('cuts')
  @ApiOperation({ summary: 'Create a daily cash cut' })
  @ApiResponse({ status: 201, description: 'Cash cut created successfully' })
  createCashCut(@Body() createCashCutDto: CreateCashCutDto, @CurrentUser() user: AuthUser) {
    return this.cashService.createCashCut(createCashCutDto, user);
  }

  @Get('cuts')
  @ApiOperation({ summary: 'Get cash cuts with filters' })
  @ApiQuery({ name: 'branchId', required: true, type: Number })
  @ApiQuery({ name: 'cashRegisterId', required: false, type: Number })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of cash cuts' })
  getCashCuts(
    @Query('branchId') branchId: string,
    @CurrentUser() user: AuthUser,
    @Query('cashRegisterId') cashRegisterId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.cashService.getCashCuts(parseInt(branchId), user.organizationId, {
      cashRegisterId: cashRegisterId ? parseInt(cashRegisterId) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    });
  }

  @Get('cuts/:id')
  @ApiOperation({ summary: 'Get cash cut by ID' })
  @ApiResponse({ status: 200, description: 'Cash cut details' })
  getCashCutById(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.cashService.getCashCutById(parseInt(id), user.organizationId);
  }
}

