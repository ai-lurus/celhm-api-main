# Costo opcional de piezas al asignarlas a un ticket — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que, al asignar una pieza a un ticket de laboratorio, su precio se sume opcionalmente (checkbox por asignación) al `finalCost` del ticket, y que quitar esa pieza reste simétricamente el mismo monto.

**Architecture:** `TicketPart` gana dos columnas (`costIncluded`, `unitCost`) que congelan, por pieza, si su costo se incluyó y a qué precio unitario. `AddTicketPartDto` gana un campo opcional `includeCost`. `TicketsService.addTicketPart()` y `removeTicketPart()` calculan el nuevo `finalCost` (lectura previa + suma/resta, nunca negativo) y lo agregan como una operación más dentro de la misma transacción batch que ya mueve stock. El frontend agrega un checkbox en el buscador de piezas de `laboratorio/page.tsx` que decide, por click, si esa asignación manda `includeCost: true`.

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL, class-validator DTOs, Jest + Supertest (e2e) en el backend; Next.js 15 + TanStack Query en el frontend.

**Design doc:** `docs/superpowers/specs/2026-08-14-costo-opcional-piezas-ticket-design.md`

## Global Constraints

- Repos de trabajo: `celhm-api-main` (Tasks 1-3) y `celhm-app-main` (Task 4).
- Sólo se toca `Ticket.finalCost`. `estimatedCost` no cambia (decisión ya validada en el spec).
- No se recalcula retroactivamente el costo de piezas asignadas antes de esta feature (`costIncluded` default `false`).
- El monto que se resta al quitar una pieza es el `unitCost` **congelado** en el momento de asignarla, no el `variant.price` vigente al quitarla.
- `finalCost` nunca queda negativo — piso en 0, mismo patrón que `releaseStock` (`src/stock/stock.service.ts:253`, `Math.max(0, stock.reserved - qty)`).
- **Desviación deliberada del texto del spec:** el spec describe el incremento como `finalCost: { increment: ... } }`. Ese operador de Prisma se traduce a `SET final_cost = final_cost + $1` en Postgres — si `final_cost` es `NULL` (el caso por defecto en un ticket nuevo), `NULL + x = NULL` y el campo se queda en `NULL` en vez de tomar el valor esperado. Los Tasks 2 y 3 usan en cambio un `set` explícito (`data: { finalCost: <número calculado en JS> }`), calculado a partir del valor ya leído del ticket (`Number(ticket.finalCost ?? 0)`), igual que ya hace `Math.max(0, ...)` para el piso en 0. Mismo resultado que pedía el spec, sin el bug de `NULL`.
- Ningún método existente en `tickets.service.ts` anota tipo de retorno explícito (contradice `CLAUDE.md` pero es la convención real del repo) — el código nuevo tampoco lo anota, para no romper la consistencia.
- No `console.log` — no se necesita logging nuevo en esta feature.
- Todas las escrituras vía Prisma, sin SQL crudo.
- Tras el cambio de schema (Task 1): correr `pnpm db:generate` antes de escribir código que use `costIncluded`/`unitCost` (si no, `tsc` falla por tipos desconocidos).
- Tests e2e (`test/tickets.e2e-spec.ts`) corren contra una base de datos real vía `pnpm test:e2e`, sin mocks — mismo patrón que el resto del archivo: login con `laboratorio@acme-repair.com` (seed, rol `TECNICO`) en el `beforeEach` de nivel superior, ya existente.
- Frontend: texto de UI en español, consistente con el resto de `laboratorio/page.tsx`.

---

### Task 1: Prisma schema — `costIncluded` / `unitCost` en `TicketPart`

**Files:**
- Modify: `prisma/schema.prisma:337-350` (modelo `TicketPart`)
- Create: `prisma/migrations/<timestamp>_add_ticket_part_cost_included/migration.sql` (generado por `prisma migrate dev`, no se escribe a mano)

**Interfaces:**
- Produces: campos `TicketPart.costIncluded: boolean` (default `false`) y `TicketPart.unitCost: Decimal | null` en el cliente Prisma generado. Los usan Task 2 y Task 3.

- [ ] **Step 1: Agregar los campos al modelo**

En `prisma/schema.prisma`, dentro de `model TicketPart { ... }` (línea 337), agregar `costIncluded` y `unitCost` junto a `qty`:

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

- [ ] **Step 2: Generar y correr la migración**

Run: `pnpm db:migrate:dev --name add_ticket_part_cost_included`
Expected: Prisma imprime "Your database is now in sync with your schema" y crea una carpeta nueva bajo `prisma/migrations/` con timestamp y sufijo `_add_ticket_part_cost_included`.

- [ ] **Step 3: Regenerar el cliente de Prisma**

Run: `pnpm db:generate`
Expected: "Generated Prisma Client" sin errores.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS sin errores nuevos (todavía no hay código usando los campos nuevos).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add costIncluded/unitCost to TicketPart"
```

---

### Task 2: Backend — asignar pieza con costo opcional

**Files:**
- Modify: `src/tickets/dto/add-ticket-part.dto.ts`
- Modify: `src/tickets/tickets.service.ts:411-464` (`addTicketPart`)
- Test: `test/tickets.e2e-spec.ts` (nuevo `describe('/tickets/:id/piezas (POST)', ...)`, agregado antes del `});` de cierre en la línea 199 del archivo actual)

**Interfaces:**
- Consumes: `TicketPart.costIncluded`/`unitCost` de Task 1.
- Produces: `AddTicketPartDto.includeCost?: boolean`. `addTicketPart()` sigue devolviendo el `TicketPart` creado (ahora con `costIncluded`/`unitCost` poblados) — mismo shape que antes más estos dos campos. Task 3 lee `ticketPart.costIncluded`/`unitCost` que este task empieza a poblar.

- [ ] **Step 1: Escribir los tests e2e (fallando)**

En `test/tickets.e2e-spec.ts`, agregar este bloque justo antes del `});` final del `describe('TicketsController (e2e)', ...)` (después del bloque `/tickets/:id/estado (PATCH)`, línea ~199):

```ts
  describe('/tickets/:id/piezas (POST)', () => {
    let ticketId: number;
    let variantId: number;
    let variantPrice: number;

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          branchId: 1,
          customerName: 'Test Customer',
          device: 'iPhone 12',
          problem: 'Necesita pieza',
        });
      ticketId = createResponse.body.id;

      const stockResponse = await request(app.getHttpServer())
        .get('/stock')
        .set('Authorization', `Bearer ${accessToken}`);
      const stockItem = stockResponse.body.data[0];
      variantId = stockItem.variant.id;
      variantPrice = Number(stockItem.variant.price);
    });

    it('leaves finalCost unchanged when includeCost is omitted', async () => {
      await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/piezas`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ variantId, qty: 1 })
        .expect(201);

      const ticketResponse = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(ticketResponse.body.finalCost ?? null).toBeNull();
    });

    it('increments finalCost by variant price * qty when includeCost is true', async () => {
      await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/piezas`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ variantId, qty: 2, includeCost: true })
        .expect(201);

      const ticketResponse = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(Number(ticketResponse.body.finalCost)).toBeCloseTo(variantPrice * 2, 2);
    });
  });
```

- [ ] **Step 2: Correr los tests para confirmar el fallo esperado**

Run: `npx jest --config ./test/jest-e2e.json tickets.e2e-spec.ts -t "piezas"`
Expected: el primer test (`leaves finalCost unchanged...`) **PASA** ya mismo — es una regresión-guard del comportamiento actual, no depende del código nuevo. El segundo test (`increments finalCost...`) **FALLA** con `400 Bad Request` (`property includeCost should not exist`), porque `AddTicketPartDto` todavía no declara ese campo y el `ValidationPipe` global tiene `forbidNonWhitelisted: true` (`src/main.ts:110-112`). Confirmar que el fallo es exactamente ese 400, no otra cosa.

- [ ] **Step 3: Agregar `includeCost` al DTO**

Reemplazar el contenido completo de `src/tickets/dto/add-ticket-part.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsBoolean, Min } from 'class-validator';

export class AddTicketPartDto {
  @ApiProperty()
  @IsInt()
  variantId: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  qty: number;

  @ApiPropertyOptional({
    description: 'Si es true, suma el precio actual del variant al finalCost del ticket.',
  })
  @IsOptional()
  @IsBoolean()
  includeCost?: boolean;
}
```

- [ ] **Step 4: Implementar el cálculo de costo en `addTicketPart`**

En `src/tickets/tickets.service.ts`, reemplazar el método `addTicketPart` completo (líneas 411-464):

```ts
  async addTicketPart(id: number, addTicketPartDto: AddTicketPartDto, user: AuthUser, ip?: string, userAgent?: string) {
    // PgBouncer transaction mode: Read first, then batch transaction
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id,
        branch: { organizationId: user.organizationId },
      },
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    let unitCost: number | null = null;
    let newFinalCost: number | null = null;
    if (addTicketPartDto.includeCost) {
      const variant = await this.prisma.variant.findUnique({
        where: { id: addTicketPartDto.variantId },
      });
      const price = Number(variant?.price ?? 0);
      if (price > 0) {
        unitCost = price;
        newFinalCost = Number(ticket.finalCost ?? 0) + price * addTicketPartDto.qty;
      }
    }
    const costIncluded = unitCost !== null;

    // Use batch transaction for atomic stock reservation, part creation, movement,
    // and (when includeCost applies) the ticket's finalCost update.
    const operations = [
      this.prisma.stock.updateMany({
        where: {
          branchId: ticket.branchId,
          variantId: addTicketPartDto.variantId,
        },
        data: {
          qty: {
            decrement: addTicketPartDto.qty,
          },
          reserved: {
            increment: addTicketPartDto.qty,
          },
        },
      }),
      this.prisma.ticketPart.create({
        data: {
          ticketId: id,
          variantId: addTicketPartDto.variantId,
          qty: addTicketPartDto.qty,
          state: TicketPartState.RESERVADA,
          costIncluded,
          unitCost: costIncluded ? unitCost : null,
        },
      }),
      this.prisma.movement.create({
        data: {
          branchId: ticket.branchId,
          variantId: addTicketPartDto.variantId,
          type: MovementType.EGR,
          qty: addTicketPartDto.qty,
          reason: `Adición a ticket ${ticket.folio}`,
          ticketId: id,
          userId: user.id,
          ip,
          userAgent,
        },
      }),
    ];

    if (costIncluded) {
      operations.push(
        this.prisma.ticket.update({
          where: { id },
          data: { finalCost: newFinalCost! },
        }),
      );
    }

    const [, ticketPart] = await this.prisma.$transaction(operations);

    return ticketPart;
  }
```

- [ ] **Step 5: Correr los tests para confirmar que pasan**

Run: `npx jest --config ./test/jest-e2e.json tickets.e2e-spec.ts -t "piezas"`
Expected: ambos tests PASAN.

- [ ] **Step 6: Typecheck y suite completa de tickets**

Run: `pnpm typecheck && npx jest --config ./test/jest-e2e.json tickets.e2e-spec.ts`
Expected: typecheck sin errores; todos los tests de `tickets.e2e-spec.ts` (los ya existentes + los nuevos) PASAN. Si algún test de `estado (PATCH)` tarda >5000ms y da timeout, es un problema preexistente y no relacionado (confirmado antes de este plan comparando contra el baseline sin este cambio) — no bloquea este task.

- [ ] **Step 7: Commit**

```bash
git add src/tickets/dto/add-ticket-part.dto.ts src/tickets/tickets.service.ts test/tickets.e2e-spec.ts
git commit -m "feat: sum part price into ticket finalCost when includeCost is set"
```

---

### Task 3: Backend — quitar pieza revierte el costo simétricamente

**Files:**
- Modify: `src/tickets/tickets.service.ts:466-520` (`removeTicketPart`)
- Test: `test/tickets.e2e-spec.ts` (nuevo `describe('/tickets/:id/piezas/:partId (DELETE)', ...)`, agregado después del `describe` de Task 2)

**Interfaces:**
- Consumes: `AddTicketPartDto.includeCost`, `addTicketPart()` de Task 2 (para poblar los fixtures de los tests). `ticketPart.costIncluded`/`unitCost` producidos por Task 2.
- Produces: sin cambios de firma — `removeTicketPart()` sigue devolviendo `{ success: true }`.

- [ ] **Step 1: Escribir los tests e2e (fallando)**

En `test/tickets.e2e-spec.ts`, agregar este bloque después del `describe('/tickets/:id/piezas (POST)', ...)` del Task 2, antes del `});` final del archivo:

```ts
  describe('/tickets/:id/piezas/:partId (DELETE)', () => {
    let ticketId: number;
    let variantId: number;
    let variantPrice: number;

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          branchId: 1,
          customerName: 'Test Customer',
          device: 'iPhone 12',
          problem: 'Necesita pieza',
        });
      ticketId = createResponse.body.id;

      const stockResponse = await request(app.getHttpServer())
        .get('/stock')
        .set('Authorization', `Bearer ${accessToken}`);
      const stockItem = stockResponse.body.data[0];
      variantId = stockItem.variant.id;
      variantPrice = Number(stockItem.variant.price);
    });

    it('restores finalCost to 0 when removing the only part whose cost was included', async () => {
      const addResponse = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/piezas`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ variantId, qty: 1, includeCost: true })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/tickets/${ticketId}/piezas/${addResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const ticketResponse = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(Number(ticketResponse.body.finalCost)).toBe(0);
    });

    it('leaves finalCost unchanged when removing a part whose cost was not included', async () => {
      const addResponse = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/piezas`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ variantId, qty: 1 })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/tickets/${ticketId}/piezas/${addResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const ticketResponse = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(ticketResponse.body.finalCost ?? null).toBeNull();
    });

    it('floors finalCost at 0 if it was manually lowered below the part cost before removal', async () => {
      const addResponse = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/piezas`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ variantId, qty: 1, includeCost: true })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ finalCost: variantPrice / 2 })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/tickets/${ticketId}/piezas/${addResponse.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const ticketResponse = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(Number(ticketResponse.body.finalCost)).toBe(0);
    });
  });
```

- [ ] **Step 2: Correr los tests para confirmar el fallo esperado**

Run: `npx jest --config ./test/jest-e2e.json tickets.e2e-spec.ts -t "piezas/:partId"`
Expected: el segundo test (`leaves finalCost unchanged...`) PASA ya mismo (comportamiento actual). El primero (`restores finalCost to 0...`) y el tercero (`floors finalCost at 0...`) FALLAN — `removeTicketPart` todavía no resta nada, así que el `finalCost` queda en el monto sumado por Task 2 (o en el valor rebajado a mano) en vez de `0`.

- [ ] **Step 3: Implementar la reversión de costo en `removeTicketPart`**

En `src/tickets/tickets.service.ts`, reemplazar el método `removeTicketPart` completo (líneas 466-520):

```ts
  async removeTicketPart(id: number, partId: number, user: AuthUser, ip?: string, userAgent?: string) {
    // Read part and ticket first
    const ticketPart = await this.prisma.ticketPart.findFirst({
      where: {
        id: partId,
        ticketId: id,
        ticket: {
          branch: { organizationId: user.organizationId },
        },
      },
      include: {
        ticket: true,
      },
    });

    if (!ticketPart) {
      throw new Error('Ticket part not found');
    }

    // Use batch transaction for atomic stock restoration, part deletion, movement,
    // and (when the part's cost was included) reversing the ticket's finalCost.
    const operations = [
      this.prisma.stock.updateMany({
        where: {
          branchId: ticketPart.ticket.branchId,
          variantId: ticketPart.variantId,
        },
        data: {
          qty: {
            increment: ticketPart.qty,
          },
          reserved: {
            decrement: ticketPart.qty,
          },
        },
      }),
      this.prisma.ticketPart.delete({
        where: { id: partId },
      }),
      this.prisma.movement.create({
        data: {
          branchId: ticketPart.ticket.branchId,
          variantId: ticketPart.variantId,
          type: MovementType.ING,
          qty: ticketPart.qty,
          reason: `Remoción de ticket ${ticketPart.ticket.folio}`,
          ticketId: id,
          userId: user.id,
          ip,
          userAgent,
        },
      }),
    ];

    if (ticketPart.costIncluded && ticketPart.unitCost !== null) {
      const amount = Number(ticketPart.unitCost) * ticketPart.qty;
      const newFinalCost = Math.max(0, Number(ticketPart.ticket.finalCost ?? 0) - amount);
      operations.push(
        this.prisma.ticket.update({
          where: { id },
          data: { finalCost: newFinalCost },
        }),
      );
    }

    await this.prisma.$transaction(operations);

    return { success: true };
  }
```

- [ ] **Step 4: Correr los tests para confirmar que pasan**

Run: `npx jest --config ./test/jest-e2e.json tickets.e2e-spec.ts -t "piezas"`
Expected: los 5 tests de piezas (2 de Task 2 + 3 de este task) PASAN.

- [ ] **Step 5: Typecheck y suite e2e completa**

Run: `pnpm typecheck && npx jest --config ./test/jest-e2e.json`
Expected: typecheck sin errores. Los tests de `tickets.e2e-spec.ts` y `stock.e2e-spec.ts` PASAN. Cualquier fallo por timeout en tests no relacionados con piezas/stock (ver nota del Task 2 Step 6) es preexistente — confirmar que no aumentó el número de fallas respecto al baseline anotado en ese step.

- [ ] **Step 6: Commit**

```bash
git add src/tickets/tickets.service.ts test/tickets.e2e-spec.ts
git commit -m "feat: reverse ticket finalCost when removing a part whose cost was included"
```

---

### Task 4: Frontend — checkbox "Sumar precio al costo" en el buscador de piezas

**Files:**
- Modify: `src/lib/hooks/useTickets.ts:97-110` (`useAddTicketPart`)
- Modify: `src/app/dashboard/laboratorio/page.tsx:183-185` (estado), `:470-473` (`handleCloseViewModal`), `:1900-1962` (checkbox, payload, toast)

**Interfaces:**
- Consumes: `POST /tickets/:id/piezas` con `includeCost?: boolean` (Task 2, ya deployado en el backend).
- Produces: ninguna interfaz nueva para otros componentes — cambio contenido en `laboratorio/page.tsx` y el hook que ya usa.

- [ ] **Step 1: Agregar `includeCost` al tipo del payload en el hook**

En `src/lib/hooks/useTickets.ts`, reemplazar la firma de `mutationFn` dentro de `useAddTicketPart` (línea 101):

```ts
    mutationFn: async ({ ticketId, data }: { ticketId: number; data: { variantId: number; qty: number; includeCost?: boolean } }) => {
```

- [ ] **Step 2: Agregar el estado del checkbox y resetearlo al cerrar el modal**

En `src/app/dashboard/laboratorio/page.tsx`, agregar el estado junto a los otros de búsqueda de piezas (línea 183-185):

```ts
  const [partSearchTerm, setPartSearchTerm] = useState("");
  const [isPartSearchOpen, setIsPartSearchOpen] = useState(false);
  const [includeCostOnAdd, setIncludeCostOnAdd] = useState(false);
  const partSearchRef = useRef<HTMLDivElement>(null);
```

Y en `handleCloseViewModal` (línea 470-473), resetear el checkbox al cerrar el modal de detalle del ticket:

```ts
  const handleCloseViewModal = () => {
    setIsViewModalOpen(false);
    setViewingTicketId(null);
    setIncludeCostOnAdd(false);
  };
```

- [ ] **Step 3: Agregar el checkbox en el buscador de piezas**

En la misma página, dentro del bloque `{can("canUpdateTickets") && (...)}` (línea 1900), justo después de `<div className="relative mb-4" ref={partSearchRef}>` (línea 1901) y antes de `<div className="flex gap-2">` (línea 1902), insertar:

```tsx
                      <label className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={includeCostOnAdd}
                          onChange={(e) => setIncludeCostOnAdd(e.target.checked)}
                        />
                        Sumar precio de la pieza al costo del ticket
                      </label>
```

- [ ] **Step 4: Mandar `includeCost` en el payload y ajustar el toast de éxito**

En el mismo bloque, dentro del `onClick` del botón de resultado de búsqueda (línea ~1922-1934), reemplazar:

```tsx
                                      try {
                                        await addTicketPart.mutateAsync({
                                          ticketId: viewingTicket.id,
                                          data: { variantId: item.variantId, qty: 1 },
                                        });
                                        setPartSearchTerm("");
                                        setIsPartSearchOpen(false);
                                        toast({
                                          variant: "success",
                                          title: "Pieza añadida",
                                          description: `${item.name} se añadió al ticket.`,
                                        });
```

por:

```tsx
                                      try {
                                        await addTicketPart.mutateAsync({
                                          ticketId: viewingTicket.id,
                                          data: { variantId: item.variantId, qty: 1, includeCost: includeCostOnAdd },
                                        });
                                        setPartSearchTerm("");
                                        setIsPartSearchOpen(false);
                                        toast({
                                          variant: "success",
                                          title: "Pieza añadida",
                                          description: includeCostOnAdd
                                            ? `${item.name} se añadió al ticket (+$${item.price.toFixed(2)} al costo).`
                                            : `${item.name} se añadió al ticket.`,
                                        });
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/hooks/useTickets.ts src/app/dashboard/laboratorio/page.tsx
git commit -m "feat: add checkbox to include part price in ticket cost when assigning"
```

---

### Task 5: Verificación manual end-to-end

**Files:** ninguno (solo verificación, sin cambios de código).

**Interfaces:** N/A.

- [ ] **Step 1: Levantar backend y frontend**

`pnpm dev` en `celhm-api-main` (puerto 3001) y en `celhm-app-main` (puerto 3000). Login como `laboratorio@acme-repair.com` / `ChangeMe123!` (TECNICO, seed existente).

- [ ] **Step 2: Asignar una pieza sin marcar el checkbox**

Abrir un ticket de laboratorio existente (o crear uno nuevo), anotar el costo final actual (probablemente vacío/`0.00`). Buscar una pieza, **sin** marcar "Sumar precio de la pieza al costo del ticket", agregarla. Confirmar en el toast que dice sólo "se añadió al ticket." (sin monto) y que el campo de costo final del ticket no cambió.

- [ ] **Step 3: Asignar una pieza marcando el checkbox**

En el mismo ticket, buscar otra pieza, marcar el checkbox, agregarla. Confirmar en el toast que menciona el monto sumado, y que el costo final del ticket subió exactamente ese monto.

- [ ] **Step 4: Quitar la pieza con costo incluido**

Quitar la pieza agregada en el Step 3 (botón de remover en la lista de piezas del ticket). Confirmar que el costo final del ticket vuelve al valor de antes del Step 3.

- [ ] **Step 5: Quitar la pieza sin costo incluido**

Quitar la pieza agregada en el Step 2. Confirmar que el costo final del ticket no cambia.

Si los 5 pasos se comportan como se describe, la feature está completa. Si algo falla, volver al task correspondiente antes de dar el trabajo por terminado.
