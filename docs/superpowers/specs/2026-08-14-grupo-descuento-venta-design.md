# Diseño: selector de grupo de descuento en la venta (sin cliente registrado)

**Fecha:** 2026-08-14
**Estado:** Aprobado para implementación
**Repos afectados:** `celhm-app-main` (único)

## Contexto y problema

El CRUD de grupos de clientes (`CustomerGroup`, con `discountPercent`) ya
existe completo en backend y frontend (`/dashboard/customers/groups`). En el
POS (`CashRegister.tsx`), cuando se selecciona un **cliente registrado** que
pertenece a un grupo, el `%` de descuento del grupo se autocompleta en el
campo de descuento de la venta (`CashRegister.tsx:458-469`, vía
`CustomerSelector.onSelect`).

El problema: con **CLIENTE DE MOSTRADOR** (venta sin cliente registrado) no
hay forma de aplicar el descuento de un grupo — el único mecanismo de hoy
depende de que el cliente tenga un `groupId` asignado. El campo de descuento
manual (`Descto`, `CashRegister.tsx:882-934`) sigue funcionando a mano, pero
obliga a saber/tipear el % de memoria en vez de elegir el grupo por nombre.

## Alcance

Agregar un selector "Grupo de descuento" en el formulario de venta,
independiente de si hay o no un cliente registrado seleccionado. Elegir un
grupo ahí precarga el mismo mecanismo de descuento que ya existe
(`form.discount` + `form.discountPercent`), sin importar el cliente.

**Fuera de alcance:**
- Cambios de backend/schema. `Sale` no guarda qué grupo se usó (decisión
  explícita: no hace falta reportar "ventas por grupo" por ahora); el % ya
  viaja convertido a monto en `discount` como hoy.
- Tocar el CRUD de grupos, el flujo de creación de cliente, o el auto-fill
  existente al elegir cliente registrado (se mantiene, solo se extiende para
  sincronizar el nuevo selector).

## Cambios de FE (`celhm-app-main`)

### `types.ts` — `CashRegisterForm`

Se agrega un campo puramente de UI, no se envía al backend:

```ts
discountGroupId?: string   // '' = sin grupo elegido
```

`createInitialCashRegisterForm` lo inicializa en `''`.

### `CashRegister.tsx`

Nuevo `<select>` "Grupo de descuento" en la sección de descuento (junto al
input `Descto`, antes o al lado del checkbox `%`), poblado con
`useCustomerGroups()` (hook ya existente, mismo usado en
`CustomerSelector.tsx:334-346` para el modal de alta de cliente). Opciones:
"Sin descuento" (`''`) + cada grupo (`{name} ({discountPercent}%)` si tiene
`discountPercent > 0`, si no solo `{name}`).

**On change del select:**
```ts
const group = groups.find(g => g.id.toString() === value)
onFormChange({
  ...form,
  discountGroupId: value,
  discount: group?.discountPercent ?? 0,
  discountPercent: true,
})
```

**Sincronización con `CustomerSelector`** (`CashRegister.tsx:458-469`): el
`onSelect` existente ya calcula `groupDiscount` a partir de
`customer.group.discountPercent`. Se extiende para también fijar
`discountGroupId`:

```ts
onSelect={(customerId, customerName, groupDiscountPercent) => {
  const selected = customers.find((c) => c.id.toString() === customerId)
  const group = selected?.group
  const groupDiscount = Number(groupDiscountPercent ?? group?.discountPercent ?? 0)
  onFormChange({
    ...form,
    customerId,
    customerName,
    continuingFromSaleId: undefined,
    discount: groupDiscount,
    discountPercent: groupDiscount > 0,
    discountGroupId: group ? String(group.id) : '',
  })
}}
```

Esto cubre los tres casos:
- Cliente de mostrador + elegir grupo a mano → funciona (antes no se podía).
- Cliente registrado con grupo → sigue autocompletándose solo, y ahora el
  nuevo `<select>` refleja visualmente qué grupo se aplicó.
- Cliente registrado sin grupo → el `<select>` queda en "Sin descuento".

**El campo manual `Descto` no cambia de comportamiento.** El cajero puede
seguir editando el número/% a mano en cualquier momento después de elegir un
grupo (mismo criterio que hoy: el `<select>` es un atajo para precargar, no
una restricción). Si edita el número a mano tras elegir un grupo, el
`<select>` puede quedar visualmente "desincronizado" del valor real — mismo
comportamiento ambiguo que ya existe hoy con el auto-fill por cliente, no es
una regresión.

**Cambiar de cliente después de elegir un grupo a mano:** el `onSelect` de
`CustomerSelector` siempre sobreescribe `discountGroupId`/`discount` con el
grupo del nuevo cliente (o `''`/`0` si no tiene) — no intenta "recordar" la
elección manual previa. Es el mismo criterio que ya aplica hoy al auto-fill.

## Validación, errores, testing

**Validación:** ninguna nueva — el `<select>` no puede producir valores
inválidos (siempre referencia un `id` real de `useCustomerGroups()` o `''`).

**Testing:**
- No existen hoy tests de componente para `CashRegister.tsx`. Se agregan
  tests unitarios para la función pura de cálculo si se extrae lógica nueva
  (no debería hacer falta: `calculateCashRegisterDiscount` en `utils.ts` no
  cambia, sigue operando solo sobre `discount`/`discountPercent`).
- Verificación manual (`pnpm dev` en `celhm-app-main`): crear grupo
  "Familiar" al 20% desde `/dashboard/customers/groups`, abrir una venta
  nueva con CLIENTE DE MOSTRADOR, elegir "Familiar" en el nuevo selector,
  confirmar que el total refleja el 20% de descuento; repetir con un cliente
  registrado que ya tenga grupo asignado para confirmar que el auto-fill
  existente sigue funcionando y el selector queda sincronizado.
