// @ts-nocheck
import { Controller, Post, Get, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MovementType } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { MovementsService } from './movements.service';
import { CreateMovementDto } from './dto/create-movement.dto';

@ApiTags('movements')
@Controller('movements')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MovementsController {
  constructor(private movementsService: MovementsService) {}

  @Post()
  @ApiOperation({ summary: 'Create movement (entrada/salida/venta/ajuste/transferencia)' })
  @ApiResponse({ status: 201, description: 'Movement created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or insufficient stock' })
  async createMovement(
    @Body() createMovementDto: CreateMovementDto,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    
    return this.movementsService.createMovement(createMovementDto, user, ip, userAgent);
  }

  @Get()
  @ApiOperation({ summary: 'Get movements with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Movements list with pagination' })
  @ApiQuery({ name: 'sucursal', required: false, description: 'Branch ID (defaults to user branch)' })
  @ApiQuery({ name: 'tipo', required: false, enum: MovementType, description: 'Filter by movement type' })
  @ApiQuery({ name: 'variantId', required: false, description: 'Filter by variant ID' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  @ApiQuery({ name: 'fechaDesde', required: false, description: 'Filter from date (ISO format: YYYY-MM-DD)' })
  @ApiQuery({ name: 'fechaHasta', required: false, description: 'Filter to date (ISO format: YYYY-MM-DD)' })
  @ApiQuery({ name: 'q', required: false, description: 'Search by folio, product name or SKU' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)', example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Items per page', example: 50 })
  async getMovements(
    @Query('sucursal') sucursal?: string,
    @Query('tipo') tipo?: string,
    @Query('variantId') variantId?: string,
    @Query('userId') userId?: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @CurrentUser() user: AuthUser,
  ) {
    const branchId = sucursal ? parseInt(sucursal, 10) : user.branchId || 1;
    return this.movementsService.getMovements(
      branchId,
      user.organizationId,
      {
        tipo: tipo as MovementType | undefined,
        variantId: variantId ? parseInt(variantId, 10) : undefined,
        userId: userId ? parseInt(userId, 10) : undefined,
        fechaDesde: fechaDesde ? new Date(fechaDesde) : undefined,
        fechaHasta: fechaHasta ? new Date(fechaHasta) : undefined,
        q,
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
    );
  }
}

