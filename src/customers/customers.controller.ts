import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { UpdateCustomerGroupDto } from './dto/update-customer-group.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';

@ApiTags('customers')
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR, Role.TECNICO, Role.CAJERO)
@ApiBearerAuth()
export class CustomersController {
  constructor(private readonly customersService: CustomersService) { }

  @Post()
  @ApiOperation({ summary: 'Create a new customer' })
  @ApiResponse({ status: 201, description: 'Customer created successfully' })
  create(@Body() createCustomerDto: CreateCustomerDto, @CurrentUser() user: AuthUser) {
    return this.customersService.create(createCustomerDto, user.organizationId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all customers with filters' })
  @ApiQuery({ name: 'q', required: false, description: 'Search by name, phone or email' })
  @ApiQuery({ name: 'branchId', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of customers' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('branchId') branchId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.customersService.findAll(user.organizationId, {
      q,
      branchId: branchId ? parseInt(branchId) : undefined,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID with history' })
  @ApiResponse({ status: 200, description: 'Customer details' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.customersService.findOne(parseInt(id), user.organizationId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update customer' })
  @ApiResponse({ status: 200, description: 'Customer updated successfully' })
  update(
    @Param('id') id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customersService.update(parseInt(id), updateCustomerDto, user.organizationId);
  }

  @Patch(':id/group')
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Manually change a customer\'s group (does not reset their purchase count)' })
  @ApiResponse({ status: 200, description: 'Customer group updated successfully' })
  updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerGroupDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customersService.updateGroup(parseInt(id), dto.groupId, user.organizationId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete customer' })
  @ApiResponse({ status: 200, description: 'Customer deleted successfully' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.customersService.remove(parseInt(id), user.organizationId);
  }
}

