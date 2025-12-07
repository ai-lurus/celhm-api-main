import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { BranchesService } from './branches.service';

@ApiTags('branches')
@Controller('branches')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BranchesController {
  constructor(private branchesService: BranchesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all branches' })
  @ApiResponse({ status: 200, description: 'Branches list' })
  async getBranches(@CurrentUser() user: AuthUser) {
    return this.branchesService.getBranches(user.organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get branch by ID' })
  @ApiResponse({ status: 200, description: 'Branch details' })
  async getBranchById(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.branchesService.getBranchById(parseInt(id), user.organizationId);
  }
}

