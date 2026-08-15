# Diseño: generador de código/SKU por máscara configurable

**Fecha:** 2026-08-15
**Estado:** Aprobado para implementación
**Repos afectados:** `celhm-api-main` y `celhm-app-main`

## Contexto y problema

Hoy el SKU (`Variant.sku`, único) se genera con un valor sin significado:
`SKU-${Date.now()}-${random}` (`stock.service.ts:300-303`, y el fallback de
importación CSV en `celhm-app-main` `inventory/page.tsx:615`). El usuario
quiere que el código se arme a partir de una **máscara configurable** (como
en el mockup adjunto): caracteres de la categoría raíz (`R`), la categoría
(`C`), el nombre del producto (`P`) y un consecutivo (`#`), ej.
`CAC0117` para categoría `.../CABLES Y CARGADORES/CABLES/` y producto
`CABLE GA UGREEN/ESSAGER 1M USB A LIGTHIN`.

Al investigar el modelo actual se encontraron dos gaps que bloquean esto:

1. `Product.category` es un `String?` plano que guarda **solo el nombre de
   la subcategoría hoja** (ej. `"Cables"`), elegido vía un dropdown en
   cascada en el frontend (`catalog/page.tsx:717-772`) que descarta la
   categoría padre al guardar. No hay forma de recuperar la raíz.
2. El modelo `ProductCategory` (jerárquico, con `parentId`) existe pero está
   **completamente desconectado** de `Product` — solo se usa para poblar el
   selector, no hay FK.

Sin resolver (1) y (2) no se puede derivar `R` (raíz) de forma confiable.

## Alcance

- Vincular `Product` a `ProductCategory` con una FK real (`categoryId`).
- Un generador de código basado en máscara configurable, con configuración
  única a nivel sistema (se guarda en el registro `Organization`, mismo
  patrón que `ticketLegends`).
- Reemplaza la generación aleatoria actual en **todos** los puntos donde se
  crea un SKU: Catálogo (crear variante) e Inventario (crear ítem/producto
  inline).
- El código sugerido se **precarga pero sigue siendo editable** por el
  usuario antes de guardar.
- El consecutivo (`#`) se cuenta por combinación de código resultante
  (todo el prefijo antes del consecutivo comparte el mismo contador), no
  global ni solo por categoría.

**Fuera de alcance:**

- Máscara distinta por organización/sucursal (una sola máscara activa para
  todo el sistema).
- Historial de máscaras: si se cambia la máscara, los SKU ya generados no
  se re-generan ni se re-etiquetan.
- Editor visual nuevo del árbol de categorías (se sigue usando el CRUD de
  `ProductCategory` ya existente).
- `DeviceBrand`/`DeviceModel` (son de tickets de reparación, no de
  catálogo/inventario) — no se tocan.
- Códigos manuales por categoría (`R`/`C` se derivan siempre del nombre,
  nunca de un campo "code" asignado a mano — decisión explícita del
  usuario).

## Modelo de datos (`celhm-api-main/prisma/schema.prisma`)

### `Product` — FK real a categoría

```prisma
model Product {
  // ...
  categoryId Int?
  category   ProductCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  // se elimina el campo `category String?` una vez completada la migración de datos
}
```

`ProductCategory` no requiere cambios de forma (ya tiene `parentId`); solo
se agrega el lado inverso de la relación (`products Product[]`).

### `Organization` — configuración de máscara

```prisma
model Organization {
  // ...
  skuMaskConfig Json @default("[]")
}
```

Forma del JSON (validada por DTO, ver más abajo), array de segmentos en
orden de izquierda a derecha:

```ts
type SkuMaskSegment =
  | { type: 'literal'; value: string }               // texto fijo, puede ser ''
  | { type: 'root' | 'category' | 'product'; length: number } // R / C / P
  | { type: 'sequence'; digits: number };             // el '####'
```

Si `Organization.skuMaskConfig` está vacío (instalación sin configurar),
el backend usa un default equivalente al ejemplo del mockup sin el
segmento vacío inicial:

```json
[
  { "type": "category", "length": 2 },
  { "type": "product", "length": 1 },
  { "type": "sequence", "digits": 4 }
]
```

### Nuevo modelo `SkuSequence`

Mismo patrón que `FolioSequence` (`schema.prisma:371-383`), pero sin
scoping por sucursal/periodo porque el consecutivo es por prefijo de
código, no por tiempo:

```prisma
model SkuSequence {
  id        Int      @id @default(autoincrement())
  prefix    String   @unique   // ej. "CAC" (todo el mask menos el segmento sequence)
  seq       Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("sku_sequences")
}
```

Se mantiene **sin** `organizationId`: ni `Product`, ni `Variant`, ni
`ProductCategory` están hoy scopeados por organización (son entidades
globales del catálogo; solo `Stock`/`Branch` lo están), así que scopear
`SkuSequence` sería inconsistente con el resto del dominio de catálogo.

### Migración de datos (dos fases)

1. **Fase 1 — agregar columna y backfill:** migración de Prisma agrega
   `categoryId` nullable. Un script único (`ts-node` corrido a mano una
   vez, no parte del flujo normal) recorre todos los `Product` con
   `category` (string) no nulo, busca `ProductCategory` por nombre
   (case-insensitive) y asigna `categoryId`. Los productos sin match
   quedan con `categoryId = null` y se listan en el log de salida del
   script para revisión manual — no se auto-crean categorías nuevas para
   evitar duplicar el árbol con nombres mal escritos.
2. **Fase 2 — limpieza:** una vez verificado el backfill (manualmente,
   contra la lista de no-matches), una segunda migración elimina la
   columna `category` (string). Hasta ese momento el campo viejo se deja
   en el schema para no perder datos si el backfill necesita reintentarse.

Productos con `categoryId = null` no obtienen sugerencia automática de SKU
(el campo queda vacío para llenado manual) hasta que se les asigne
categoría.

## Impacto adicional detectado al planear (consumidores de `Product.category`)

Al mapear el archivo exacto de cada cambio se encontraron consumidores de
`Product.category` (string) no mencionados arriba, que la migración a
`categoryId` rompe si no se adaptan en el mismo cambio:

- **Comisiones por categoría** (`commissions/commission-plans.service.ts:185-192`
  `listKnownCategories`, y `commissions/commissions.service.ts:154`
  `generateForLine`): `CommissionRule` con `scopeType: PRODUCT_CATEGORY`
  matchea por el nombre de categoría (string) contra
  `line.variant.product?.category`. Pasan a leer
  `product.category?.name` vía la relación (mismo criterio de matching,
  solo cambia de dónde sale el string). Requiere que el `include` de
  `commissions.service.ts:20` (`variant: { include: { product: true } }`)
  agregue `product: { include: { category: true } }`, y que
  `listKnownCategories` filtre/seleccione por `categoryId`/`category.name`
  en vez de `category`. Sus specs (`commission-plans.service.spec.ts`,
  `commissions.service.spec.ts`) usan mocks con `category: 'Accesorios'`
  como string plano y se actualizan a `category: { name: 'Accesorios' }`.
- **Filtro de Inventario por categoría** (`stock.service.ts:61-72`,
  parámetro `categoriaId` en `stock.controller.ts:32`): hoy, pese al
  nombre `categoriaId`, filtra con `contains` sobre el string
  `product.category` (bug preexistente de nombre engañoso). Se aprovecha
  la migración para que filtre de verdad por `product.categoryId`
  (igualdad exacta) — es una corrección natural del mismo cambio, no una
  ampliación de alcance funcional.
- **`stock.service.ts:133-141`** (`select` de `product` en `getStock`):
  cambia `category: true` (escalar) por
  `category: { select: { id: true, name: true } }` (relación).
- **Paquete compartido `@celhm/types`** (`packages/types/src/catalog.ts`,
  `packages/types/src/stock.ts`): los schemas Zod de `Product`/`Variant`/
  `StockItem` tienen `category: z.string().optional()` embebido; pasan a
  `categoryId: z.number().nullable().optional()` +
  `category: z.object({ id: z.number(), name: z.string() }).nullable().optional()`.
  (`packages/types/src/movements.ts:28` también tiene un campo `category`
  string, pero el backend de movimientos nunca lo puebla hoy — no se
  toca, es un campo de tipo ya inerte.)
- **`useStock.ts:42`**: ya existe un `categoryId: number` en
  `InventoryItem` con `// TODO: Get from product.category when
  available` — esta migración es exactamente lo que resuelve ese TODO.

## Backend (`celhm-api-main`)

### Nuevo módulo `SkuModule`

Vive en `src/sku/` (no dentro de `catalog/`, porque lo consumen tanto
`CatalogModule` como `StockModule`; ponerlo en cualquiera de los dos
crearía una dependencia cruzada innecesaria). Exporta `SkuGeneratorService`.

**`SkuGeneratorService`**

- `private async resolveCategoryNames(categoryId: number): Promise<{ root: string; leaf: string }>`
  Carga la categoría y camina `parentId` hasta la raíz. Si la categoría es
  ella misma la raíz (`parentId == null`), `root === leaf`.
- `private normalize(text: string, length: number): string`
  Uppercase, `normalize('NFD')` + strip de diacríticos, remueve todo lo
  que no sea `[A-Z0-9]`, y toma los primeros `length` caracteres (sin
  padding — un nombre corto simplemente aporta menos caracteres de los
  pedidos, no se rellena).
- `private async getMaskConfig(organizationId: number): Promise<SkuMaskSegment[]>`
  Lee `Organization.skuMaskConfig`; si está vacío usa el default descrito
  arriba.
- `private render(segments, ctx: { root; leaf; product; seq }): { prefix: string; full: string }`
  Concatena todos los segmentos no-`sequence` para obtener `prefix`, y
  arma `full` agregando el segmento `sequence` con
  `String(seq).padStart(digits, '0')`. Si la máscara no tiene ningún
  segmento `sequence`, `full === prefix` y no hay consecutivo (edge case
  documentado, no bloqueado).
- `async preview(organizationId: number, categoryId: number, productName: string): Promise<string>`
  Igual que `FoliosService.preview` (`folios.service.ts:71-96`): arma
  `prefix`, busca `SkuSequence` por `prefix` **sin** incrementar, calcula
  `nextSeq = (found?.seq ?? 0) + 1`, retorna `render(...).full`.
- `async next(organizationId: number, categoryId: number, productName: string): Promise<string>`
  Igual que `FoliosService.next` (`folios.service.ts:8-69`): `upsert` en
  `SkuSequence` por `prefix` (create con `seq: 1` / update
  `increment: 1`), con retry loop (5 intentos, backoff 10ms×intento) en
  `P2002`/`P2034`. Devuelve `render(...).full`.

### DTOs

- `CreateProductDto` (`catalog/dto/create-product.dto.ts`): se quita
  `category?: string`, se agrega `categoryId?: number` (`@IsOptional()
@IsInt()`). Mismo cambio en `UpdateProductDto`.
- `CreateVariantDto` (`catalog/dto/create-variant.dto.ts`): `sku` pasa de
  requerido a opcional (`@IsOptional()`). Si no viene, `CatalogService`
  llama a `SkuGeneratorService.next(...)` usando `product.categoryId` y
  `product.name` antes de crear la variante.
- `CreateInventoryItemDto` (`stock/dto/create-inventory-item.dto.ts`): se
  agrega `categoryId?: number`, usado solo cuando se crea un producto
  nuevo inline (`!dto.productId`). `sku` se mantiene opcional (ya lo era);
  si no viene, `StockService.createInventoryItem` llama a
  `SkuGeneratorService.next(...)` en vez del `Date.now()` actual
  (`stock.service.ts:298-303` y el retry de `stock.service.ts:344-370`
  se simplifican para no necesitar el retry manual — el retry ya vive
  dentro de `SkuGeneratorService.next`; si el usuario proveyó `sku` a
  mano, se mantiene la validación de unicidad y el error actual sin
  cambios).

### Endpoint nuevo

`GET /catalog/sku/preview?categoryId=&name=` → `CatalogController`, llama
`SkuGeneratorService.preview(user.organizationId, categoryId, name)`.
Requiere los mismos guards de auth que el resto de `/catalog`.

### Configuración de máscara — extensión de Organization

`UpdateOrgDto` (`org/dto/update-org.dto.ts`) gana un campo, siguiendo el
mismo patrón que `ticketLegends`/`TicketLegendDto`:

```ts
@IsOptional()
@IsArray()
@ValidateNested({ each: true })
@Type(() => SkuMaskSegmentDto)
skuMaskConfig?: SkuMaskSegmentDto[];
```

`SkuMaskSegmentDto` (nuevo, `org/dto/sku-mask-segment.dto.ts`) valida con
`class-validator`: `type` (`IsIn(['literal','root','category','product','sequence'])`),
`value?` (string, requerido si `type==='literal'`), `length?` (int
1-4, requerido para `root`/`category`/`product`), `digits?` (int 1-8,
requerido para `sequence`). `org.service.ts` persiste el array igual que
hace hoy con `ticketLegends` (`org.service.ts:65-66`).

## Frontend (`celhm-app-main`)

### Selector de categoría (Catálogo)

`catalog/page.tsx:717-772`: el dropdown en cascada existente pasa a
guardar/enviar `categoryId` (id de la subcategoría elegida) en vez de
armar un string de nombre.

### Configuración de máscara — nueva sección en Settings

`dashboard/settings/page.tsx`: nuevo `<form>` (mismo patrón que la
sección "Configuración de Ticket", líneas 480-562: usa
`useOrganization`/`useUpdateOrganization`, botón "Guardar Cambios"
independiente con su propio estado de "cambios sin guardar"). Contenido:

- 4 filas/columnas de segmento (replicando el mockup), cada una con un
  `<select>` de tipo (`Texto fijo / Raíz de categoría / Categoría /
  Nombre de producto / Consecutivo`) y, según el tipo, un input
  secundario (texto libre para `literal`, número de caracteres para
  `root/category/product`, número de dígitos para `sequence`).
- Vista previa en vivo debajo, usando datos de ejemplo fijos (categoría
  raíz "Accesorios", categoría "Cables", producto "Cable USB-C",
  consecutivo "1") — se calcula en el cliente replicando la misma lógica
  de `render` (sin llamar al backend, es solo ilustrativa).

### Formularios de creación

- `catalog/page.tsx` (alta de variante): al tener `categoryId` +
  `name` con valor, debounced `GET /catalog/sku/preview` prellena el
  campo SKU si el usuario no lo ha editado a mano todavía (se trackea con
  un flag `skuTouched` local, igual criterio que otros auto-fill del
  proyecto, ej. el de grupo de descuento en `CashRegister.tsx`).
- `inventory/page.tsx`: mismo mecanismo de preview en el modal de alta.
  El fallback de importación CSV (`inventory/page.tsx:615`,
  `sku: obj.sku || `SKU-${Date.now() + i}`) se elimina — si la fila no
  trae SKU, se deja `undefined` y el backend lo genera con la máscara al
  crear cada ítem (ya no se necesita un valor único armado en el
  cliente).

## Validación, errores y testing

**Validación:**
- Si se intenta generar un SKU automático (`sku` no provisto) para un
  producto sin `categoryId` (caso de un producto no migrado en la Fase 1,
  o creado sin elegir categoría), `SkuGeneratorService` no tiene cómo
  resolver `R`/`C` y `CatalogService`/`StockService` lo tratan como error
  de validación (`BadRequestException`: "Selecciona una categoría antes
  de generar el SKU automáticamente" o similar) — el usuario debe asignar
  categoría o escribir el SKU a mano en ese caso.
- `SkuMaskSegmentDto` valida la forma de cada segmento (ver arriba).
- `categoryId` en `CreateProductDto`/`CreateInventoryItemDto` debe
  referenciar una `ProductCategory` existente (`P2003`/FK error de Prisma
  se traduce a `BadRequestException`, mismo criterio que otros métodos de
  `CatalogService`, ej. `deleteCategory` en `catalog.service.ts:305-319`).
- Si el usuario edita el SKU sugerido a mano y ya existe, se mantiene el
  comportamiento actual: `BadRequestException` con mensaje claro (no se
  auto-corrige un SKU provisto explícitamente).

**Testing backend:**
- Unit `SkuGeneratorService`: `normalize` (mayúsculas, acentos, símbolos,
  string más corto que `length`), `render` (máscara default, máscara con
  literal, máscara sin segmento `sequence`), `preview` vs `next`
  (Prisma mockeado), colisión + reintento en `next` (mismo estilo que
  `folios.service.spec.ts`).
- Unit DTOs: `SkuMaskSegmentDto` rechaza combinaciones inválidas (ej.
  `type: 'sequence'` sin `digits`).
- Integration/e2e: crear producto con `categoryId`, crear variante sin
  `sku` y verificar que el SKU generado sigue el patrón esperado y es
  único ante creaciones concurrentes repetidas.

**Testing frontend:**
- Verificación manual (`pnpm dev`): configurar una máscara en Settings,
  crear una categoría con subcategoría, crear un producto/variante y
  confirmar que el campo SKU se precarga con el código esperado y sigue
  siendo editable; repetir en Inventario (alta directa e importación
  CSV sin SKU en el archivo).
