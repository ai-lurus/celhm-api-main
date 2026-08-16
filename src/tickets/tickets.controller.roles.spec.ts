import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { TicketsController } from './tickets.controller';

describe('TicketsController roles (RolesGuard integration)', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  function canActivateAs(role: Role, handlerName: keyof TicketsController): boolean {
    const context = {
      getHandler: () => TicketsController.prototype[handlerName],
      getClass: () => TicketsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }),
      }),
    } as unknown as ExecutionContext;
    return guard.canActivate(context) as boolean;
  }

  describe.each([
    'createTicket',
    'getTickets',
    'getTicketById',
    'updateTicket',
    'updateTicketState',
    'addTicketPart',
    'removeTicketPart',
  ] as const)('%s', (handlerName) => {
    it.each([Role.ADMINISTRADOR, Role.TECNICO, Role.CAJERO])('allows %s', (role) => {
      expect(canActivateAs(role, handlerName)).toBe(true);
    });

    it.each([Role.VENDEDOR, Role.ALMACENISTA])('denies %s', (role) => {
      expect(canActivateAs(role, handlerName)).toBe(false);
    });
  });
});
