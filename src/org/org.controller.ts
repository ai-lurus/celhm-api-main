import { Controller, Get, Patch, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { OrgService } from './org.service';
import { UpdateOrgDto } from './dto/update-org.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@ApiTags('organizations')
@Controller('orgs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR, Role.ADMON)
@ApiBearerAuth()
export class OrgController {
  constructor(private orgService: OrgService) { }

  @Get('me')
  @ApiOperation({ summary: 'Get current organization' })
  @ApiResponse({ status: 200, description: 'Current organization data' })
  @Roles(Role.ADMINISTRADOR, Role.ADMON, Role.RECEPCIONISTA)
  async getCurrentOrganization(@CurrentUser() user: AuthUser) {
    return this.orgService.getCurrentOrganization(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current organization' })
  @ApiResponse({ status: 200, description: 'Organization updated successfully' })
  async updateOrganization(
    @CurrentUser() user: AuthUser,
    @Body() data: UpdateOrgDto,
  ) {
    return this.orgService.updateOrganization(user, data);
  }

  @Get('members')
  @ApiOperation({ summary: 'Get organization members' })
  @ApiResponse({ status: 200, description: 'Organization members list' })
  @Roles(Role.ADMINISTRADOR, Role.ADMON, Role.RECEPCIONISTA)
  async getOrganizationMembers(@CurrentUser() user: AuthUser) {
    return this.orgService.getOrganizationMembers(user.organizationId);
  }

  @Patch('members/:id')
  @ApiOperation({ summary: 'Update member role or branch' })
  @ApiResponse({ status: 200, description: 'Member updated successfully' })
  async updateMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.orgService.updateMember(user, id, dto);
  }

  @Delete('members/:id')
  @ApiOperation({ summary: 'Remove member from organization' })
  @ApiResponse({ status: 200, description: 'Member removed successfully' })
  async deleteMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orgService.deleteMember(user, id);
  }
}

