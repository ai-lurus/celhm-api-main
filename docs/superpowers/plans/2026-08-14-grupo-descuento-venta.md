# Selector de grupo de descuento en la venta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un selector "Grupo de descuento" en el formulario de venta (`CashRegister.tsx`) del repo `celhm-app-main`, que aplique el `discountPercent` de un `CustomerGroup` a la venta sin requerir que haya un cliente registrado seleccionado.

**Architecture:** Cambio 100% frontend, sin tocar backend ni schema. Se agrega un campo local `discountGroupId` a `CashRegisterForm` (solo UI, no viaja al API) y un `<select>` poblado con el hook `useCustomerGroups()` ya existente. Elegir un grupo, o elegir un cliente registrado con grupo, setea `form.discount` + `form.discountPercent` — el mismo mecanismo que ya usa el backend hoy vía `POST /sales`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, TanStack Query, Tailwind. Sin librerías nuevas.

## Global Constraints

- Repo de trabajo: `celhm-app-main` únicamente. No modificar `celhm-api-main`.
- No agregar campos nuevos al payload que se envía a `POST /sales` — `discountGroupId` es puramente de UI.
- Spec de referencia: `docs/superpowers/specs/2026-08-14-grupo-descuento-venta-design.md` (en `celhm-api-main`).
- Sin tests automatizados nuevos — decisión explícita del spec (sección "Testing"): `CashRegister.tsx` no tiene tests de componente hoy y esta feature no agrega lógica de cálculo nueva (reutiliza `calculateCashRegisterDiscount` sin cambios). Verificación es manual (Task 4).
- Todo texto de UI en español, consistente con el resto de `CashRegister.tsx`.

---

### Task 1: Agregar `discountGroupId` al tipo `CashRegisterForm`

**Files:**
- Modify: `src/app/dashboard/sales/_components/types.ts:14-47`

**Interfaces:**
- Produces: `CashRegisterForm.discountGroupId: string` (siempre `''` o un `id` de grupo como string) — usado por Task 2 y Task 3.

- [ ] **Step 1: Agregar el campo al interface**

En `src/app/dashboard/sales/_components/types.ts`, dentro de `CashRegisterForm` (línea 14), agregar el campo junto a `discountPercent`:

```ts
export interface CashRegisterForm {
  date: string
  customerId: string
  customerName: string
  requestInvoice: boolean
  sellerId: string
  payments: { method: PaymentMethod; amount: number }[]
  lines: SaleLineItem[]
  discount: number
  discountPercent: boolean
  discountGroupId: string
  productSearch: string
  productDetails: string
  ticketDetails: string
  cashRegisterId?: number
  continuingFromSaleId?: number
  isPending: boolean
}
```

- [ ] **Step 2: Inicializarlo en `createInitialCashRegisterForm`**

En el mismo archivo, dentro de `createInitialCashRegisterForm` (línea 32), agregar junto a `discountPercent: false`:

```ts
export const createInitialCashRegisterForm = (sellerId: string = ''): CashRegisterForm => ({
  date: new Date().toISOString().split('T')[0],
  customerId: '',
  customerName: 'CLIENTE DE MOSTRADOR',
  requestInvoice: false,
  sellerId,
  cashRegisterId: undefined,
  payments: [{ method: 'EFECTIVO', amount: 0 }],
  lines: [],
  discount: 0,
  discountPercent: false,
  discountGroupId: '',
  productSearch: '',
  productDetails: '',
  ticketDetails: '',
  isPending: false,
})
```

- [ ] **Step 3: Verificar tipos**

Run: `pnpm typecheck`
Expected: sin errores nuevos. `discountGroupId` es un campo opcional-por-valor-default (`''`), así que cualquier lugar que construya un `CashRegisterForm` a mano (por ejemplo al reanudar una venta pendiente) puede fallar el chequeo si construye el objeto sin pasar por `createInitialCashRegisterForm` — si `typecheck` marca algún literal de `CashRegisterForm` incompleto, agregar `discountGroupId: ''` ahí también.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/sales/_components/types.ts
git commit -m "feat: add discountGroupId field to CashRegisterForm"
```

---

### Task 2: Selector "Grupo de descuento" en `CashRegister.tsx`

**Files:**
- Modify: `src/app/dashboard/sales/_components/CashRegister.tsx:3-24` (imports)
- Modify: `src/app/dashboard/sales/_components/CashRegister.tsx:882-934` (sección de descuento)

**Interfaces:**
- Consumes: `useCustomerGroups(): { data: CustomerGroup[] }` de `src/lib/hooks/useCustomerGroups.ts` (`CustomerGroup = { id, name, discountPercent, isDefault, isFrequentBuyerTarget, _count? }`). `CashRegisterForm.discountGroupId` de Task 1.
- Produces: al cambiar el `<select>`, actualiza `form.discount`, `form.discountPercent`, `form.discountGroupId` vía `onFormChange` — mismo patrón que el resto del componente (no hay estado local nuevo).

- [ ] **Step 1: Importar el hook**

En `CashRegister.tsx`, agregar el import junto a los demás hooks (línea 22, después de `useCashRegisters`):

```ts
import { useCustomerGroups } from "../../../../lib/hooks/useCustomerGroups";
```

- [ ] **Step 2: Invocar el hook dentro del componente**

Buscar dónde se invocan los otros hooks de datos (cerca de donde se usa `useCashRegisters` u `useOrganization` dentro del cuerpo del componente `CashRegister`) y agregar:

```ts
const { data: customerGroups = [] } = useCustomerGroups();
```

- [ ] **Step 3: Agregar el `<select>` en la sección de descuento**

En `CashRegister.tsx`, la sección "Middle: Discount and Add Details" (línea 882 en adelante) tiene el label "Descto", el `<input>` numérico y el checkbox `%`. Insertar el nuevo `<select>` como una fila propia, antes de esa fila (antes de la línea 884 `<div className="flex items-center space-x-2">`):

```tsx
<div className="flex items-center space-x-2">
  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
    Grupo de descuento:
  </label>
  <select
    value={form.discountGroupId}
    onChange={(e) => {
      const groupId = e.target.value;
      const group = customerGroups.find((g) => g.id.toString() === groupId);
      onFormChange({
        ...form,
        discountGroupId: groupId,
        discount: group?.discountPercent ?? 0,
        discountPercent: true,
      });
    }}
    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
  >
    <option value="">Sin descuento</option>
    {customerGroups.map((group) => (
      <option key={group.id} value={group.id}>
        {group.discountPercent > 0 ? `${group.name} (${group.discountPercent}%)` : group.name}
      </option>
    ))}
  </select>
</div>
```

Dejar la fila existente de "Descto" (input + checkbox `%`) intacta debajo, sin cambios — sigue siendo la edición manual.

- [ ] **Step 4: Verificar tipos y lint**

Run: `pnpm typecheck && pnpm lint`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/sales/_components/CashRegister.tsx
git commit -m "feat: add discount group selector to sale form"
```

---

### Task 3: Sincronizar el selector al elegir un cliente registrado

**Files:**
- Modify: `src/app/dashboard/sales/_components/CashRegister.tsx:458-469` (`onSelect` de `CustomerSelector`)

**Interfaces:**
- Consumes: `Customer.group?: { id: number; name: string; discountPercent: number }` de `src/lib/hooks/useCustomers.ts:16`. `CustomerSelector`'s `onSelect(customerId, customerName, groupDiscountPercent?)` (sin cambios de firma, ya existe).
- Produces: ninguno nuevo — solo extiende el `onFormChange` que ya corre en este callback para incluir `discountGroupId`.

- [ ] **Step 1: Extender el callback `onSelect`**

Reemplazar el bloque actual (`CashRegister.tsx:458-469`):

```tsx
onSelect={(customerId, customerName, groupDiscountPercent) => {
  const selected = customers.find((c) => c.id.toString() === customerId);
  const groupDiscount = Number(groupDiscountPercent ?? selected?.group?.discountPercent ?? 0);
  onFormChange({
    ...form,
    customerId,
    customerName,
    continuingFromSaleId: undefined,
    discount: groupDiscount,
    discountPercent: groupDiscount > 0,
  });
}}
```

por:

```tsx
onSelect={(customerId, customerName, groupDiscountPercent) => {
  const selected = customers.find((c) => c.id.toString() === customerId);
  const group = selected?.group;
  const groupDiscount = Number(groupDiscountPercent ?? group?.discountPercent ?? 0);
  onFormChange({
    ...form,
    customerId,
    customerName,
    continuingFromSaleId: undefined,
    discount: groupDiscount,
    discountPercent: groupDiscount > 0,
    discountGroupId: group ? String(group.id) : "",
  });
}}
```

Esto cubre: cliente con grupo → el nuevo `<select>` de Task 2 queda sincronizado en ese grupo; cliente sin grupo o CLIENTE DE MOSTRADOR (`handleSelectDefault` en `CustomerSelector.tsx:71-75`, que llama `onSelect('', 'CLIENTE DE MOSTRADOR')` sin tercer argumento) → `group` es `undefined`, así que `discountGroupId` queda en `""` y el `<select>` vuelve a "Sin descuento".

- [ ] **Step 2: Verificar tipos y lint**

Run: `pnpm typecheck && pnpm lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/sales/_components/CashRegister.tsx
git commit -m "feat: sync discount group selector when a customer is chosen"
```

---

### Task 4: Verificación manual end-to-end

**Files:** ninguno (solo verificación, sin cambios de código).

**Interfaces:** N/A.

- [ ] **Step 1: Levantar el frontend**

Run: `pnpm dev` (en `celhm-app-main`, puerto 3000). Si el backend no está corriendo, levantarlo también (`pnpm dev` en `celhm-api-main`, puerto 3001) — la pantalla de ventas necesita la API real.

- [ ] **Step 2: Crear (o confirmar) el grupo "Familiar" al 20%**

En el navegador: `/dashboard/customers/groups` → "Agregar Grupo" → nombre `Familiar`, descuento `20` → Guardar. Si ya existe de una prueba anterior, usarlo tal cual.

- [ ] **Step 3: Probar con CLIENTE DE MOSTRADOR**

Ir a `/dashboard/sales`, iniciar una venta nueva, dejar el cliente en "CLIENTE DE MOSTRADOR" (default), agregar al menos una línea con un monto conocido (ej. $1000). En el nuevo selector "Grupo de descuento", elegir "Familiar (20%)". Confirmar:
- El campo "Descto" pasa a `20` con el checkbox `%` activado.
- Debajo aparece "Descuento: 20% = $200.00" (sobre $1000).
- El total de la venta refleja el descuento.

- [ ] **Step 4: Probar con un cliente registrado con grupo**

Seleccionar (o crear) un cliente cuyo `groupId` sea el de "Familiar". Confirmar que el selector "Grupo de descuento" queda automáticamente en "Familiar (20%)" y el descuento se aplica igual que en el Step 3, sin tocar nada a mano.

- [ ] **Step 5: Probar el cambio de cliente después de elegir grupo a mano**

Con CLIENTE DE MOSTRADOR + grupo "Familiar" elegido a mano (como en Step 3), cambiar el cliente a uno sin grupo asignado. Confirmar que el selector vuelve a "Sin descuento" y `form.discount` vuelve a `0` (mismo criterio que el auto-fill de siempre — no se "recuerda" la elección manual anterior).

- [ ] **Step 6: Confirmar que la edición manual del descuento sigue funcionando**

Con un grupo elegido, editar a mano el campo "Descto" a otro número. Confirmar que el total de la venta usa ese nuevo valor (el `<select>` puede quedar visualmente desincronizado — comportamiento esperado, documentado en el spec).

Si todos los pasos anteriores se comportan como se describe, la feature está completa. Si algo falla, volver a la task correspondiente antes de dar el trabajo por terminado.
