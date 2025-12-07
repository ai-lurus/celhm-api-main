import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TicketState } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStateDto } from './dto/update-ticket-state.dto';
import { AddTicketPartDto } from './dto/add-ticket-part.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketResponseDto, TicketsListResponseDto } from './dto/ticket-response.dto';

@ApiTags('tickets')
@Controller('tickets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TicketsController {
  constructor(private ticketsService: TicketsService) {}

  @Post()
  @ApiOperation({ 
    summary: 'Create a new repair ticket',
    description: 'Creates a new ticket with auto-generated folio and initial state RECIBIDO'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Ticket created successfully',
    type: TicketResponseDto,
    example: {
      id: 1,
      folio: 'LAB-0001',
      branchId: 1,
      customerName: 'Juan Pérez',
      customerPhone: '+52 123 456 7890',
      customerEmail: 'juan@example.com',
      device: 'iPhone 12',
      brand: 'Apple',
      model: 'iPhone 12 Pro',
      problem: 'Pantalla rota',
      state: 'RECIBIDO',
      createdAt: '2024-01-15T10:30:00Z',
      updatedAt: '2024-01-15T10:30:00Z',
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createTicket(
    @Body() createTicketDto: CreateTicketDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketsService.createTicket(createTicketDto, user);
  }

  @Get()
  @ApiOperation({ 
    summary: 'Get tickets with filters and pagination',
    description: 'Returns a paginated list of tickets for the user\'s branch. Supports filtering by state and search query.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Tickets list with pagination',
    type: TicketsListResponseDto,
  })
  @ApiQuery({ 
    name: 'estado', 
    required: false, 
    enum: TicketState,
    description: 'Filter by ticket state',
    example: 'RECIBIDO'
  })
  @ApiQuery({ 
    name: 'q', 
    required: false, 
    description: 'Search by folio, customer name, device or problem description',
    example: 'LAB-0001'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    description: 'Page number (1-based)',
    example: 1,
    type: Number
  })
  @ApiQuery({ 
    name: 'pageSize', 
    required: false, 
    description: 'Items per page (default: 50)',
    example: 20,
    type: Number
  })
  async getTickets(
    @CurrentUser() user: AuthUser,
    @Query('estado') estado?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const branchId = user.branchId || 1;
    return this.ticketsService.getTickets(branchId, user.organizationId, {
      estado: estado as any,
      q,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Get ticket by ID',
    description: 'Returns detailed information about a specific ticket including parts and history'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Ticket details with parts and history',
    type: TicketResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async getTicketById(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketsService.getTicketById(parseInt(id), user.organizationId);
  }

  @Patch(':id')
  @ApiOperation({ 
    summary: 'Update ticket information',
    description: 'Updates ticket details (customer info, device, problem, costs, etc.). Does not change the ticket state.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Ticket updated successfully',
    type: TicketResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async updateTicket(
    @Param('id') id: string,
    @Body() updateTicketDto: UpdateTicketDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketsService.updateTicket(parseInt(id), updateTicketDto, user);
  }

  @Patch(':id/estado')
  @ApiOperation({ 
    summary: 'Update ticket state',
    description: 'Changes the ticket state and creates a history entry. Can include diagnosis, solution, and cost updates.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Ticket state updated successfully',
    type: TicketResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  @ApiResponse({ status: 400, description: 'Invalid state transition or input data' })
  async updateTicketState(
    @Param('id') id: string,
    @Body() updateTicketStateDto: UpdateTicketStateDto,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    
    return this.ticketsService.updateTicketState(
      parseInt(id),
      updateTicketStateDto,
      user,
      ip,
      userAgent,
    );
  }

  @Post(':id/piezas')
  @ApiOperation({ 
    summary: 'Add part to ticket',
    description: 'Adds a part (variant) to the ticket. The part will be reserved from stock and associated with the ticket.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Part added to ticket successfully',
    type: TicketResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Ticket or variant not found' })
  @ApiResponse({ status: 400, description: 'Insufficient stock or invalid input' })
  async addTicketPart(
    @Param('id') id: string,
    @Body() addTicketPartDto: AddTicketPartDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketsService.addTicketPart(parseInt(id), addTicketPartDto, user);
  }
}

