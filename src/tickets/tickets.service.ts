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
    return this.prisma.$transaction(async (tx) => {
      // Generate folio
      const folio = await this.foliosService.next('LAB', createTicketDto.branchId);

      // Create ticket
      const ticket = await tx.ticket.create({
        data: {
          ...createTicketDto,
          folio,
          userId: user.id,
        },
      });

      // Create initial history
      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          toState: TicketState.RECIBIDO,
          notes: 'Ticket creado',
          userId: user.id,
        },
      });

      return ticket;
    });
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
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findFirst({
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
        const sales = await tx.sale.findMany({
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

      // Update ticket
      const updatedTicket = await tx.ticket.update({
        where: { id },
        data: {
          state: updateTicketStateDto.state,
          diagnosis: updateTicketStateDto.diagnosis || ticket.diagnosis,
          solution: updateTicketStateDto.solution || ticket.solution,
          estimatedCost: updateTicketStateDto.estimatedCost || ticket.estimatedCost,
          finalCost: updateTicketStateDto.finalCost || ticket.finalCost,
          advancePayment: updateTicketStateDto.advancePayment !== undefined ? updateTicketStateDto.advancePayment : ticket.advancePayment,
          internalNotes: updateTicketStateDto.internalNotes || ticket.internalNotes,
        },
      });

      // Create history entry
      await tx.ticketHistory.create({
        data: {
          ticketId: id,
          fromState: ticket.state,
          toState: updateTicketStateDto.state,
          notes: updateTicketStateDto.notes,
          userId: user.id,
          ip,
          userAgent,
        },
      });

      // Handle state-specific logic
      if (updateTicketStateDto.state === TicketState.EN_REPARACION) {
        // Consume reserved parts
        await this.consumeReservedParts(tx, ticket.parts, user, ip, userAgent);
      } else if (updateTicketStateDto.state === TicketState.CANCELADO) {
        // Release reserved parts
        await this.releaseReservedParts(tx, ticket.parts);
      }

      return updatedTicket;
    });
  }

  async addTicketPart(id: number, addTicketPartDto: AddTicketPartDto, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findFirst({
        where: {
          id,
          branch: { organizationId: user.organizationId },
        },
      });

      if (!ticket) {
        throw new Error('Ticket not found');
      }

      // Reserve stock
      await tx.stock.updateMany({
        where: {
          branchId: ticket.branchId,
          variantId: addTicketPartDto.variantId,
        },
        data: {
          reserved: {
            increment: addTicketPartDto.qty,
          },
        },
      });

      // Add ticket part
      return tx.ticketPart.create({
        data: {
          ticketId: id,
          variantId: addTicketPartDto.variantId,
          qty: addTicketPartDto.qty,
          state: TicketPartState.RESERVADA,
        },
      });
    });
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

  private async consumeReservedParts(tx: any, parts: any[], user: AuthUser, ip?: string, userAgent?: string) {
    for (const part of parts) {
      if (part.state === TicketPartState.RESERVADA) {
        // Create EGR movement
        await tx.movement.create({
          data: {
            branchId: part.ticket.branchId,
            variantId: part.variantId,
            type: MovementType.EGR,
            qty: part.qty,
            reason: `Consumo por ticket ${part.ticket.folio}`,
            ticketId: part.ticketId,
            userId: user.id,
            ip,
            userAgent,
          },
        });

        // Update stock
        await tx.stock.updateMany({
          where: {
            branchId: part.ticket.branchId,
            variantId: part.variantId,
          },
          data: {
            qty: { decrement: part.qty },
            reserved: { decrement: part.qty },
          },
        });

        // Update part state
        await tx.ticketPart.update({
          where: { id: part.id },
          data: { state: TicketPartState.CONSUMIDA },
        });
      }
    }
  }

  private async releaseReservedParts(tx: any, parts: any[]) {
    for (const part of parts) {
      if (part.state === TicketPartState.RESERVADA) {
        // Release stock
        await tx.stock.updateMany({
          where: {
            branchId: part.ticket.branchId,
            variantId: part.variantId,
          },
          data: {
            reserved: { decrement: part.qty },
          },
        });

        // Update part state
        await tx.ticketPart.update({
          where: { id: part.id },
          data: { state: TicketPartState.LIBERADA },
        });
      }
    }
  }
}

