import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { SalesController } from './sales.controller';

describe('SalesController roles (RolesGuard integration)', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  function canActivateAs(role: Role, handlerName: keyof SalesController): boolean {
    const context = {
      getHandler: () => SalesController.prototype[handlerName],
      getClass: () => SalesController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }),
      }),
    } as unknown as ExecutionContext;
    return guard.canActivate(context) as boolean;
  }

  describe.each(['create', 'findAll', 'findOne', 'addPayment'] as const)(
    '%s (CAJERO can operate sales)',
    (handlerName) => {
      it('allows CAJERO', () => {
        expect(canActivateAs(Role.CAJERO, handlerName)).toBe(true);
      });
    },
  );

  describe.each(['createReturn', 'cancelSale'] as const)(
    '%s (returns/cancellations stay restricted)',
    (handlerName) => {
      it('still denies CAJERO', () => {
        expect(canActivateAs(Role.CAJERO, handlerName)).toBe(false);
      });

      it('still allows ADMINISTRADOR', () => {
        expect(canActivateAs(Role.ADMINISTRADOR, handlerName)).toBe(true);
      });
    },
  );
});
