import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthController } from './auth.controller';

describe('AuthController roles (RolesGuard integration)', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  function canActivateAs(role: Role, handlerName: keyof AuthController): boolean {
    const context = {
      getHandler: () => AuthController.prototype[handlerName],
      getClass: () => AuthController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }),
      }),
    } as unknown as ExecutionContext;
    return guard.canActivate(context) as boolean;
  }

  describe('register (create user)', () => {
    it('allows ADMINISTRADOR', () => {
      expect(canActivateAs(Role.ADMINISTRADOR, 'register')).toBe(true);
    });

    it.each([Role.CAJERO, Role.VENDEDOR, Role.TECNICO, Role.ALMACENISTA])(
      'denies %s',
      (role) => {
        expect(canActivateAs(role, 'register')).toBe(false);
      },
    );
  });
});
