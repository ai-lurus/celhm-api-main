# Diseño: Motor de comisiones personalizadas

**Fecha:** 2026-08-08
**Estado:** Aprobado para implementación
**Repos afectados:** `celhm-api-main` (principal), `celhm-app-main` (UI admin)

## Contexto y problema

Hoy el sistema de comisiones es muy limitado: cada `OrgMembership` tiene un único
`commissionRate` (%) plano. Dos triggers en `SalesService` generan registros
`Commission` automáticamente:

- `createCommissionForSale`: comisión de técnico de laboratorio sobre el subtotal
  total de la venta ligada a un ticket.
- `createCommissionForProductSale`: comisión de venta de producto, solo para rol
  `VENDEDOR`, sobre productos marcados `isCommissionable`.

En la práctica, las comisiones del negocio son mucho más variadas:

1. % o monto fijo sobre el total de venta.
2. % sobre ganancia (no sobre venta) para laboratorio.
3. % distinto por rol dentro de "ventas" (ej. empleado 5%, admin 10%).
4. % general fijo para todo el equipo de laboratorio.
5. % general sobre venta total.
6. Reglas especiales según tipo de cliente ("otros": personal, familia, uso
   interno de laboratorio).

Además, las reglas cambian con el tiempo (el admin sube o baja un % desde
cierta fecha) y varían por categoría de producto dentro de una misma venta
(ej. un vendedor gana 2% en accesorios pero 30% en configuraciones).

## Alcance

Incluye: modelo de datos, motor de resolución de reglas, cálculo automático
al liquidar ventas/tickets, API de administración, migración de datos
existentes, UI de administración, y comisiones negativas por devolución.

Fuera de alcance (explícitamente pospuesto): normalizar `Product.category` a
una tabla relacional (se sigue usando el campo de texto libre actual);
reconciliación contable de pagos de comisión con nómina; agrupar
automáticamente por rol las membresías legacy con el mismo `commissionRate`.

## Modelo de datos

```prisma
model CommissionPlan {
  id             Int      @id @default(autoincrement())
  organizationId Int
  name           String            // "Vendedor estándar", "Técnico laboratorio"
  role           Role?             // rol por defecto al que aplica esta plantilla (null = plan ad-hoc)
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization   Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  rules          CommissionRule[]
  memberships    OrgMembership[]

  @@unique([organizationId, name])
}

model CommissionRule {
  id            Int       @id @default(autoincrement())
  planId        Int?              // regla de plantilla (compartida por rol)
  membershipId  Int?              // regla override, específica de un empleado
  basis         CommissionBasis
  scopeType     CommissionScope
  scopeValue    String?           // texto de Product.category, o id de CustomerGroup como string
  calcMethod    CommissionCalcMethod
  value         Decimal   @db.Decimal(10, 2)
  validFrom     DateTime  @default(now())
  validTo       DateTime?
  label         String?
  createdAt     DateTime  @default(now())

  plan          CommissionPlan? @relation(fields: [planId], references: [id], onDelete: Cascade)
  membership    OrgMembership?  @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  commissions   Commission[]

  @@index([planId])
  @@index([membershipId])
}

enum CommissionBasis {
  SALE_TOTAL
  PROFIT
}

enum CommissionScope {
  GENERAL
  PRODUCT_CATEGORY
  CUSTOMER_GROUP
}

enum CommissionCalcMethod {
  PERCENTAGE
  FIXED
}
```

Cambios en modelos existentes:

- `Organization`: agrega relación inversa `commissionPlans CommissionPlan[]`
  (requerida por Prisma para la relación declarada en `CommissionPlan`).
- `OrgMembership`: agrega `commissionPlanId Int?` + relación a `CommissionPlan`,
  y relación inversa `overrideRules CommissionRule[]`. El campo `commissionRate`
  actual queda deprecado (comentario `@deprecated` en schema), de solo lectura,
  no se borra en esta fase.
- `Commission`: agrega `ruleId Int?`, `basis CommissionBasis?`,
  `scopeLabel String?`, `isEstimated Boolean @default(false)`.

## Algoritmo de resolución de reglas

Para cada línea de venta (`SaleLine`) o "línea virtual" de ticket de
laboratorio:

1. **Filtrar por vigencia:** solo reglas donde
   `validFrom <= fecha_venta <= (validTo ?? infinito)`.
2. **Filtrar candidatas del empleado:** overrides de su `OrgMembership` +
   reglas de su `CommissionPlan` asignado.
3. **Elegir por especificidad de scope** (la primera categoría que tenga al
   menos una regla candidata gana, en este orden):
   - `CUSTOMER_GROUP` == grupo del cliente de la venta
   - `PRODUCT_CATEGORY` == categoría del producto de la línea
   - `GENERAL`
4. **Dentro del mismo nivel de especificidad**, el override individual del
   empleado gana sobre la regla de la plantilla de su plan.
5. **Empate exacto** (mismo scope, mismo origen, vigencias solapadas): gana la
   de `validFrom` más reciente; se loguea un warning (no debe ocurrir si el
   admin no solapa vigencias, pero no debe romper el cálculo).
6. **Ninguna regla matchea:** no se genera comisión para esa línea (se loguea,
   no se lanza excepción, no bloquea la venta).

Un único ganador por línea — las comisiones no se acumulan entre reglas.

## Flujo de cálculo

Se dispara desde los mismos puntos donde hoy se llama a
`createCommissionForSale` / `createCommissionForProductSale` en
`sales.service.ts` (al confirmarse pago completo de una venta). Cambia la
implementación interna de `CommissionsService`, no el trigger.

Por cada línea:

1. Determinar responsable (`assignedUserId`/`userId` del ticket, o `userId` de
   la venta para productos — igual que hoy).
2. Determinar categoría del producto (`variant.product.category`) y grupo de
   cliente (`sale.customer.groupId`).
3. Resolver regla ganadora (sección anterior).
4. Calcular base:
   - `SALE_TOTAL` → `line.total`.
   - `PROFIT` → `line.total - (variant.purchasePrice ?? 0) * line.qty`. Si
     `purchasePrice` es `null`, se calcula con costo 0 y se marca
     `isEstimated = true`.
5. Aplicar `calcMethod`:
   - `PERCENTAGE` → `base * value / 100`.
   - `FIXED` → `value`, aplicado **una vez por cada línea** que matchea la
     regla (si 2 líneas matchean la misma regla fija, se generan 2
     comisiones).
6. Crear `Commission` con `ruleId`, `basis`, `scopeLabel` (texto legible,
   snapshot), `isEstimated`, y los campos ya existentes (`amount`, `rate`,
   `saleTotal`).

**Tickets de laboratorio sin desglose de categoría:** se tratan como una sola
línea virtual (`scopeType = GENERAL` o `CUSTOMER_GROUP` si aplica),
`basis = PROFIT` calculada como
`ticket.finalCost - costo de TicketPart consumidos`. Mismo criterio de
`isEstimated` si falta costo de alguna pieza.

**Devoluciones:** al registrar una `Sale` con `isReturn = true`, por cada
`Commission` asociada a la venta original (`returnOfSaleId`) se genera una
nueva `Commission` con monto negativo, mismo `ruleId`, `status = PENDIENTE`.
Esto ajusta el saldo pendiente del empleado sin importar si la comisión
original ya estaba pagada.

## API de administración

Extiende `CommissionsController` (ya protegido con `@Roles(Role.ADMINISTRADOR)`):

```
GET    /commissions/plans
POST   /commissions/plans
PATCH  /commissions/plans/:id
DELETE /commissions/plans/:id                  (soft: active = false)

POST   /commissions/plans/:id/rules
PUT    /commissions/rules/:id/revise           (cierra validTo, crea regla nueva con validFrom = ahora)
DELETE /commissions/rules/:id                  (solo si nunca se usó en una Commission; si ya se usó, cierra vigencia)

PATCH  /users/:membershipId/commission-plan    (asignar plan base)
POST   /commissions/rules/override             (crear regla override para un membershipId)
GET    /commissions/rules/preview?membershipId=X&date=Y
```

`preview` devuelve, para un empleado y fecha dados, qué regla ganaría por cada
categoría de producto y grupo de cliente conocido — permite al admin verificar
el resultado combinado (plantilla + overrides) antes de confiar en él.

## Migración de datos existentes

1. **Comisiones ya generadas** (`Commission` históricas): no se tocan. Quedan
   con `ruleId = null`, son un registro histórico inmutable.
2. **Membresías con `commissionRate` configurado:** se crea automáticamente
   una `CommissionRule` override (`membershipId` set, `planId = null`) por
   cada una:
   - `basis = SALE_TOTAL`, `scopeType = GENERAL`, `calcMethod = PERCENTAGE`,
     `value = commissionRate`, `validFrom = fecha de la migración`.
   - Reproduce el comportamiento actual exactamente — la migración es un
     no-op funcional el día del deploy.
3. `commissionRate` en `OrgMembership` se marca deprecado en el schema, no se
   elimina en esta fase. La UI deja de exponerlo como editable.
4. No se crean plantillas de rol automáticamente — el admin las arma después
   a mano, moviendo empleados desde su override heredado hacia una plantilla
   real cuando quiera.

## UI de administración (`celhm-app-main`)

**Nueva pantalla `/dashboard/commissions/plans`:**
- Lista de plantillas (nombre, rol, cantidad de reglas activas).
- CRUD de plantilla y sus reglas (scope, basis, tipo, valor, vigencia, botón
  "revisar" que aplica el patrón cerrar+crear del endpoint `revise`).

**Cambios en `/dashboard/users`:**
- El input de `commissionRate` se reemplaza por un selector de
  `CommissionPlan`.
- Sección "Reglas personalizadas de {empleado}": lista y permite agregar
  overrides individuales.
- Botón "Vista previa" que llama a `GET /commissions/rules/preview`.

**Cambios en `/dashboard/commissions` (listado existente):**
- Cada fila muestra `scopeLabel`, `basis`, y badge "estimado" cuando
  `isEstimated = true`.
- Export CSV agrega las columnas `basis`, `scopeLabel`, `estimado`.

No se modifica el flujo de "marcar como pagada" existente.

## Testing

Unit tests del motor de resolución (`commission-rule-resolver.spec.ts`):
- Override de usuario gana sobre plantilla, mismo scope.
- Categoría específica gana sobre `GENERAL`.
- Grupo de cliente específico gana sobre `GENERAL`.
- Regla fuera de vigencia no aplica.
- Empate entre dos reglas `GENERAL` solapadas → gana `validFrom` más reciente
  + warning logueado.
- Sin regla que matchee → retorna null, no lanza excepción.
- `PROFIT` con `purchasePrice = null` → `isEstimated = true`.
- `FIXED` en 2 líneas que matchean → 2 comisiones.

Integration tests (extendiendo `sales.service.spec.ts`):
- Venta con 3 líneas de categorías distintas → 3 comisiones con reglas
  distintas.
- Venta a cliente de un `CustomerGroup` específico → aplica regla de grupo.
- Ticket de laboratorio con costo de piezas incompleto → comisión `PROFIT`
  marcada `isEstimated`.
- Migración: membresía con `commissionRate` legacy genera la misma comisión
  que antes del cambio (regresión).
- Devolución de venta con comisión ya pagada → comisión negativa pendiente
  que reduce `pendingAmount` en el summary.

Edge cases:
- Empleado sin plan y sin overrides → sin comisión, sin error.
- Plan desactivado → deja de aplicar a ventas nuevas; comisiones ya generadas
  no se tocan.

Cobertura objetivo: 80%+ en el módulo `commissions` (unit + integration),
siguiendo el estándar del repo.
