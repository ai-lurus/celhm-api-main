import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CustomerGroupsService } from './customer-groups.service';
import { CreateCustomerGroupDto } from './dto/create-customer-group.dto';
import { RenameCustomerGroupDto } from './dto/rename-customer-group.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';

@ApiTags('customer-groups')
@Controller('customer-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CustomerGroupsController {
  constructor(private readonly customerGroupsService: CustomerGroupsService) {}

  @Get()
  @Roles(Role.ADMINISTRADOR, Role.VENDEDOR)
  @ApiOperation({ summary: "List the organization's customer groups" })
  @ApiResponse({ status: 200, description: 'List of customer groups' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.customerGroupsService.findAll(user.organizationId);
  }

  @Post()
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Create a customer group' })
  @ApiResponse({ status: 201, description: 'Customer group created successfully' })
  create(@Body() dto: CreateCustomerGroupDto, @CurrentUser() user: AuthUser) {
    return this.customerGroupsService.create(dto, user.organizationId);
  }

  @Patch(':id')
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Rename a customer group' })
  @ApiResponse({ status: 200, description: 'Customer group renamed successfully' })
  rename(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenameCustomerGroupDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customerGroupsService.rename(id, dto, user.organizationId);
  }

  @Delete(':id')
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Delete a customer group (must be empty and not a system group)' })
  @ApiResponse({ status: 200, description: 'Customer group deleted successfully' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.customerGroupsService.remove(id, user.organizationId);
  }
}
