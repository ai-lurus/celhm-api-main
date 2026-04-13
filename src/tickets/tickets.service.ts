import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { TicketState, TicketPartState, MovementType, SaleStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.service';
import { FoliosService } from '../folios/folios.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStateDto } from './dto/update-ticket-state.dto';
import { AddTicketPartDto } from './dto/add-ticket-part.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { FindTicketsDto } from './dto/find-tickets.dto';

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private foliosService: FoliosService,
  ) { }

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

  async findAll(filters: FindTicketsDto, user: AuthUser) {
    const {
      page = 1,
      pageSize = 10,
      branchId,
      state,
      startDate,
      endDate,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      kanban,
    } = filters;

    const skip = (page - 1) * pageSize;

    const where: any = {
      branch: { organizationId: user.organizationId },
    };

    if (branchId) {
      where.branchId = branchId;
    }

    if (state) {
      where.state = state;
    } else if (kanban) {
      where.state = {
        notIn: [TicketState.ENTREGADO, TicketState.CANCELADO],
      };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    if (search) {
      where.OR = [
        { folio: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search, mode: 'insensitive' } },
        { device: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
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
          assignedUser: {
            select: {
              name: true,
              email: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
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
          assignedUser: {
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
        assignedUser: {
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
        condition: updateTicketDto.condition ?? ticket.condition,
        accessories: updateTicketDto.accessories ?? ticket.accessories,
        risk: updateTicketDto.risk ?? ticket.risk,
        internalNotes: updateTicketDto.internalNotes ?? ticket.internalNotes,
        assignedUserId: updateTicketDto.assignedUserId !== undefined ? updateTicketDto.assignedUserId : ticket.assignedUserId,
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
      await this.consumeReservedPartsWithoutTx(ticket.parts);
    } else if (updateTicketStateDto.state === TicketState.CANCELADO) {
      await this.releaseReservedPartsWithoutTx(ticket.parts, user, ip, userAgent);
    }

    return updatedTicket;
  }

  async addTicketPart(id: number, addTicketPartDto: AddTicketPartDto, user: AuthUser, ip?: string, userAgent?: string) {
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

    // Use batch transaction for atomic stock reservation, part creation and movement
    const [, ticketPart] = await this.prisma.$transaction([
      this.prisma.stock.updateMany({
        where: {
          branchId: ticket.branchId,
          variantId: addTicketPartDto.variantId,
        },
        data: {
          qty: {
            decrement: addTicketPartDto.qty,
          },
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
      this.prisma.movement.create({
        data: {
          branchId: ticket.branchId,
          variantId: addTicketPartDto.variantId,
          type: MovementType.EGR,
          qty: addTicketPartDto.qty,
          reason: `Adición a ticket ${ticket.folio}`,
          ticketId: id,
          userId: user.id,
          ip,
          userAgent,
        },
      }),
    ]);

    return ticketPart;
  }

  async removeTicketPart(id: number, partId: number, user: AuthUser, ip?: string, userAgent?: string) {
    // Read part and ticket first
    const ticketPart = await this.prisma.ticketPart.findFirst({
      where: {
        id: partId,
        ticketId: id,
        ticket: {
          branch: { organizationId: user.organizationId },
        },
      },
      include: {
        ticket: true,
      },
    });

    if (!ticketPart) {
      throw new Error('Ticket part not found');
    }

    // Use batch transaction for atomic stock restoration, part deletion and movement
    await this.prisma.$transaction([
      this.prisma.stock.updateMany({
        where: {
          branchId: ticketPart.ticket.branchId,
          variantId: ticketPart.variantId,
        },
        data: {
          qty: {
            increment: ticketPart.qty,
          },
          reserved: {
            decrement: ticketPart.qty,
          },
        },
      }),
      this.prisma.ticketPart.delete({
        where: { id: partId },
      }),
      this.prisma.movement.create({
        data: {
          branchId: ticketPart.ticket.branchId,
          variantId: ticketPart.variantId,
          type: MovementType.ING,
          qty: ticketPart.qty,
          reason: `Remoción de ticket ${ticketPart.ticket.folio}`,
          ticketId: id,
          userId: user.id,
          ip,
          userAgent,
        },
      }),
    ]);

    return { success: true };
  }

  // PgBouncer compatible: No transaction context needed
  private async consumeReservedPartsWithoutTx(parts: any[]) {
    if (parts.length === 0) return;

    // Process each part with batch transaction
    for (const part of parts) {
      if (part.state === TicketPartState.RESERVADA) {
        // Use batch transaction for atomic part consumption
        // Qty was already decremented on addTicketPart, so we just clear reserved
        await this.prisma.$transaction([
          this.prisma.stock.updateMany({
            where: {
              branchId: part.ticket.branchId,
              variantId: part.variantId,
            },
            data: {
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
  private async releaseReservedPartsWithoutTx(parts: any[], user: AuthUser, ip?: string, userAgent?: string) {
    if (parts.length === 0) return;

    // Process each part with batch transaction
    for (const part of parts) {
      if (part.state === TicketPartState.RESERVADA) {
        // Use batch transaction for atomic part release
        // Increment qty to restore it, and clear reserved
        await this.prisma.$transaction([
          this.prisma.stock.updateMany({
            where: {
              branchId: part.ticket.branchId,
              variantId: part.variantId,
            },
            data: {
              qty: { increment: part.qty },
              reserved: { decrement: part.qty },
            },
          }),
          this.prisma.ticketPart.update({
            where: { id: part.id },
            data: { state: TicketPartState.LIBERADA },
          }),
          this.prisma.movement.create({
            data: {
              branchId: part.ticket.branchId,
              variantId: part.variantId,
              type: MovementType.ING,
              qty: part.qty,
              reason: `Restauración por cancelación de ticket ${part.ticket.folio}`,
              ticketId: part.ticketId,
              userId: user.id,
              ip,
              userAgent,
            },
          }),
        ]);
      }
    }
  }
}

