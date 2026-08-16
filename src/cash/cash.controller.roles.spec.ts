import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { CashController } from './cash.controller';

describe('CashController roles (RolesGuard integration)', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  function canActivateAs(role: Role, handlerName: keyof CashController): boolean {
    const context = {
      getHandler: () => CashController.prototype[handlerName],
      getClass: () => CashController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }),
      }),
    } as unknown as ExecutionContext;
    return guard.canActivate(context) as boolean;
  }

  describe.each([
    'getCashRegisters',
    'createCashRegister',
    'deleteCashRegister',
    'createCashCut',
    'openCashSession',
    'getCashCuts',
    'getCashCutById',
    'updateCashCut',
  ] as const)('%s', (handlerName) => {
    it.each([Role.ADMINISTRADOR, Role.VENDEDOR, Role.CAJERO])('allows %s', (role) => {
      expect(canActivateAs(role, handlerName)).toBe(true);
    });

    it.each([Role.TECNICO, Role.ALMACENISTA])('denies %s', (role) => {
      expect(canActivateAs(role, handlerName)).toBe(false);
    });
  });
});
