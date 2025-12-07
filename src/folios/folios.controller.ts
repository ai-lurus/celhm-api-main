import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FoliosService } from './folios.service';

@ApiTags('folios')
@Controller('folios')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FoliosController {
  constructor(private foliosService: FoliosService) {}

  @Get('preview')
  @ApiOperation({ summary: 'Preview next folio' })
  @ApiResponse({ status: 200, description: 'Next folio preview' })
  async preview(
    @Query('prefijo') prefijo: string,
    @Query('sucursal') sucursal: string,
  ) {
    const branchId = parseInt(sucursal);
    return this.foliosService.preview(prefijo, branchId);
  }
}

