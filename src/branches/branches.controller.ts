import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { BranchesService } from './branches.service';

@ApiTags('branches')
@Controller('branches')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR, Role.ADMON)
@ApiBearerAuth()
export class BranchesController {
  constructor(private branchesService: BranchesService) { }

  @Get()
  @ApiOperation({ summary: 'Get all branches' })
  @ApiResponse({ status: 200, description: 'Branches list' })
  @Roles(Role.ADMINISTRADOR, Role.ADMON, Role.VENTAS)
  async getBranches(@CurrentUser() user: AuthUser) {
    return this.branchesService.getBranches(user.organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get branch by ID' })
  @ApiResponse({ status: 200, description: 'Branch details' })
  @Roles(Role.ADMINISTRADOR, Role.ADMON, Role.VENTAS)
  async getBranchById(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.branchesService.getBranchById(parseInt(id), user.organizationId);
  }
}

