import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { TicketState, TicketPartState, MovementType, SaleStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.service';
import { FoliosService } from '../folios/folios.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStateDto } from './dto/update-ticket-state.dto';
import { AddTicketPartDto } from './dto/add-ticket-part.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private foliosService: FoliosService,
  ) {}

  async createTicket(createTicketDto: CreateTicketDto, user: AuthUser) {
    // PgBouncer transaction mode: Generate folio first (handles its own atomicity)
    const folio = await this.foliosService.next('LAB', createTicketDto.branchId);

    // Create ticket with nested history creation (atomic at DB level)
    const ticket = await this.prisma.ticket.create({
      data: {
        ...createTicketDto,
        folio,
        userId: user.id,
        history: {
          create: {
            toState: TicketState.RECIBIDO,
            notes: 'Ticket creado',
            userId: user.id,
          },
        },
      },
    });

    return ticket;
  }

  async getTickets(branchId: number, organizationId: number, filters?: {
    estado?: TicketState;
    q?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where: any = {
      branchId,
      branch: { organizationId },
    };

    if (filters?.estado) {
      where.state = filters.estado;
    }

    if (filters?.q) {
      where.OR = [
        { folio: { contains: filters.q, mode: 'insensitive' } },
        { customerName: { contains: filters.q, mode: 'insensitive' } },
        { device: { contains: filters.q, mode: 'insensitive' } },
        { problem: { contains: filters.q, mode: 'insensitive' } },
      ];
    }

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: {
          parts: {
            include: {
              variant: {
                include: {
                  product: {
                    select: {
                      name: true,
                      brand: true,
                      model: true,
                    },
                  },
                },
              },
            },
          },
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      data: tickets,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getTicketById(id: number, organizationId: number) {
    return this.prisma.ticket.findFirst({
      where: {
        id,
        branch: { organizationId },
      },
      include: {
        parts: {
          include: {
            variant: {
              include: {
                product: {
                  select: {
                    name: true,
                    brand: true,
                    model: true,
                  },
                },
              },
            },
          },
        },
        history: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        branch: {
          select: {
            name: true,
            code: true,
          },
        },
      },
    });
  }

  async updateTicket(id: number, updateTicketDto: UpdateTicketDto, user: AuthUser) {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id,
        branch: { organizationId: user.organizationId },
      },
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    return this.prisma.ticket.update({
      where: { id },
      data: {
        customerName: updateTicketDto.customerName ?? ticket.customerName,
        customerPhone: updateTicketDto.customerPhone ?? ticket.customerPhone,
        customerEmail: updateTicketDto.customerEmail ?? ticket.customerEmail,
        device: updateTicketDto.device ?? ticket.device,
        brand: updateTicketDto.brand ?? ticket.brand,
        model: updateTicketDto.model ?? ticket.model,
        serialNumber: updateTicketDto.serialNumber ?? ticket.serialNumber,
        problem: updateTicketDto.problem ?? ticket.problem,
        diagnosis: updateTicketDto.diagnosis ?? ticket.diagnosis,
        solution: updateTicketDto.solution ?? ticket.solution,
        estimatedCost: updateTicketDto.estimatedCost ?? ticket.estimatedCost,
        finalCost: updateTicketDto.finalCost ?? ticket.finalCost,
        estimatedTime: updateTicketDto.estimatedTime ?? ticket.estimatedTime,
        warrantyDays: updateTicketDto.warrantyDays ?? ticket.warrantyDays,
      },
    });
  }

  async updateTicketState(
    id: number,
    updateTicketStateDto: UpdateTicketStateDto,
    user: AuthUser,
    ip?: string,
    userAgent?: string,
  ) {
    // PgBouncer transaction mode: Separate queries instead of interactive transaction
    // Read ticket first
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id,
        branch: { organizationId: user.organizationId },
      },
      include: {
        parts: true,
      },
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    // Validate state transition
    this.validateStateTransition(ticket.state, updateTicketStateDto.state, user.role);

    // RF-ORD-08: Validate payment before marking as ENTREGADO
    if (updateTicketStateDto.state === TicketState.ENTREGADO) {
      const finalCost = Number(updateTicketStateDto.finalCost || ticket.finalCost || 0);
      const advancePayment = Number(ticket.advancePayment || 0);
      
      // Get total payments from sales
      const sales = await this.prisma.sale.findMany({
        where: {
          ticketId: id,
          status: SaleStatus.PAGADO,
        },
        include: {
          payments: true,
        },
      });

      const totalPaid = sales.reduce((sum, sale) => {
        return sum + sale.payments.reduce((s, p) => s + Number(p.amount), 0);
      }, advancePayment);

      if (totalPaid < finalCost) {
        throw new Error(`Cannot deliver ticket: payment incomplete. Total: ${finalCost}, Paid: ${totalPaid}`);
      }
    }

    // Prepare updates for batch transaction
    const updateData = {
      state: updateTicketStateDto.state,
      diagnosis: updateTicketStateDto.diagnosis || ticket.diagnosis,
      solution: updateTicketStateDto.solution || ticket.solution,
      estimatedCost: updateTicketStateDto.estimatedCost || ticket.estimatedCost,
      finalCost: updateTicketStateDto.finalCost || ticket.finalCost,
      advancePayment: updateTicketStateDto.advancePayment !== undefined ? updateTicketStateDto.advancePayment : ticket.advancePayment,
      internalNotes: updateTicketStateDto.internalNotes || ticket.internalNotes,
    };

    // Use batch transaction for ticket update and history creation
    const [updatedTicket] = await this.prisma.$transaction([
      this.prisma.ticket.update({
        where: { id },
        data: updateData,
      }),
      this.prisma.ticketHistory.create({
        data: {
          ticketId: id,
          fromState: ticket.state,
          toState: updateTicketStateDto.state,
          notes: updateTicketStateDto.notes,
          userId: user.id,
          ip,
          userAgent,
        },
      }),
    ]);

    // Handle state-specific logic (outside transaction - these are idempotent operations)
    if (updateTicketStateDto.state === TicketState.EN_REPARACION) {
      await this.consumeReservedPartsWithoutTx(ticket.parts, user, ip, userAgent);
    } else if (updateTicketStateDto.state === TicketState.CANCELADO) {
      await this.releaseReservedPartsWithoutTx(ticket.parts);
    }

    return updatedTicket;
  }

  async addTicketPart(id: number, addTicketPartDto: AddTicketPartDto, user: AuthUser) {
    // PgBouncer transaction mode: Read first, then batch transaction
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id,
        branch: { organizationId: user.organizationId },
      },
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    // Use batch transaction for atomic stock reservation and part creation
    const [, ticketPart] = await this.prisma.$transaction([
      this.prisma.stock.updateMany({
        where: {
          branchId: ticket.branchId,
          variantId: addTicketPartDto.variantId,
        },
        data: {
          reserved: {
            increment: addTicketPartDto.qty,
          },
        },
      }),
      this.prisma.ticketPart.create({
        data: {
          ticketId: id,
          variantId: addTicketPartDto.variantId,
          qty: addTicketPartDto.qty,
          state: TicketPartState.RESERVADA,
        },
      }),
    ]);

    return ticketPart;
  }

  private validateStateTransition(fromState: TicketState, toState: TicketState, userRole: string) {
    const validTransitions: Record<TicketState, TicketState[]> = {
      [TicketState.RECIBIDO]: [TicketState.DIAGNOSTICO, TicketState.CANCELADO],
      [TicketState.DIAGNOSTICO]: [TicketState.ESPERANDO_PIEZA, TicketState.EN_REPARACION, TicketState.CANCELADO],
      [TicketState.ESPERANDO_PIEZA]: [TicketState.EN_REPARACION, TicketState.CANCELADO],
      [TicketState.EN_REPARACION]: [TicketState.REPARADO, TicketState.CANCELADO],
      [TicketState.REPARADO]: [TicketState.ENTREGADO],
      [TicketState.ENTREGADO]: [],
      [TicketState.CANCELADO]: [],
    };

    if (!validTransitions[fromState].includes(toState)) {
      throw new Error(`Invalid state transition from ${fromState} to ${toState}`);
    }
  }

  // PgBouncer compatible: No transaction context needed
  private async consumeReservedPartsWithoutTx(parts: any[], user: AuthUser, ip?: string, userAgent?: string) {
    if (parts.length === 0) return;

    // Get ticket info for movements (parts include ticketId but not full ticket)
    const ticketIds = [...new Set(parts.map(p => p.ticketId))];
    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      select: { id: true, folio: true, branchId: true },
    });
    const ticketMap = new Map(tickets.map(t => [t.id, t]));

    // Process each part with batch transaction
    for (const part of parts) {
      if (part.state === TicketPartState.RESERVADA) {
        const ticket = ticketMap.get(part.ticketId);
        if (!ticket) continue;

        // Use batch transaction for atomic part consumption
        await this.prisma.$transaction([
          this.prisma.movement.create({
            data: {
              branchId: ticket.branchId,
              variantId: part.variantId,
              type: MovementType.EGR,
              qty: part.qty,
              reason: `Consumo por ticket ${ticket.folio}`,
              ticketId: part.ticketId,
              userId: user.id,
              ip,
              userAgent,
            },
          }),
          this.prisma.stock.updateMany({
            where: {
              branchId: ticket.branchId,
              variantId: part.variantId,
            },
            data: {
              qty: { decrement: part.qty },
              reserved: { decrement: part.qty },
            },
          }),
          this.prisma.ticketPart.update({
            where: { id: part.id },
            data: { state: TicketPartState.CONSUMIDA },
          }),
        ]);
      }
    }
  }

  // PgBouncer compatible: No transaction context needed
  private async releaseReservedPartsWithoutTx(parts: any[]) {
    if (parts.length === 0) return;

    // Get ticket info for branchId
    const ticketIds = [...new Set(parts.map(p => p.ticketId))];
    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      select: { id: true, branchId: true },
    });
    const ticketMap = new Map(tickets.map(t => [t.id, t]));

    // Process each part with batch transaction
    for (const part of parts) {
      if (part.state === TicketPartState.RESERVADA) {
        const ticket = ticketMap.get(part.ticketId);
        if (!ticket) continue;

        // Use batch transaction for atomic part release
        await this.prisma.$transaction([
          this.prisma.stock.updateMany({
            where: {
              branchId: ticket.branchId,
              variantId: part.variantId,
            },
            data: {
              reserved: { decrement: part.qty },
            },
          }),
          this.prisma.ticketPart.update({
            where: { id: part.id },
            data: { state: TicketPartState.LIBERADA },
          }),
        ]);
      }
    }
  }
}

