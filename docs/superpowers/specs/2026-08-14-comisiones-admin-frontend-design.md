# Diseño: Admin del motor de comisiones en el FE

**Fecha:** 2026-08-14
**Estado:** Aprobado para implementación
**Repos afectados:** `celhm-app-main` (principal), `celhm-api-main` (endpoint faltante)

## Contexto y problema

El motor de comisiones por reglas (`CommissionPlan` / `CommissionRule`,
descrito en
[2026-08-08-comisiones-personalizadas-design.md](./2026-08-08-comisiones-personalizadas-design.md))
ya está mergeado en `celhm-api-main` (`development`, commit `16178cd`). El
backend expone la API completa de administración:

```
GET    /commissions/plans
POST   /commissions/plans
PATCH  /commissions/plans/:id
DELETE /commissions/plans/:id                  (soft: active = false)
POST   /commissions/plans/:id/rules
POST   /commissions/rules/override
PUT    /commissions/rules/:id/revise
DELETE /commissions/rules/:id
GET    /commissions/rules/preview?membershipId=&date=
PATCH  /orgs/members/:id                       (asigna commissionPlanId)
```

Pero en `celhm-app-main` no existe ninguna UI para planes, reglas, overrides
ni preview. Lo único que existe es la pantalla `/dashboard/commissions`
(listado/pago de comisiones ya generadas, vía `useCommissions.ts`) y el
selector de `commissionRate` plano en el modal de edición de
`/dashboard/users`.

## Alcance

Incluye: CRUD de planes de comisión, CRUD de reglas dentro de un plan,
creación/listado de overrides individuales por empleado, panel de preview de
regla ganadora, y selector de plan de comisión en el modal de edición de
usuario. Un endpoint nuevo en el backend para listar overrides (gap
descubierto durante el diseño).

Fuera de alcance: tocar el flujo de cálculo/generación automática de
`Commission` (ya funciona), cambios al listado/pago existente en
`/dashboard/commissions`, quitar `commissionRate` del schema (sigue
coexistiendo como mecanismo alterno más simple).

## A. Cambio de backend (`celhm-api-main`)

Gap: no hay forma de listar los overrides ya creados de un empleado (solo
crearlos vía `POST /commissions/rules/override`, o inferir el ganador vía
`preview`). Sin listado, el FE no puede revisar/eliminar overrides
existentes.

Agregar a `CommissionPlansController` / `CommissionPlansService`:

```
GET /commissions/rules/overrides?membershipId=123
```

- Mismo guard que el resto del controller (`@Roles(Role.ADMINISTRADOR)`).
- Valida que la membership pertenezca a `user.organizationId` (mismo patrón
  que `createOverride`), 404 si no.
- Implementación: `prisma.commissionRule.findMany({ where: { membershipId } })`
  (reutiliza la relación `overrideRules` ya usada en `preview()`).
- Retorna `CommissionRule[]` sin transformar.

No se toca nada más del backend. `commissionPlanId` de `OrgMembership` ya
viaja en `GET /orgs/members` (Prisma incluye scalars por default al no usar
`select` de nivel superior) y ya se actualiza vía `PATCH /orgs/members/:id`
(`org.service.ts:90-98`).

## B. Estructura FE y data hooks (`celhm-app-main`)

### Hook nuevo: `src/lib/hooks/useCommissionPlans.ts`

```ts
type CommissionScope = 'GENERAL' | 'PRODUCT_CATEGORY' | 'CUSTOMER_GROUP'
type CommissionBasis = 'SALE_TOTAL' | 'PROFIT'
type CommissionCalcMethod = 'PERCENTAGE' | 'FIXED'

interface CommissionRule {
  id: number
  planId: number | null
  membershipId: number | null
  basis: CommissionBasis
  scopeType: CommissionScope
  scopeValue: string | null
  calcMethod: CommissionCalcMethod
  value: number
  validFrom: string
  validTo: string | null
  label: string | null
}

interface CommissionPlan {
  id: number
  name: string
  role: Role | null
  active: boolean
  rules: CommissionRule[]
}
```

Queries/mutations (TanStack Query, mismo patrón que `useCustomerGroups.ts`):

- `useCommissionPlans()` → `GET /commissions/plans`
- `useCreateCommissionPlan()` → `POST /commissions/plans`
- `useUpdateCommissionPlan()` → `PATCH /commissions/plans/:id`
- `useDeactivateCommissionPlan()` → `DELETE /commissions/plans/:id`
- `useAddCommissionRule()` → `POST /commissions/plans/:id/rules`
- `useReviseCommissionRule()` → `PUT /commissions/rules/:id/revise`
- `useDeleteCommissionRule()` → `DELETE /commissions/rules/:id`
- `useCommissionOverrides(membershipId)` → `GET /commissions/rules/overrides?membershipId=`
- `useCreateCommissionOverride()` → `POST /commissions/rules/override`
- `useCommissionRulePreview(membershipId, date)` → `GET /commissions/rules/preview`

Todas las mutations invalidan `['commission-plans']`; las de override también
invalidan `['commission-overrides', membershipId]`.

### Reutilizados sin cambios

- `useUsers()` (`src/lib/hooks/useUsers.ts`) — lista de `OrgMember` con `id`
  (membershipId), para selectores de empleado en Overrides y Preview.
- `useCategories()` de `useCatalog.ts` — para `scopeType = PRODUCT_CATEGORY`.
- `useCustomerGroups()` — para `scopeType = CUSTOMER_GROUP`.

### Cambios a hooks existentes

- `useUsers.ts`: `OrgMember` agrega `commissionPlanId: number | null`.
  `useUpdateMember()` agrega `commissionPlanId?: number | null` al payload de
  `PATCH /orgs/members/:id`.

### Archivos de UI nuevos

Todos bajo `src/app/dashboard/commissions/_components/`:

- `PlansTab.tsx` — orquesta 3 sub-tabs internos: Planes, Overrides, Preview.
- `PlanList.tsx` + `PlanFormModal.tsx` — CRUD de planes.
- `RuleTable.tsx` + `RuleFormModal.tsx` — reglas de un plan (agregar/revisar/
  eliminar); reutilizados también por `OverridesPanel`.
- `OverridesPanel.tsx` — selector de empleado + `RuleTable`/`RuleFormModal`
  sin `planId` (usa `membershipId`).
- `PreviewPanel.tsx` — selector de empleado + fecha, tabla de resultados de
  `preview`.

`commissions/page.tsx` se modifica solo para envolver el contenido actual en
un tab "Comisiones" (existente) + agregar tab "Planes" → `<PlansTab />`,
mismo patrón de tabs que `customers/groups/page.tsx`.

## C. Flujos de UI

**Planes** (`PlanList.tsx`): tabla (Nombre, Rol, # Reglas, Estatus, Acciones),
mismo estilo visual que `CustomerGroupsPage`. "Agregar Plan" abre
`PlanFormModal` (`name`, `role` opcional). Click en fila muestra el detalle
del plan con su `RuleTable`. "Desactivar" (no hay hard-delete) con confirm
modal; el plan queda visible con badge "Inactivo" en vez de desaparecer.

**Reglas de un plan** (`RuleTable.tsx` + `RuleFormModal.tsx`):
- Columnas: Alcance (label armado: "General" / "Categoría: X" / "Grupo: Y"),
  Basis, Cálculo (ej. "10%" o "$10 fijo"), Vigencia (`validFrom`–`validTo` o
  "Vigente"), Acciones (Revisar / Eliminar).
- "Agregar regla": `basis` (select), `scopeType` (select) — al elegir
  `PRODUCT_CATEGORY` muestra `<select>` poblado con `useCategories()`; al
  elegir `CUSTOMER_GROUP` muestra `<select>` con `useCustomerGroups()`
  (envía `String(id)`); más `calcMethod`, `value`, `label` opcional.
  `validFrom` no es editable (usa el default del backend = ahora).
- "Revisar": modal reducido (`calcMethod`, `value`, `label`, igual que
  `ReviseCommissionRuleDto`) con nota explicando que cierra la regla vigente
  y crea una nueva desde hoy.
- "Eliminar": confirm modal con nota: si la regla ya se usó en una
  `Commission`, el backend solo cierra su vigencia en vez de borrarla.

**Overrides** (`OverridesPanel.tsx`): `<select>` de empleados
(`user.name || user.email`). Al elegir uno, `useCommissionOverrides` carga
sus reglas en el mismo `RuleTable`/`RuleFormModal`, pero creando vía
`POST /commissions/rules/override` con `membershipId` en vez de `planId`.

**Preview** (`PreviewPanel.tsx`): mismo selector de empleado +
`<input type="date">` (default hoy). Botón "Calcular" → tabla
`scopeLabel | basis | calcMethod | value`; fila "Sin regla aplicable" para
escenarios sin match.

**Asignar plan a empleado** (`users/page.tsx`): en el modal de edición
existente, junto a `commissionRate`, se agrega `<select>` "Plan de comisión"
poblado con `useCommissionPlans()` filtrando `active`, con opción
"— Ninguno —" (`null`). Nota inline: "Si se asigna un plan, sus reglas
tienen prioridad sobre la tasa fija de abajo" — deja explícito que
`commissionRate` y `commissionPlanId` coexisten como dos mecanismos.

## D. Validación, errores, permisos, testing

**Validación de formularios:** estado local + validación manual antes de
mutar (sin React Hook Form/Zod, por consistencia con el resto de páginas
admin de este dominio — `CustomerGroupsPage` sigue el mismo patrón):

- `value` numérico ≥ 0; si `calcMethod = PERCENTAGE`, tope visual de 100 (el
  backend no lo valida, pero evita errores obvios de captura).
- `scopeValue` requerido si `scopeType !== GENERAL`; deshabilita "Guardar"
  mientras falte.
- Errores de API vía el mismo helper `errorMessage(error, fallback)` +
  `toast`, igual que `customers/groups/page.tsx`.

**Permisos:** todo el tab "Planes" (y sus 3 subsecciones) queda detrás del
mismo guard `canManageCommissions` que ya protege `/dashboard/commissions`.
No se necesita permiso nuevo — el backend ya restringe estas rutas a
`ADMINISTRADOR`.

**Testing:**

- FE (Jest): unit tests de `useCommissionPlans.ts` (mock de `api`, query
  keys, invalidaciones, payloads enviados). Component tests ligeros de
  `RuleFormModal` (deshabilita guardar sin `scopeValue`; cambia campos según
  `scopeType`) y `PlanFormModal`.
- Backend: unit test del nuevo `GET /commissions/rules/overrides` en
  `commission-plans.service.spec.ts` — membership de otra organización → 404;
  retorna solo reglas de esa membership.
- Verificación manual: correr `pnpm dev` en ambos repos y probar el flujo
  completo (crear plan → agregar regla por categoría → asignar plan a un
  empleado → crear override → preview) antes de dar el trabajo por
  terminado.
- No se agrega E2E (Playwright) nuevo salvo que se pida explícitamente.
