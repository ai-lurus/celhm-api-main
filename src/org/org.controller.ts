import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { OrgService } from './org.service';

@ApiTags('organizations')
@Controller('orgs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrgController {
  constructor(private orgService: OrgService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current organization' })
  @ApiResponse({ status: 200, description: 'Current organization data' })
  async getCurrentOrganization(@CurrentUser() user: AuthUser) {
    return this.orgService.getCurrentOrganization(user);
  }

  @Get('members')
  @ApiOperation({ summary: 'Get organization members' })
  @ApiResponse({ status: 200, description: 'Organization members list' })
  async getOrganizationMembers(@CurrentUser() user: AuthUser) {
    return this.orgService.getOrganizationMembers(user.organizationId);
  }
}

