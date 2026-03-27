import { Test, TestingModule } from '@nestjs/testing';
import { TicketsService } from './tickets.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { FoliosService } from '../folios/folios.service';
import { TicketState, Role } from '@prisma/client';

describe('TicketsService', () => {
  let service: TicketsService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    ticket: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    ticketHistory: {
      create: jest.fn(),
    },
    ticketPart: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    stock: {
      updateMany: jest.fn(),
    },
    movement: {
      create: jest.fn(),
    },
    sale: {
      findMany: jest.fn(),
    },
  };

  const mockFoliosService = {
    next: jest.fn(),
  };

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    role: Role.LABORATORIO,
    organizationId: 1,
    branchId: 1,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Make mock methods return their arguments so we can verify them in $transaction
    const mockMethod = (name: string) => jest.fn().mockImplementation((args) => ({ _method: name, ...args }));
    
    mockPrismaService.ticket.create = mockMethod('ticket.create');
    mockPrismaService.ticket.update = mockMethod('ticket.update');
    mockPrismaService.ticket.findFirst = jest.fn(); // Keep as is for data return
    mockPrismaService.ticketPart.create = mockMethod('ticketPart.create');
    mockPrismaService.ticketPart.update = mockMethod('ticketPart.update');
    mockPrismaService.ticketPart.delete = mockMethod('ticketPart.delete');
    mockPrismaService.ticketPart.findFirst = jest.fn(); // Keep as is for data return
    mockPrismaService.stock.updateMany = mockMethod('stock.updateMany');
    mockPrismaService.movement.create = mockMethod('movement.create');
    mockPrismaService.ticketHistory.create = mockMethod('ticketHistory.create');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: FoliosService,
          useValue: mockFoliosService,
        },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTicket', () => {
    it('should create a new ticket', async () => {
      const createTicketDto = {
        branchId: 1,
        customerName: 'John Doe',
        device: 'iPhone 12',
        problem: 'Screen broken',
      };

      const mockTicket = {
        id: 1,
        folio: '20260324-001',
        ...createTicketDto,
        state: TicketState.RECIBIDO,
        userId: mockUser.id,
      };

      mockFoliosService.next.mockResolvedValue('20260324-001');
      mockPrismaService.ticket.create.mockResolvedValue(mockTicket);

      const result = await service.createTicket(createTicketDto, mockUser);

      expect(result).toEqual(mockTicket);
      expect(mockFoliosService.next).toHaveBeenCalledWith('LAB', 1);
      expect(mockPrismaService.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ folio: '20260324-001' }),
        }),
      );
    });
  });

  describe('updateTicketState', () => {
    it('should update ticket state successfully', async () => {
      const ticketId = 1;
      const updateDto = {
        state: TicketState.DIAGNOSTICO,
        notes: 'Diagnosis completed',
      };

      const mockTicket = {
        id: 1,
        state: TicketState.RECIBIDO,
        parts: [],
        finalCost: null,
        advancePayment: null,
      };

      const mockUpdatedTicket = {
        ...mockTicket,
        state: TicketState.DIAGNOSTICO,
      };

      mockPrismaService.ticket.findFirst.mockResolvedValue(mockTicket);
      mockPrismaService.$transaction.mockResolvedValue([mockUpdatedTicket, {}]);

      const result = await service.updateTicketState(
        ticketId,
        updateDto,
        mockUser,
        '127.0.0.1',
        'test-agent',
      );

      expect(result).toEqual(mockUpdatedTicket);
    });

    it('should throw error if ticket not found', async () => {
      const ticketId = 999;
      const updateDto = {
        state: TicketState.DIAGNOSTICO,
      };

      mockPrismaService.ticket.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTicketState(ticketId, updateDto, mockUser),
      ).rejects.toThrow('Ticket not found');
    });
  });

  describe('addTicketPart', () => {
    it('should add part to ticket and reserve stock', async () => {
      const ticketId = 1;
      const addPartDto = {
        variantId: 1,
        qty: 2,
      };

      const mockTicket = {
        id: 1,
        branchId: 1,
      };

      const mockTicketPart = {
        id: 1,
        ticketId: 1,
        variantId: 1,
        qty: 2,
        state: 'RESERVADA',
      };

      mockPrismaService.ticket.findFirst.mockResolvedValue(mockTicket);
      mockPrismaService.$transaction.mockResolvedValue([{ count: 1 }, mockTicketPart]);

      const result = await service.addTicketPart(ticketId, addPartDto, mockUser);

      expect(result).toEqual(mockTicketPart);
      expect(mockPrismaService.$transaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            _method: 'stock.updateMany',
            where: { branchId: 1, variantId: 1 },
            data: { qty: { decrement: 2 }, reserved: { increment: 2 } },
          }),
          expect.objectContaining({
            _method: 'movement.create',
            data: expect.objectContaining({
              type: 'EGR',
              qty: 2,
              ticketId: 1,
            }),
          }),
        ]),
      );
    });
  });

  describe('removeTicketPart', () => {
    it('should remove part from ticket and restore stock', async () => {
      const ticketId = 1;
      const partId = 1;

      const mockTicketPart = {
        id: 1,
        ticketId: 1,
        variantId: 1,
        qty: 2,
        ticket: {
          folio: '20260324-001',
          branchId: 1,
        },
      };

      mockPrismaService.ticketPart.findFirst.mockResolvedValue(mockTicketPart);
      mockPrismaService.$transaction.mockResolvedValue([{}, {}, {}]);

      const result = await service.removeTicketPart(ticketId, partId, mockUser);

      expect(result).toEqual({ success: true });
      expect(mockPrismaService.$transaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            _method: 'stock.updateMany',
            where: { branchId: 1, variantId: 1 },
            data: { qty: { increment: 2 }, reserved: { decrement: 2 } },
          }),
          expect.objectContaining({
            _method: 'movement.create',
            data: expect.objectContaining({
              type: 'ING',
              qty: 2,
              ticketId: 1,
            }),
          }),
        ]),
      );
    });
  });
});
