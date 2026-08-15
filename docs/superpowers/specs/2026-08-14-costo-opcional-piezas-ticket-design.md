# Diseño: costo opcional de piezas al asignarlas a un ticket de laboratorio

**Fecha:** 2026-08-14
**Estado:** Aprobado para implementación
**Repos afectados:** `celhm-api-main` y `celhm-app-main`

## Contexto y problema

Al asignar una pieza a un ticket (`POST /tickets/:id/piezas` →
`TicketsService.addTicketPart()`, `src/tickets/tickets.service.ts:411-464`),
el código sólo descuenta stock, crea el `TicketPart` y registra un
`Movement`. No toca `Ticket.finalCost` ni `Ticket.estimatedCost`, ni lee
`variant.price`. Al quitar una pieza (`removeTicketPart()`, líneas
466-520+) ocurre lo simétrico: se revierte stock, se borra el `TicketPart`,
se registra el `Movement` de vuelta, pero nunca se toca el costo del
ticket.

`Ticket.estimatedCost` y `Ticket.finalCost` (`prisma/schema.prisma:300-301`)
son campos `Decimal?` que hoy sólo se escriben a mano, vía
`PATCH /tickets/:id` o `PATCH /tickets/:id/estado`
(`UpdateTicketDto`/`UpdateTicketStateDto`). Nada los recalcula a partir de
las piezas asignadas.

Se quiere poder sumar el precio de una pieza al `finalCost` del ticket en
el momento de asignarla, pero como **opción por asignación** (no
automático ni global): un checkbox en el buscador de piezas del frontend
decide, pieza por pieza, si su costo se suma o no.

## Alcance

- Cambia: `AddTicketPartDto`, `TicketsService.addTicketPart()`,
  `TicketsService.removeTicketPart()`, modelo `TicketPart` (migración
  Prisma additiva), UI de búsqueda/asignación de piezas en
  `celhm-app-main/src/app/dashboard/laboratorio/page.tsx`, hook
  `useAddTicketPart` (`src/lib/hooks/useTickets.ts`).
- No cambia: `updateTicket`, `updateTicketState`, ni ningún otro flujo que
  ya escribe `finalCost`/`estimatedCost` a mano — siguen funcionando igual
  y pueden coexistir con este ajuste automático (el usuario puede seguir
  editando `finalCost` manualmente en cualquier momento; este cambio sólo
  añade un incremento/decremento adicional disparado por asignar/quitar
  piezas con el checkbox marcado).
- No se toca `estimatedCost` — sólo `finalCost` (decisión ya validada con
  el usuario: las piezas asignadas son costo real incurrido, no estimado).
- No se recalcula retroactivamente el costo de piezas ya asignadas antes
  de este cambio.

## Modelo de datos

`prisma/schema.prisma`, modelo `TicketPart` (líneas 337-350):

```prisma
model TicketPart {
  id           Int             @id @default(autoincrement())
  ticketId     Int
  variantId    Int
  qty          Int
  state        TicketPartState @default(RESERVADA)
  costIncluded Boolean         @default(false)
  unitCost     Decimal?        @db.Decimal(10, 2)
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  ticket       Ticket          @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  variant      Variant         @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@unique([ticketId, variantId])
  @@map("ticket_parts")
}
```

`costIncluded` registra si el costo de **esta** pieza fue sumado al
`finalCost` del ticket. `unitCost` congela el precio unitario usado en ese
momento (independiente de que `variant.price` cambie después), para que
`removeTicketPart` reste exactamente lo mismo que se sumó. Migración
additiva con default (`costIncluded = false`, `unitCost = null`): las
piezas existentes quedan sin costo incluido, comportamiento seguro por
defecto (no restan nada si se quitan).

## Backend — asignar pieza

`AddTicketPartDto` (`src/tickets/dto/add-ticket-part.dto.ts`) gana:

```ts
@IsOptional()
@IsBoolean()
includeCost?: boolean;
```

`TicketsService.addTicketPart()`:

1. En la lectura inicial (ya trae `ticket`), si `includeCost` es `true`,
   agregar una lectura de `variant.price` (`this.prisma.variant.findUnique`)
   junto a la lectura de `ticket` — ambas antes de entrar a la transacción
   batch, siguiendo el patrón ya usado en el método ("Read first, then
   batch transaction").
2. `unitCost = includeCost ? (variant.price ?? 0) : null`.
3. Dentro de la misma transacción batch (`this.prisma.$transaction([...])`,
   líneas 425-461):
   - `ticketPart.create` agrega `costIncluded: !!includeCost, unitCost`.
   - Si `includeCost` es `true` y `unitCost > 0`, agregar una operación
     `this.prisma.ticket.update({ where: { id }, data: { finalCost: { increment: unitCost * addTicketPartDto.qty } } })`
     al array de la transacción.
4. Si `includeCost` es `false`/omitido, o el variant no tiene precio
   (`unitCost === 0`), no se agrega la operación de `ticket.update` — el
   comportamiento es idéntico al actual.

## Backend — quitar pieza

`TicketsService.removeTicketPart()`:

1. La lectura inicial ya trae `ticketPart` con `include: { ticket: true }`
   (línea 476-478) — ahí ya están disponibles `costIncluded`, `unitCost` y
   `ticket.finalCost` sin queries adicionales.
2. Si `ticketPart.costIncluded` es `true`:
   ```ts
   const amount = Number(ticketPart.unitCost) * ticketPart.qty;
   const newFinalCost = Math.max(0, Number(ticketPart.ticket.finalCost ?? 0) - amount);
   ```
   agregar `this.prisma.ticket.update({ where: { id }, data: { finalCost: newFinalCost } })`
   al array de la transacción batch existente (líneas 486-514). Se usa un
   `set` directo (no `decrement`) para poder aplicar el piso en 0, mismo
   patrón que `releaseStock` (`src/stock/stock.service.ts:253`,
   `Math.max(0, stock.reserved - qty)`).
3. Si `costIncluded` es `false`, no se agrega ninguna operación — igual
   que hoy.

## Frontend

`laboratorio/page.tsx`, sección de búsqueda de piezas (~línea 1900-1962):

- Un checkbox sobre la lista de resultados: *"Sumar precio de la pieza al
  costo del ticket"*, estado local `includeCostOnAdd` (default `false`,
  se resetea al cerrar el modal de ticket).
- Al hacer click en un resultado (línea ~1922, `addTicketPart.mutateAsync`),
  el payload agrega `includeCost: includeCostOnAdd`.
- El toast de éxito distingue ambos casos: si `includeCostOnAdd` era
  `true`, `"${item.name} se añadió al ticket (+$${item.price} al costo)."`;
  si no, el texto actual sin cambios.
- No se agrega UI nueva para quitar piezas — el backend decide sólo con
  `costIncluded` de esa pieza.
- `useAddTicketPart`/`useRemoveTicketPart` (`useTickets.ts:97-125`) ya
  invalidan `['tickets', ticketId]` en `onSuccess`; el campo `finalCost`
  mostrado en el modal de detalle del ticket se refresca solo, sin cambios
  en esos hooks salvo pasar `includeCost` en el payload de `addTicketPart`.
- Tipo compartido `AddTicketPartRequest`/similar en `useTickets.ts:101`
  (`{ variantId: number; qty: number }`) gana `includeCost?: boolean`.

## Manejo de errores y edge cases

- `variant.price` nulo o `0` con `includeCost: true`: la pieza se asigna
  igual, `unitCost` queda `0`/`null`, no se toca `finalCost` (no bloquea la
  asignación por falta de precio).
- `finalCost` nunca queda negativo (piso en 0 al quitar).
- Cambios de precio del variant después de asignar no afectan lo que se
  resta al quitar (se usa `unitCost` congelado, no el precio vigente) —
  decisión ya validada con el usuario.
- Piezas asignadas antes de este cambio (`costIncluded` default `false`)
  nunca restan nada al quitarse.
- Ediciones manuales de `finalCost` (vía `PATCH /tickets/:id`) entre medio
  no rompen nada: el incremento/decremento por piezas se aplica siempre
  sobre el valor vigente de `finalCost` en ese momento (lectura justo antes
  de la transacción), no sobre un valor cacheado.

## Testing

TDD sobre `test/tickets.e2e-spec.ts` (o un nuevo `test/tickets-parts.e2e-spec.ts`
si el archivo actual crece demasiado), usando el patrón ya existente
(login con `laboratorio@acme-repair.com`, TECNICO seedeado):

1. **Asignar con `includeCost: true`**: `finalCost` del ticket after
   `GET /tickets/:id` aumenta exactamente en `variant.price * qty`.
2. **Asignar sin `includeCost` (u omitido)**: `finalCost` no cambia
   (regresión del comportamiento actual).
3. **Quitar una pieza con `costIncluded: true`**: `finalCost` vuelve a su
   valor previo a la asignación (resta exacta del `unitCost` congelado).
4. **Quitar una pieza con `costIncluded: false`**: `finalCost` no cambia.
5. **Piso en 0**: asignar con costo, luego editar `finalCost` manualmente a
   un valor menor al costo de la pieza vía `PATCH /tickets/:id`, luego
   quitar la pieza — `finalCost` queda en `0`, no negativo.

## Verificación manual

`pnpm dev` en `celhm-api-main` y `celhm-app-main`:

1. Abrir un ticket de laboratorio, buscar una pieza, marcar el checkbox
   "Sumar precio al costo", agregarla. Confirmar que el campo de costo
   final del ticket sube en el monto correcto.
2. Quitar esa misma pieza. Confirmar que el costo final vuelve al valor
   anterior.
3. Repetir sin marcar el checkbox: confirmar que el costo final del ticket
   no se mueve al agregar ni al quitar.
