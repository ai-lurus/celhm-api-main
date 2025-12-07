import { Test, TestingModule } from '@nestjs/testing';
import { TicketsService } from './tickets.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { FoliosService } from '../folios/folios.service';
import { TicketState, Role } from '@prisma/client';

describe('TicketsService', () => {
  let service: TicketsService;
  let prismaService: PrismaService;
  let foliosService: FoliosService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    ticket: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    ticketHistory: {
      create: jest.fn(),
    },
    ticketPart: {
      create: jest.fn(),
    },
    stock: {
      updateMany: jest.fn(),
    },
    movement: {
      create: jest.fn(),
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
    prismaService = module.get<PrismaService>(PrismaService);
    foliosService = module.get<FoliosService>(FoliosService);
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
        folio: 'LAB-SUC01-202412-0001',
        ...createTicketDto,
        state: TicketState.RECIBIDO,
        userId: mockUser.id,
      };

      mockFoliosService.next.mockResolvedValue('LAB-SUC01-202412-0001');
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          ticket: {
            create: jest.fn().mockResolvedValue(mockTicket),
          },
          ticketHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        });
      });

      const result = await service.createTicket(createTicketDto, mockUser);

      expect(result).toEqual(mockTicket);
      expect(mockFoliosService.next).toHaveBeenCalledWith('LAB', 1);
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
      };

      const mockUpdatedTicket = {
        ...mockTicket,
        state: TicketState.DIAGNOSTICO,
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          ticket: {
            findFirst: jest.fn().mockResolvedValue(mockTicket),
            update: jest.fn().mockResolvedValue(mockUpdatedTicket),
          },
          ticketHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        });
      });

      const result = await service.updateTicketState(
        ticketId,
        updateDto,
        mockUser,
        '127.0.0.1',
        'test-agent'
      );

      expect(result).toEqual(mockUpdatedTicket);
    });

    it('should throw error for invalid state transition', async () => {
      const ticketId = 1;
      const updateDto = {
        state: TicketState.ENTREGADO, // Invalid transition from RECIBIDO
        notes: 'Invalid transition',
      };

      const mockTicket = {
        id: 1,
        state: TicketState.RECIBIDO,
        parts: [],
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          ticket: {
            findFirst: jest.fn().mockResolvedValue(mockTicket),
          },
        });
      });

      await expect(
        service.updateTicketState(ticketId, updateDto, mockUser)
      ).rejects.toThrow('Invalid state transition');
    });

    it('should throw error if ticket not found', async () => {
      const ticketId = 999;
      const updateDto = {
        state: TicketState.DIAGNOSTICO,
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          ticket: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        });
      });

      await expect(
        service.updateTicketState(ticketId, updateDto, mockUser)
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

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          ticket: {
            findFirst: jest.fn().mockResolvedValue(mockTicket),
          },
          stock: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          ticketPart: {
            create: jest.fn().mockResolvedValue(mockTicketPart),
          },
        });
      });

      const result = await service.addTicketPart(ticketId, addPartDto, mockUser);

      expect(result).toEqual(mockTicketPart);
    });
  });
});

