import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { CustomersController } from './customers.controller';

describe('CustomersController roles (RolesGuard integration)', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  function canActivateAs(role: Role, handlerName: keyof CustomersController): boolean {
    const context = {
      getHandler: () => CustomersController.prototype[handlerName],
      getClass: () => CustomersController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }),
      }),
    } as unknown as ExecutionContext;
    return guard.canActivate(context) as boolean;
  }

  describe.each(['create', 'findAll', 'findOne', 'update', 'remove'] as const)(
    '%s',
    (handlerName) => {
      it.each([Role.ADMINISTRADOR, Role.TECNICO, Role.CAJERO])('allows %s', (role) => {
        expect(canActivateAs(role, handlerName)).toBe(true);
      });

      it.each([Role.VENDEDOR, Role.ALMACENISTA])('denies %s', (role) => {
        expect(canActivateAs(role, handlerName)).toBe(false);
      });
    },
  );

  describe('updateGroup (admin-only reassignment)', () => {
    it('allows ADMINISTRADOR', () => {
      expect(canActivateAs(Role.ADMINISTRADOR, 'updateGroup')).toBe(true);
    });

    it.each([Role.TECNICO, Role.CAJERO, Role.VENDEDOR, Role.ALMACENISTA])(
      'still denies %s',
      (role) => {
        expect(canActivateAs(role, 'updateGroup')).toBe(false);
      },
    );
  });
});
