# Diseño: mover stock en toda venta al crearse (incl. fiadas) y corregir estado de pago parcial

**Fecha:** 2026-08-14
**Estado:** Aprobado para implementación
**Repos afectados:** `celhm-api-main` (único)

## Contexto y problema

En `SalesService.create()` (`src/sales/sales.service.ts`), la creación del
`Movement` de tipo `VTA` y el decremento de `Stock` para cada línea con
`variantId` sólo ocurre **dentro** del bloque `if (createSaleDto.payments &&
createSaleDto.payments.length > 0)` (líneas 165-199). Si una venta se crea
**fiada** (sin pago, queda en `SaleStatus.PENDIENTE`), ese bloque nunca
corre — el inventario nunca se mueve, ni al crearse la venta ni después,
cuando se termina de pagar vía `addPayment()` (que tampoco toca stock).

Esto contradice lo que el resto del código ya asume:
`cancelSale()` (líneas 662-717) sólo cancela ventas `PENDIENTE` sin abonos, y
**incrementa** el stock de vuelta (`Movement` tipo `DEV`) bajo el supuesto de
que el stock ya se decrementó al crear la venta. Hoy eso es falso para
ventas fiadas, así que cancelar una venta fiada infla el inventario
incorrectamente.

Un segundo bug relacionado, en el mismo bloque: si se provee **cualquier**
pago al crear la venta —aunque sea un abono parcial que no cubre el
`total`— el código fija `status: SaleStatus.PAGADO` sin comparar montos
(líneas 130-134). `addPayment()` sí hace esta comparación correctamente
(línea 403: `newTotalPaid >= Number(sale.total) ? PAGADO : PENDIENTE`). El
resultado es que una venta con abono parcial creada de una vez queda marcada
como pagada por completo.

## Alcance

Cambios acotados a `SalesService.create()`. No se tocan `cancelSale()` ni
`createReturn()`: ambos ya contienen la lógica correcta bajo el supuesto de
que el stock se mueve al crear la venta (`cancelSale` sólo actúa sobre
`PENDIENTE`/`paidAmount === 0`; `createReturn` sólo actúa sobre `PAGADO`,
que siempre tuvo el stock decrementado incluso con el bug actual).

**Fuera de alcance:** el incremento de `Ticket.advancePayment` (líneas
147-156) sigue gateado sólo por `totalEfectivoAmount > 0`, sin relación con
si la venta quedó `PAGADO` o `PENDIENTE` — es un concepto distinto (efectivo
recibido a cuenta de un ticket de reparación), no cambia.

## Cambios

### 1. Movimiento de stock incondicional

Sacar el loop de `Movement.create` + `Stock.updateMany` (líneas 165-199) del
bloque `if (payments...)` para que corra siempre, inmediatamente después de
crear la venta con sus líneas (después de la llamada a
`this.prisma.sale.create(...)`, línea 112), sin importar si se proveyeron
pagos.

Se cambia además la fuente de datos del loop: en vez de iterar
`createSaleDto.lines` y hacer un `prisma.variant.findUnique` por línea
(N+1), se itera `sale.lines` — ya incluye `variant.product` porque el
`include` de `sale.create()` lo trae. Mismo comportamiento, menos queries.

```ts
// justo después de crear `sale`, antes de procesar pagos
for (const line of sale.lines) {
  if (line.variantId && line.variant?.product?.tracksInventory !== false) {
    await this.prisma.$transaction([
      this.prisma.movement.create({
        data: {
          branchId: createSaleDto.branchId,
          variantId: line.variantId,
          type: MovementType.VTA,
          qty: line.qty,
          reason: `Venta ${folio}`,
          folio,
          userId: user.id,
        },
      }),
      this.prisma.stock.updateMany({
        where: { branchId: createSaleDto.branchId, variantId: line.variantId },
        data: { qty: { decrement: line.qty } },
      }),
    ]);
  }
}
```

### 2. Estado de pago basado en monto realmente pagado

Dentro del bloque `if (payments...)`, reemplazar el `status: SaleStatus.PAGADO`
incondicional por el mismo cálculo que ya usa `addPayment`:

```ts
const newStatus =
  totalPaymentAmount >= Number(sale.total) ? SaleStatus.PAGADO : SaleStatus.PENDIENTE;

await this.prisma.sale.update({
  where: { id: sale.id },
  data: { status: newStatus },
});
```

Como consecuencia, lo que hoy corre incondicionalmente dentro del bloque
pasa a gatearse por `newStatus === SaleStatus.PAGADO` (igual que
`addPayment`, líneas 422-437):

- `customersService.registerPurchase(createSaleDto.customerId)`
- `commissionsService.generateForSale(sale.id)`

(`commissionsService.generateForSale` no valida internamente el estado de
la venta — el gateo es responsabilidad del caller, tal como ya lo hace
`addPayment`.)

El incremento de `Ticket.advancePayment` (`totalEfectivoAmount > 0`) no
cambia su condición.

## Flujo resultante en `create()`

1. Crear `Sale` + `SaleLine[]` (status inicial `PENDIENTE`, sin cambios).
2. **Nuevo:** crear `Movement(VTA)` + decrementar `Stock` para cada línea
   con `variantId` y `tracksInventory !== false` — siempre, haya o no pagos.
3. Si hay pagos: registrar `Payment[]`, calcular `newStatus` según monto
   pagado vs. total, actualizar `Sale.status`.
4. Si `newStatus === PAGADO`: registrar compra del cliente y generar
   comisiones (igual que hoy, sólo que ahora correctamente condicionado).
5. Si hubo efectivo y la venta está ligada a un ticket: incrementar
   `Ticket.advancePayment` (sin cambios).

## Manejo de errores

Sin cambios de semántica: el loop de movimiento sigue envuelto en
`$transaction([movement.create, stock.updateMany])` por línea, igual que
hoy. Si falla, la excepción se propaga y `create()` completo falla (mismo
comportamiento actual, sólo que ahora se ejecuta en otro punto del método).

## Testing

Extender `src/sales/sales.service.spec.ts` (`describe('create', ...)`) con:

- **Venta fiada con línea de inventario** (sin `payments`, o `payments: []`,
  con una línea `{ variantId, qty }`): `movement.create` y
  `stock.updateMany` **sí** se llaman; `sale.update` no se invoca con
  `status: PAGADO` (la venta queda `PENDIENTE`, comportamiento por defecto
  de `sale.create`).
- **Pago parcial al crear** (`payments` con monto `<` total): `sale.update`
  se llama con `status: SaleStatus.PENDIENTE`; `registerPurchase` y
  `commissionsService.generateForSale` **no** se llaman.
- **Pago completo al crear** (caso ya cubierto hoy, se mantiene como
  regresión): `sale.update` con `status: SaleStatus.PAGADO`;
  `registerPurchase` y `generateForSale` **sí** se llaman; `movement.create`
  / `stock.updateMany` también se llaman.

No se requieren cambios en los tests existentes de `cancelSale` /
`createReturn` — su lógica no cambia.

## Verificación manual

`pnpm dev` en `celhm-api-main`, contra un `variant` con stock conocido:

1. Crear una venta con una línea de producto (`variantId`) y **sin pagos**
   (fiada). Confirmar en `db:studio` (o endpoint de stock) que el `Stock.qty`
   bajó y que existe un `Movement` tipo `VTA`.
2. Cancelar esa venta fiada (`cancelSale`) y confirmar que el `Stock.qty`
   vuelve al valor original (un solo `DEV` que compensa el `VTA`, no un
   incremento de más).
3. Crear otra venta con un pago parcial (menor al total). Confirmar que
   queda `PENDIENTE` y que el stock ya bajó igual (paso 1). Completar el
   pago con `addPayment` y confirmar que pasa a `PAGADO` sin mover stock de
   nuevo.
