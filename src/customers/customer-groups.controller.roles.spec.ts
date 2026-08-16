import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { CustomerGroupsController } from './customer-groups.controller';

describe('CustomerGroupsController roles (RolesGuard integration)', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  function canActivateAs(role: Role, handlerName: keyof CustomerGroupsController): boolean {
    const context = {
      getHandler: () => CustomerGroupsController.prototype[handlerName],
      getClass: () => CustomerGroupsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }),
      }),
    } as unknown as ExecutionContext;
    return guard.canActivate(context) as boolean;
  }

  describe('findAll (read groups)', () => {
    it.each([Role.ADMINISTRADOR, Role.TECNICO, Role.CAJERO])('allows %s', (role) => {
      expect(canActivateAs(role, 'findAll')).toBe(true);
    });

    it.each([Role.VENDEDOR, Role.ALMACENISTA])('denies %s', (role) => {
      expect(canActivateAs(role, 'findAll')).toBe(false);
    });
  });

  describe.each(['create', 'rename', 'remove'] as const)('%s (admin-only)', (handlerName) => {
    it('allows ADMINISTRADOR', () => {
      expect(canActivateAs(Role.ADMINISTRADOR, handlerName)).toBe(true);
    });

    it.each([Role.TECNICO, Role.CAJERO, Role.VENDEDOR, Role.ALMACENISTA])(
      'still denies %s',
      (role) => {
        expect(canActivateAs(role, handlerName)).toBe(false);
      },
    );
  });
});
