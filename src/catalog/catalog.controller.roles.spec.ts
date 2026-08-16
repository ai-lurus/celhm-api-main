import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { CatalogController } from './catalog.controller';

describe('CatalogController roles (RolesGuard integration)', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  function canActivateAs(role: Role, handlerName: keyof CatalogController): boolean {
    const context = {
      getHandler: () => CatalogController.prototype[handlerName],
      getClass: () => CatalogController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }),
      }),
    } as unknown as ExecutionContext;
    return guard.canActivate(context) as boolean;
  }

  describe.each([
    'getProducts',
    'getVariants',
    'getVariantById',
    'getCategories',
    'getBrands',
    'getDeviceModels',
  ] as const)('%s (read endpoint)', (handlerName) => {
    it.each([Role.CAJERO, Role.ALMACENISTA])('allows %s', (role) => {
      expect(canActivateAs(role, handlerName)).toBe(true);
    });
  });

  describe.each([
    'createProduct',
    'updateProduct',
    'deleteProduct',
    'createVariant',
    'updateVariant',
    'deleteVariant',
    'createCategory',
    'updateCategory',
    'deleteCategory',
    'createBrand',
    'updateBrand',
    'deleteBrand',
    'createDeviceModel',
    'updateDeviceModel',
    'deleteDeviceModel',
  ] as const)('%s (write endpoint)', (handlerName) => {
    it.each([Role.CAJERO, Role.ALMACENISTA])('still denies %s', (role) => {
      expect(canActivateAs(role, handlerName)).toBe(false);
    });
  });
});
