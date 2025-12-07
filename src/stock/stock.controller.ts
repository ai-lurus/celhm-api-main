// @ts-nocheck
import { Controller, Get, Patch, Body, Param, UseGuards, Query, Post, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { StockService } from './stock.service';
import { UpdateStockMinDto } from './dto/update-stock-min.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

@ApiTags('stock')
@Controller('stock')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StockController {
  constructor(private stockService: StockService) {}

  @Get()
  @ApiOperation({ summary: 'Get stock by branch' })
  @ApiResponse({ status: 200, description: 'Stock list' })
  async getStock(
    @CurrentUser() user: AuthUser,
    @Query('sucursal') sucursal?: string,
    @Query('marca') marca?: string,
    @Query('modelo') modelo?: string,
    @Query('estado') estado?: string,
    @Query('categoriaId') categoriaId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const branchId = sucursal ? parseInt(sucursal, 10) : user.branchId || 1;
    return this.stockService.getStock(branchId, user.organizationId, {
      marca,
      modelo,
      estado: estado as 'normal' | 'low' | 'critical' | undefined,
      categoriaId,
      q,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Patch('min')
  @ApiOperation({ summary: 'Update stock minimum' })
  @ApiResponse({ status: 200, description: 'Stock minimum updated' })
  async updateStockMin(
    @Body() updateStockMinDto: UpdateStockMinDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stockService.updateStockMin(
      updateStockMinDto.branchId,
      updateStockMinDto.variantId,
      updateStockMinDto.min,
      user.organizationId,
    );
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get low stock alerts' })
  @ApiResponse({ status: 200, description: 'Low stock alerts' })
  async getLowStockAlerts(@CurrentUser() user: AuthUser) {
    return this.stockService.getLowStockAlerts(user.organizationId);
  }

  @Post('items')
  @ApiOperation({ summary: 'Create inventory item (product + variant + stock)' })
  @ApiResponse({ status: 201, description: 'Inventory item created' })
  async createInventoryItem(
    @Body() dto: CreateInventoryItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stockService.createInventoryItem(dto, user);
  }

  @Patch('items/:id')
  @ApiOperation({ summary: 'Update inventory item' })
  @ApiResponse({ status: 200, description: 'Inventory item updated' })
  async updateInventoryItem(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stockService.updateInventoryItem(parseInt(id, 10), dto, user);
  }

  @Delete('items/:id')
  @ApiOperation({ summary: 'Delete inventory item' })
  @ApiResponse({ status: 200, description: 'Inventory item deleted' })
  async deleteInventoryItem(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stockService.deleteInventoryItem(parseInt(id, 10), user);
  }
}

