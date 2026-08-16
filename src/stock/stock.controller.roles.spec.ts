import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { StockController } from './stock.controller';

describe('StockController roles (RolesGuard integration)', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  function canActivateAs(role: Role, handlerName: keyof StockController): boolean {
    const context = {
      getHandler: () => StockController.prototype[handlerName],
      getClass: () => StockController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }),
      }),
    } as unknown as ExecutionContext;
    return guard.canActivate(context) as boolean;
  }

  describe('getStock (read endpoint)', () => {
    it.each([Role.CAJERO, Role.ALMACENISTA])('allows %s', (role) => {
      expect(canActivateAs(role, 'getStock')).toBe(true);
    });
  });

  describe.each([
    'updateStockMin',
    'createInventoryItem',
    'updateInventoryItem',
    'deleteInventoryItem',
  ] as const)('%s (write endpoint)', (handlerName) => {
    it.each([Role.CAJERO, Role.ALMACENISTA])('still denies %s', (role) => {
      expect(canActivateAs(role, handlerName)).toBe(false);
    });
  });
});
