# Generador de código/SKU por máscara configurable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el SKU aleatorio (`SKU-${Date.now()}-${random}`) por un código generado a partir de una máscara configurable (segmentos de categoría raíz/categoría/nombre de producto/consecutivo), sugerido-pero-editable al crear un producto/variante, tanto en Catálogo como en Inventario.

**Architecture:** `Product` gana una FK real `categoryId → ProductCategory` (hoy solo guardaba el nombre de la subcategoría como string suelto). Un nuevo módulo `SkuModule` (compartido por `CatalogModule` y `StockModule`) resuelve raíz/categoría caminando el árbol de `ProductCategory`, arma el código con la máscara guardada en `Organization.skuMaskConfig` (JSON, mismo patrón que `ticketLegends`), y consume un consecutivo atómico por prefijo (`SkuSequence`, mismo patrón `upsert`+retry que `FolioSequence`/`FoliosService`). El frontend agrega un editor de máscara en Settings y un preview debounced en los formularios de creación.

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL, class-validator DTOs, Jest (backend); Next.js 15 + TanStack Query + Zod (`@celhm/types`), Jest + Testing Library (frontend).

**Design doc:** `docs/superpowers/specs/2026-08-15-sku-mascara-design.md`

## Global Constraints

- Repos de trabajo: `celhm-api-main` (Tasks 1-9) y `celhm-app-main` (Tasks 10-14).
- **Colisión de nombre en el schema:** Prisma no permite dos campos llamados `category` en `Product`. Se renombra el `String?` viejo a `categoryLegacy` usando `@map("category")` — la columna física en Postgres sigue llamándose `category` (no requiere `ALTER COLUMN RENAME`), y el nombre `category` queda libre para la nueva relación. Esto es más seguro que una migración de datos con columna nueva.
- `SkuSequence` **no** lleva `organizationId`: ni `Product`, ni `Variant`, ni `ProductCategory` están hoy scopeados por organización (son catálogo global; solo `Stock`/`Branch` lo están vía sucursal) — scopear `SkuSequence` sería inconsistente con el resto del dominio.
- `Organization.skuMaskConfig` se persiste igual que `ticketLegends`: `org.service.ts:60-69` ya hace `{ ...data, ... }` al armar el `update` de Prisma, así que agregar el campo al DTO es suficiente — **no** se toca `org.service.ts`.
- Normalización de tokens `R`/`C`/`P`: mayúsculas, sin acentos (`normalize('NFD')` + strip de diacríticos), solo `[A-Z0-9]`, tomar los primeros N caracteres. Si el texto fuente es más corto que N, **no se rellena** (se usa lo que haya).
- El consecutivo (`#`) se cuenta por prefijo (todo el mask menos el segmento `sequence`) — igual scope de "combinación de código" acordado en el spec.
- Si se pide un SKU automático para un producto sin `categoryId`, es un error de validación (`BadRequestException`), no un fallback silencioso.
- **Impacto adicional fuera del spec original, encontrado al mapear archivos exactos** (ver spec, sección "Impacto adicional detectado al planear"): `commissions/commission-plans.service.ts` y `commissions/commissions.service.ts` matchean `CommissionRule` por `product.category` (string) — pasan a leer `product.category?.name` vía relación (Task 7). El filtro `categoriaId` de `stock.service.ts` hacía `contains` sobre el string pese a su nombre — pasa a ser una igualdad real por FK (Task 8), lo cual además corrige un bug preexistente (el frontend ya mandaba IDs a ese filtro).
- Tras cada cambio de schema (Task 1): correr `pnpm db:generate` antes de escribir código que use los campos nuevos, si no `tsc`/`jest` fallan por tipos desconocidos.
- No `console.log` en `src/` (sí se usa en `prisma/*.ts`, scripts standalone — mismo criterio que `prisma/seed.ts`).
- Todas las escrituras vía Prisma, sin SQL crudo.
- Texto de UI en español, consistente con el resto de la app.
- **Cobertura e2e deliberadamente parcial:** ya existe `test/stock.e2e-spec.ts`, así que Task 8 le agrega un caso de generación de SKU. No existe `test/catalog.e2e-spec.ts` — crear esa suite desde cero (login, seed de categorías, etc.) es un esfuerzo aparte no cubierto por este plan; la cobertura de `createVariant`/`previewSku` en Task 6 queda a nivel de unit test con Prisma mockeado, que ya cubre las ramas de negocio nuevas.

---

### Task 1: Prisma schema — `categoryId`, `skuMaskConfig`, `SkuSequence`

**Files:**
- Modify: `prisma/schema.prisma:112-130` (modelo `Product`)
- Modify: `prisma/schema.prisma:13-39` (modelo `Organization`)
- Modify: `prisma/schema.prisma:248-258` (modelo `ProductCategory`)
- Create: nuevo modelo `SkuSequence` (agregar después de `FolioSequence`, línea 383)
- Create: `prisma/migrations/<timestamp>_add_sku_mask_infra/migration.sql` (generado, no se escribe a mano)

**Interfaces:**
- Produces: `Product.categoryId: number | null`, `Product.category: ProductCategory | null` (relación), `Product.categoryLegacy: string | null` (dato viejo, de solo lectura para el backfill), `Organization.skuMaskConfig: Json`, modelo `SkuSequence { id, prefix, seq }`. Los usan todas las tareas siguientes.

- [ ] **Step 1: Editar `Product`**

En `prisma/schema.prisma`, reemplazar el campo `category` (línea 116) y agregar la relación:

```prisma
model Product {
  id             Int       @id @default(autoincrement())
  name           String
  description    String?
  categoryLegacy String?   @map("category")
  categoryId     Int?
  category       ProductCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  brand          String?
  model          String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?
  variants       Variant[]

  tracksInventory Boolean @default(true)
  isPriceEditable Boolean @default(false)
  isCommissionable Boolean @default(false)

  @@index([deletedAt])
  @@map("products")
}
```

- [ ] **Step 2: Editar `ProductCategory`** (agregar el lado inverso de la relación)

```prisma
model ProductCategory {
  id            Int               @id @default(autoincrement())
  name          String            @unique
  parentId      Int?
  parent        ProductCategory?  @relation("CategoryChildren", fields: [parentId], references: [id])
  children      ProductCategory[] @relation("CategoryChildren")
  products      Product[]
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  @@map("product_categories")
}
```

- [ ] **Step 3: Editar `Organization`** (agregar `skuMaskConfig` junto a `ticketLegends`, línea 26)

```prisma
  ticketLegends Json                  @default("[]")
  skuMaskConfig Json                  @default("[]")
```

- [ ] **Step 4: Agregar el modelo `SkuSequence`**

Insertar después del modelo `FolioSequence` (línea 383):

```prisma
model SkuSequence {
  id        Int      @id @default(autoincrement())
  prefix    String   @unique
  seq       Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("sku_sequences")
}
```

- [ ] **Step 5: Generar y correr la migración**

Run: `pnpm db:migrate:dev --name add_sku_mask_infra`
Expected: Prisma imprime "Your database is now in sync with your schema" y crea `prisma/migrations/<timestamp>_add_sku_mask_infra/`. La migración solo agrega columnas/tablas nuevas — no toca datos existentes (el campo `category` original queda intacto bajo el nombre Prisma `categoryLegacy`).

- [ ] **Step 6: Regenerar el cliente de Prisma**

Run: `pnpm db:generate`
Expected: "Generated Prisma Client" sin errores.

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: FALLA — el código existente todavía usa `product.category` como string (`catalog.service.ts`, `commissions/*.ts`, DTOs). Es esperado; se corrige en las tareas siguientes. Confirmar que los únicos errores nuevos son sobre `category`/`categoryLegacy`, no otros.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add categoryId FK, skuMaskConfig, and SkuSequence"
```

---

### Task 2: Script de backfill — `categoryId` desde `categoryLegacy`

**Files:**
- Create: `src/catalog/utils/match-category-id.util.ts`
- Test: `src/catalog/utils/match-category-id.util.spec.ts`
- Create: `prisma/backfill-category-id.ts`

**Interfaces:**
- Consumes: `Product.categoryLegacy`, `ProductCategory.{id,name}` de Task 1.
- Produces: `matchCategoryId(categoryName, categories): number | null` — función pura, sin dependencias de Prisma, reusable/testeable en aislamiento.

- [ ] **Step 1: Escribir el test de la función de matching**

```ts
// src/catalog/utils/match-category-id.util.spec.ts
import { matchCategoryId, CategoryRef } from './match-category-id.util';

describe('matchCategoryId', () => {
  const categories: CategoryRef[] = [
    { id: 1, name: 'Accesorios' },
    { id: 2, name: 'Cables' },
  ];

  it('matches by exact name', () => {
    expect(matchCategoryId('Cables', categories)).toBe(2);
  });

  it('matches case-insensitively and ignoring whitespace', () => {
    expect(matchCategoryId('  cables  ', categories)).toBe(2);
  });

  it('returns null when there is no match', () => {
    expect(matchCategoryId('Pantallas', categories)).toBeNull();
  });

  it('returns null for a null/empty category name', () => {
    expect(matchCategoryId(null, categories)).toBeNull();
    expect(matchCategoryId('', categories)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test -- match-category-id`
Expected: FAIL — `Cannot find module './match-category-id.util'`.

- [ ] **Step 3: Implementar la función**

```ts
// src/catalog/utils/match-category-id.util.ts
export interface CategoryRef {
  id: number;
  name: string;
}

export function matchCategoryId(
  categoryName: string | null | undefined,
  categories: CategoryRef[],
): number | null {
  if (!categoryName) return null;
  const normalized = categoryName.trim().toLowerCase();
  const match = categories.find((c) => c.name.trim().toLowerCase() === normalized);
  return match ? match.id : null;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test -- match-category-id`
Expected: PASS (4 tests).

- [ ] **Step 5: Escribir el script de backfill**

```ts
// prisma/backfill-category-id.ts
import { PrismaClient } from '@prisma/client';
import { matchCategoryId } from '../src/catalog/utils/match-category-id.util';

const prisma = new PrismaClient();

async function main() {
  const categories = await prisma.productCategory.findMany({
    select: { id: true, name: true },
  });

  const products = await prisma.product.findMany({
    where: { categoryLegacy: { not: null }, categoryId: null },
    select: { id: true, categoryLegacy: true },
  });

  console.log(`Encontrados ${products.length} productos con categoría legacy sin migrar.`);

  const unmatched: { id: number; categoryLegacy: string | null }[] = [];
  let updated = 0;

  for (const product of products) {
    const categoryId = matchCategoryId(product.categoryLegacy, categories);
    if (categoryId === null) {
      unmatched.push(product);
      continue;
    }
    await prisma.product.update({
      where: { id: product.id },
      data: { categoryId },
    });
    updated++;
  }

  console.log(`✅ Migrados: ${updated}`);
  if (unmatched.length > 0) {
    console.log(`⚠️  Sin match (revisar manualmente, quedan con categoryId = null):`);
    for (const p of unmatched) {
      console.log(`  - Product #${p.id}: categoryLegacy="${p.categoryLegacy}"`);
    }
  }
}

main()
  .catch((error) => {
    console.error('Error en el backfill:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 6: Correr el script contra la base de datos de desarrollo**

Run: `npx ts-node prisma/backfill-category-id.ts`
Expected: imprime cuántos productos se migraron y lista (si hay) los que no tuvieron match. Revisar la lista de no-matches a mano — si hay alguno, decidir si crear la categoría faltante vía el CRUD existente (`POST /catalog/categories`) y re-correr el script, o dejarlo pendiente de asignación manual desde el frontend.

- [ ] **Step 7: Commit**

```bash
git add src/catalog/utils/match-category-id.util.ts src/catalog/utils/match-category-id.util.spec.ts prisma/backfill-category-id.ts
git commit -m "feat(catalog): add categoryId backfill script"
```

---

### Task 3: Lógica pura de máscara — `normalizeSkuToken` / `renderSkuMask`

**Files:**
- Create: `src/sku/sku-mask.util.ts`
- Test: `src/sku/sku-mask.util.spec.ts`

**Interfaces:**
- Produces: `SkuMaskSegment` (union type), `DEFAULT_SKU_MASK: SkuMaskSegment[]`, `normalizeSkuToken(text, length): string`, `renderSkuMask(segments, ctx): { prefix: string; full: string }`. Los usa Task 4 (`SkuGeneratorService`).

- [ ] **Step 1: Escribir los tests**

```ts
// src/sku/sku-mask.util.spec.ts
import { normalizeSkuToken, renderSkuMask, DEFAULT_SKU_MASK } from './sku-mask.util';

describe('normalizeSkuToken', () => {
  it('uppercases and takes the first N characters', () => {
    expect(normalizeSkuToken('cables', 2)).toBe('CA');
  });

  it('strips accents and non-alphanumeric characters', () => {
    expect(normalizeSkuToken('Cable GA Ugreen/Essager', 4)).toBe('CABL');
  });

  it('does not pad when the source is shorter than length', () => {
    expect(normalizeSkuToken('A', 4)).toBe('A');
  });
});

describe('renderSkuMask', () => {
  it('reproduces the CAC0117 example from the mask mockup', () => {
    const result = renderSkuMask(DEFAULT_SKU_MASK, {
      root: 'Accesorios',
      category: 'Cables',
      product: 'Cable GA Ugreen/Essager 1M USB A Ligthin',
      seq: 117,
    });
    expect(result.prefix).toBe('CAC');
    expect(result.full).toBe('CAC0117');
  });

  it('includes literal segments verbatim', () => {
    const result = renderSkuMask(
      [
        { type: 'literal', value: '-' },
        { type: 'category', length: 2 },
        { type: 'sequence', digits: 2 },
      ],
      { root: '', category: 'Cables', product: '', seq: 3 },
    );
    expect(result.full).toBe('-CA03');
  });

  it('produces only the prefix when there is no sequence segment', () => {
    const result = renderSkuMask(
      [{ type: 'root', length: 1 }, { type: 'category', length: 2 }],
      { root: 'Accesorios', category: 'Cables', product: '', seq: 1 },
    );
    expect(result.prefix).toBe('ACA');
    expect(result.full).toBe('ACA');
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm test -- sku-mask`
Expected: FAIL — `Cannot find module './sku-mask.util'`.

- [ ] **Step 3: Implementar**

```ts
// src/sku/sku-mask.util.ts
export type SkuMaskSegment =
  | { type: 'literal'; value: string }
  | { type: 'root' | 'category' | 'product'; length: number }
  | { type: 'sequence'; digits: number };

export const DEFAULT_SKU_MASK: SkuMaskSegment[] = [
  { type: 'category', length: 2 },
  { type: 'product', length: 1 },
  { type: 'sequence', digits: 4 },
];

export interface SkuMaskContext {
  root: string;
  category: string;
  product: string;
  seq: number;
}

export function normalizeSkuToken(text: string, length: number): string {
  const cleaned = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return cleaned.slice(0, length);
}

export function renderSkuMask(
  segments: SkuMaskSegment[],
  ctx: SkuMaskContext,
): { prefix: string; full: string } {
  let prefix = '';
  let sequencePart = '';

  for (const segment of segments) {
    switch (segment.type) {
      case 'literal':
        prefix += segment.value;
        break;
      case 'root':
        prefix += normalizeSkuToken(ctx.root, segment.length);
        break;
      case 'category':
        prefix += normalizeSkuToken(ctx.category, segment.length);
        break;
      case 'product':
        prefix += normalizeSkuToken(ctx.product, segment.length);
        break;
      case 'sequence':
        sequencePart = String(ctx.seq).padStart(segment.digits, '0');
        break;
    }
  }

  return { prefix, full: prefix + sequencePart };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm test -- sku-mask`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sku/sku-mask.util.ts src/sku/sku-mask.util.spec.ts
git commit -m "feat(sku): add pure sku mask normalization/render logic"
```

---

### Task 4: `SkuGeneratorService` + `SkuModule`

**Files:**
- Create: `src/sku/sku-generator.service.ts`
- Test: `src/sku/sku-generator.service.spec.ts`
- Create: `src/sku/sku.module.ts`

**Interfaces:**
- Consumes: `renderSkuMask`, `DEFAULT_SKU_MASK`, `SkuMaskSegment` de Task 3; `Product.categoryId`, `ProductCategory.parentId`, `Organization.skuMaskConfig`, `SkuSequence` de Task 1.
- Produces: `SkuGeneratorService.preview(organizationId, categoryId, productName): Promise<string>`, `SkuGeneratorService.next(organizationId, categoryId, productName): Promise<string>` (lanza `BadRequestException` si `categoryId` no existe). `SkuModule` exporta `SkuGeneratorService`. Los usan Task 6 y Task 8.

- [ ] **Step 1: Escribir los tests (con `PrismaService` mockeado, mismo patrón que `folios.service.spec.ts`)**

```ts
// src/sku/sku-generator.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { SkuGeneratorService } from './sku-generator.service';
import { PrismaService } from '../common/prisma/prisma.service';

describe('SkuGeneratorService', () => {
  let service: SkuGeneratorService;

  const mockPrismaService = {
    productCategory: {
      findUnique: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    skuSequence: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const leafCategory = { id: 2, name: 'Cables', parentId: 1 };
  const rootCategory = { id: 1, name: 'Accesorios', parentId: null };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkuGeneratorService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SkuGeneratorService>(SkuGeneratorService);
  });

  describe('preview', () => {
    it('uses the default mask when the organization has no config', async () => {
      mockPrismaService.productCategory.findUnique
        .mockResolvedValueOnce(leafCategory)
        .mockResolvedValueOnce(rootCategory);
      mockPrismaService.organization.findUnique.mockResolvedValue({ skuMaskConfig: [] });
      mockPrismaService.skuSequence.findUnique.mockResolvedValue(null);

      const result = await service.preview(1, 2, 'Cable USB-C');

      expect(result).toBe('CAC0001');
    });

    it('increments from the existing sequence for the same prefix', async () => {
      mockPrismaService.productCategory.findUnique
        .mockResolvedValueOnce(leafCategory)
        .mockResolvedValueOnce(rootCategory);
      mockPrismaService.organization.findUnique.mockResolvedValue({ skuMaskConfig: [] });
      mockPrismaService.skuSequence.findUnique.mockResolvedValue({ seq: 116 });

      const result = await service.preview(1, 2, 'Cable USB-C');

      expect(result).toBe('CAC0117');
    });

    it('uses the organization mask config when present', async () => {
      mockPrismaService.productCategory.findUnique
        .mockResolvedValueOnce(rootCategory)
        .mockResolvedValueOnce(rootCategory);
      mockPrismaService.organization.findUnique.mockResolvedValue({
        skuMaskConfig: [
          { type: 'literal', value: 'ACC-' },
          { type: 'sequence', digits: 3 },
        ],
      });
      mockPrismaService.skuSequence.findUnique.mockResolvedValue(null);

      const result = await service.preview(1, 1, 'Cargador');

      expect(result).toBe('ACC-001');
    });

    it('throws when the category does not exist', async () => {
      mockPrismaService.productCategory.findUnique.mockResolvedValue(null);

      await expect(service.preview(1, 999, 'X')).rejects.toThrow('999');
    });
  });

  describe('next', () => {
    it('creates the first sequence for a new prefix', async () => {
      mockPrismaService.productCategory.findUnique
        .mockResolvedValueOnce(leafCategory)
        .mockResolvedValueOnce(rootCategory);
      mockPrismaService.organization.findUnique.mockResolvedValue({ skuMaskConfig: [] });
      mockPrismaService.skuSequence.upsert.mockResolvedValue({ seq: 1 });

      const result = await service.next(1, 2, 'Cable USB-C');

      expect(result).toBe('CAC0001');
      expect(mockPrismaService.skuSequence.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { prefix: 'CAC' } }),
      );
    });

    it('retries on a unique constraint collision and succeeds', async () => {
      mockPrismaService.productCategory.findUnique
        .mockResolvedValueOnce(leafCategory)
        .mockResolvedValueOnce(rootCategory);
      mockPrismaService.organization.findUnique.mockResolvedValue({ skuMaskConfig: [] });
      mockPrismaService.skuSequence.upsert
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockResolvedValueOnce({ seq: 2 });

      const result = await service.next(1, 2, 'Cable USB-C');

      expect(result).toBe('CAC0002');
      expect(mockPrismaService.skuSequence.upsert).toHaveBeenCalledTimes(2);
    });
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm test -- sku-generator`
Expected: FAIL — `Cannot find module './sku-generator.service'`.

- [ ] **Step 3: Implementar `SkuGeneratorService`**

```ts
// src/sku/sku-generator.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { renderSkuMask, DEFAULT_SKU_MASK, SkuMaskSegment } from './sku-mask.util';

@Injectable()
export class SkuGeneratorService {
  constructor(private prisma: PrismaService) {}

  private async resolveCategoryNames(
    categoryId: number,
  ): Promise<{ root: string; category: string }> {
    const leaf = await this.prisma.productCategory.findUnique({ where: { id: categoryId } });
    if (!leaf) {
      throw new BadRequestException(`Categoría con id ${categoryId} no encontrada`);
    }

    let current = leaf;
    while (current.parentId !== null) {
      const parent = await this.prisma.productCategory.findUnique({
        where: { id: current.parentId },
      });
      if (!parent) break;
      current = parent;
    }

    return { root: current.name, category: leaf.name };
  }

  private async getMaskConfig(organizationId: number): Promise<SkuMaskSegment[]> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { skuMaskConfig: true },
    });
    const configured = org?.skuMaskConfig as SkuMaskSegment[] | undefined;
    return configured && configured.length > 0 ? configured : DEFAULT_SKU_MASK;
  }

  async preview(organizationId: number, categoryId: number, productName: string): Promise<string> {
    const { root, category } = await this.resolveCategoryNames(categoryId);
    const segments = await this.getMaskConfig(organizationId);
    const { prefix } = renderSkuMask(segments, { root, category, product: productName, seq: 0 });

    const existing = await this.prisma.skuSequence.findUnique({ where: { prefix } });
    const nextSeq = (existing?.seq ?? 0) + 1;

    return renderSkuMask(segments, { root, category, product: productName, seq: nextSeq }).full;
  }

  async next(organizationId: number, categoryId: number, productName: string): Promise<string> {
    const { root, category } = await this.resolveCategoryNames(categoryId);
    const segments = await this.getMaskConfig(organizationId);
    const { prefix } = renderSkuMask(segments, { root, category, product: productName, seq: 0 });

    const maxRetries = 5;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const sequence = await this.prisma.skuSequence.upsert({
          where: { prefix },
          update: { seq: { increment: 1 } },
          create: { prefix, seq: 1 },
        });
        return renderSkuMask(segments, {
          root,
          category,
          product: productName,
          seq: sequence.seq,
        }).full;
      } catch (error: any) {
        if (error.code === 'P2002' || error.code === 'P2034') {
          retries++;
          if (retries >= maxRetries) {
            throw new Error('Failed to generate SKU after retries');
          }
          await new Promise((resolve) => setTimeout(resolve, 10 * retries));
          continue;
        }
        throw error;
      }
    }

    throw new Error('Failed to generate SKU');
  }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm test -- sku-generator`
Expected: PASS (6 tests).

- [ ] **Step 5: Crear `SkuModule`**

```ts
// src/sku/sku.module.ts
import { Module } from '@nestjs/common';
import { SkuGeneratorService } from './sku-generator.service';

@Module({
  providers: [SkuGeneratorService],
  exports: [SkuGeneratorService],
})
export class SkuModule {}
```

- [ ] **Step 6: Typecheck y commit**

Run: `pnpm typecheck` (sigue fallando por `category` en otros archivos — confirmar que no hay errores nuevos en `src/sku/`).

```bash
git add src/sku
git commit -m "feat(sku): add SkuGeneratorService with atomic sequence generation"
```

---

### Task 5: `Organization.skuMaskConfig` — DTO

**Files:**
- Create: `src/org/dto/sku-mask-segment.dto.ts`
- Test: `src/org/dto/sku-mask-segment.dto.spec.ts`
- Modify: `src/org/dto/update-org.dto.ts`

**Interfaces:**
- Consumes: ninguna nueva (valida la misma forma de `SkuMaskSegment` de Task 3, pero como DTO de `class-validator` independiente — no comparten tipo, es la frontera HTTP).
- Produces: `SkuMaskSegmentDto`. `UpdateOrgDto.skuMaskConfig?: SkuMaskSegmentDto[]`.

- [ ] **Step 1: Escribir los tests**

```ts
// src/org/dto/sku-mask-segment.dto.spec.ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SkuMaskSegmentDto } from './sku-mask-segment.dto';

describe('SkuMaskSegmentDto', () => {
  it('accepts a valid literal segment', async () => {
    const dto = plainToInstance(SkuMaskSegmentDto, { type: 'literal', value: '-' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a valid category segment', async () => {
    const dto = plainToInstance(SkuMaskSegmentDto, { type: 'category', length: 2 });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a valid sequence segment', async () => {
    const dto = plainToInstance(SkuMaskSegmentDto, { type: 'sequence', digits: 4 });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a sequence segment without digits', async () => {
    const dto = plainToInstance(SkuMaskSegmentDto, { type: 'sequence' });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects an out-of-range length', async () => {
    const dto = plainToInstance(SkuMaskSegmentDto, { type: 'category', length: 10 });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects an unknown type', async () => {
    const dto = plainToInstance(SkuMaskSegmentDto, { type: 'bogus' });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm test -- sku-mask-segment`
Expected: FAIL — `Cannot find module './sku-mask-segment.dto'`.

- [ ] **Step 3: Implementar el DTO**

```ts
// src/org/dto/sku-mask-segment.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Max, Min, ValidateIf } from 'class-validator';

export class SkuMaskSegmentDto {
  @ApiProperty({
    description: 'Segment type',
    enum: ['literal', 'root', 'category', 'product', 'sequence'],
  })
  @IsIn(['literal', 'root', 'category', 'product', 'sequence'])
  type: 'literal' | 'root' | 'category' | 'product' | 'sequence';

  @ApiPropertyOptional({ description: 'Fixed text (required when type is "literal")' })
  @ValidateIf((o) => o.type === 'literal')
  @IsString()
  value?: string;

  @ApiPropertyOptional({
    description: 'Number of characters to take (required for root/category/product)',
  })
  @ValidateIf((o) => o.type === 'root' || o.type === 'category' || o.type === 'product')
  @IsInt()
  @Min(1)
  @Max(4)
  length?: number;

  @ApiPropertyOptional({ description: 'Digits for the sequence counter (required when type is "sequence")' })
  @ValidateIf((o) => o.type === 'sequence')
  @IsInt()
  @Min(1)
  @Max(8)
  digits?: number;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm test -- sku-mask-segment`
Expected: PASS (6 tests).

- [ ] **Step 5: Extender `UpdateOrgDto`**

En `src/org/dto/update-org.dto.ts`, agregar el import y el campo (después de `ticketLegends`, línea 66):

```ts
import { SkuMaskSegmentDto } from './sku-mask-segment.dto';
```

```ts
    @ApiPropertyOptional({
        description: 'SKU mask configuration segments, in display order',
        type: [SkuMaskSegmentDto],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SkuMaskSegmentDto)
    skuMaskConfig?: SkuMaskSegmentDto[];
```

- [ ] **Step 6: Typecheck y commit**

Run: `pnpm typecheck` (mismo estado que antes, sin errores nuevos en `src/org/`).

```bash
git add src/org/dto/sku-mask-segment.dto.ts src/org/dto/sku-mask-segment.dto.spec.ts src/org/dto/update-org.dto.ts
git commit -m "feat(org): validate skuMaskConfig on organization update"
```

---

### Task 6: Catálogo — `categoryId` en Product/Variant + preview de SKU

**Files:**
- Modify: `src/catalog/dto/create-product.dto.ts`
- Modify: `src/catalog/dto/update-product.dto.ts`
- Modify: `src/catalog/dto/create-variant.dto.ts`
- Modify: `src/catalog/catalog.service.ts`
- Modify: `src/catalog/catalog.controller.ts`
- Modify: `src/catalog/catalog.module.ts`
- Test: `src/catalog/catalog.service.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `SkuGeneratorService.preview`/`next` de Task 4.
- Produces: `CatalogService.createVariant(dto, organizationId)` (firma cambiada — antes no recibía `organizationId`), `CatalogService.previewSku(organizationId, categoryId, name): Promise<string>`. `GET /catalog/sku/preview?categoryId=&name=`.

- [ ] **Step 1: Escribir los tests (fallando)**

```ts
// src/catalog/catalog.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { SkuGeneratorService } from '../sku/sku-generator.service';

describe('CatalogService', () => {
  let service: CatalogService;

  const mockPrismaService = {
    product: {
      findUnique: jest.fn(),
    },
    variant: {
      create: jest.fn(),
    },
  };

  const mockSkuGenerator = {
    next: jest.fn(),
    preview: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SkuGeneratorService, useValue: mockSkuGenerator },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
  });

  describe('createVariant', () => {
    it('uses the provided sku as-is without calling the generator', async () => {
      mockPrismaService.variant.create.mockResolvedValue({ id: 1, sku: 'MANUAL-1' });

      await service.createVariant({ productId: 1, sku: 'MANUAL-1' } as any, 1);

      expect(mockSkuGenerator.next).not.toHaveBeenCalled();
      expect(mockPrismaService.variant.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sku: 'MANUAL-1' }) }),
      );
    });

    it('generates the sku from the mask when omitted', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue({
        id: 1,
        name: 'Cable USB-C',
        categoryId: 2,
      });
      mockSkuGenerator.next.mockResolvedValue('CAC0001');
      mockPrismaService.variant.create.mockResolvedValue({ id: 1, sku: 'CAC0001' });

      await service.createVariant({ productId: 1 } as any, 1);

      expect(mockSkuGenerator.next).toHaveBeenCalledWith(1, 2, 'Cable USB-C');
      expect(mockPrismaService.variant.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sku: 'CAC0001' }) }),
      );
    });

    it('throws when the product has no category and no sku was provided', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue({
        id: 1,
        name: 'Cable USB-C',
        categoryId: null,
      });

      await expect(service.createVariant({ productId: 1 } as any, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when the product does not exist', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(null);

      await expect(service.createVariant({ productId: 999 } as any, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('previewSku', () => {
    it('delegates to SkuGeneratorService.preview', async () => {
      mockSkuGenerator.preview.mockResolvedValue('CAC0001');

      const result = await service.previewSku(1, 2, 'Cable USB-C');

      expect(result).toBe('CAC0001');
      expect(mockSkuGenerator.preview).toHaveBeenCalledWith(1, 2, 'Cable USB-C');
    });
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm test -- catalog.service`
Expected: FAIL — `createVariant`/`previewSku` no tienen la firma nueva.

- [ ] **Step 3: Actualizar `CreateProductDto`/`UpdateProductDto`**

En `src/catalog/dto/create-product.dto.ts`, reemplazar (línea 15-18):

```ts
  @ApiPropertyOptional({ description: 'Product category ID' })
  @IsOptional()
  @IsInt()
  categoryId?: number;
```

y agregar `IsInt` al import de `class-validator` (línea 3). Aplicar el mismo cambio en `src/catalog/dto/update-product.dto.ts` (línea 16-19), agregando también el import de `IsInt`.

- [ ] **Step 4: Hacer `sku` opcional en `CreateVariantDto`**

En `src/catalog/dto/create-variant.dto.ts` (línea 10-12):

```ts
  @ApiPropertyOptional({ description: 'SKU code (auto-generated from category/product name if omitted)' })
  @IsOptional()
  @IsString()
  sku?: string;
```

- [ ] **Step 5: Implementar en `CatalogService`**

Agregar el import y el constructor en `src/catalog/catalog.service.ts`:

```ts
import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SkuGeneratorService } from '../sku/sku-generator.service';
```

```ts
  constructor(
    private prisma: PrismaService,
    private skuGenerator: SkuGeneratorService,
  ) { }
```

Reemplazar los filtros de categoría en `getProducts` (línea 26-28 y 44):

```ts
    if (filters?.categoria) {
      where.category = { name: { contains: filters.categoria, mode: 'insensitive' } };
    }
```

```ts
        { category: { name: { contains: filters.q, mode: 'insensitive' } } },
```

Agregar `category: true` al `include` de `getProducts` (junto a `variants`, línea 51-59), `createProduct` (línea 82-89) y `updateProduct` (línea 97-104).

Reemplazar el filtro de categoría en `getVariants` (línea 146-152):

```ts
    if (filters?.categoria) {
      andConditions.push({
        product: {
          category: { name: { contains: filters.categoria, mode: 'insensitive' } },
        },
      });
    }
```

Y el `select` del producto embebido en `getVariants` (línea 178-185):

```ts
        include: {
          product: {
            select: {
              id: true,
              name: true,
              category: { select: { id: true, name: true } },
              brand: true,
              model: true,
            },
          },
        },
```

Reemplazar `createVariant` (línea 205-224):

```ts
  async createVariant(dto: CreateVariantDto, organizationId: number) {
    let sku = dto.sku;

    if (!sku) {
      const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
      if (!product) {
        throw new NotFoundException(`Producto con id ${dto.productId} no encontrado`);
      }
      if (!product.categoryId) {
        throw new BadRequestException(
          'Selecciona una categoría antes de generar el SKU automáticamente',
        );
      }
      sku = await this.skuGenerator.next(organizationId, product.categoryId, product.name);
    }

    return this.prisma.variant.create({
      data: {
        productId: dto.productId,
        sku,
        name: dto.name,
        description: dto.description,
        color: dto.color,
        size: dto.size,
        weight: dto.weight,
        dimensions: dto.dimensions,
        price: dto.price,
        purchasePrice: dto.purchasePrice,
        barcode: dto.barcode,
      },
      include: {
        product: true,
      },
    });
  }
```

Agregar el método nuevo, cerca de `getVariantById`:

```ts
  async previewSku(organizationId: number, categoryId: number, productName: string) {
    return this.skuGenerator.preview(organizationId, categoryId, productName);
  }
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `pnpm test -- catalog.service`
Expected: PASS (5 tests).

- [ ] **Step 7: Wiring del controller**

En `src/catalog/catalog.controller.ts`, agregar imports:

```ts
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
```

Actualizar `createVariant` (línea 113-119):

```ts
  @Post('variants')
  @ApiOperation({ summary: 'Create new variant' })
  @ApiResponse({ status: 201, description: 'Variant created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or duplicate SKU' })
  async createVariant(
    @Body() createVariantDto: CreateVariantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.catalogService.createVariant(createVariantDto, user.organizationId);
  }
```

Agregar el endpoint de preview (después de `getVariantById`, línea 147):

```ts
  @Get('sku/preview')
  @ApiOperation({ summary: 'Preview the next auto-generated SKU for a category/product name' })
  @ApiQuery({ name: 'categoryId', required: true })
  @ApiQuery({ name: 'name', required: true })
  async previewSku(
    @Query('categoryId') categoryId: string,
    @Query('name') name: string,
    @CurrentUser() user: AuthUser,
  ) {
    return { sku: await this.catalogService.previewSku(user.organizationId, parseInt(categoryId, 10), name) };
  }
```

- [ ] **Step 8: Wiring del módulo**

En `src/catalog/catalog.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { SkuModule } from '../sku/sku.module';

@Module({
  imports: [SkuModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
```

- [ ] **Step 9: Typecheck y commit**

Run: `pnpm typecheck` (los errores restantes deben ser solo de `commissions/` y `stock/`, corregidos en Tasks 7-8).

```bash
git add src/catalog
git commit -m "feat(catalog): categoryId FK, auto-generated SKU, and preview endpoint"
```

---

### Task 7: Comisiones — matchear por `category.name` vía relación

**Files:**
- Modify: `src/commissions/commissions.service.ts:20` (include), `:154` (lectura)
- Modify: `src/commissions/commission-plans.service.ts:185-192` (`listKnownCategories`)
- Modify: `src/commissions/commissions.service.spec.ts` (mocks en líneas 54, 105, 147, 169)
- Modify: `src/commissions/commission-plans.service.spec.ts` (mock y aserciones en líneas 149, 154-156)

**Interfaces:**
- Consumes: `Product.categoryId`, `Product.category` (relación) de Task 1.
- Produces: sin cambio de firma pública — `listKnownCategories`/`generateForLine` siguen devolviendo/usando nombres de categoría como string, solo cambia de dónde los leen.

- [ ] **Step 1: Actualizar el include en `commissions.service.ts`**

Línea 20, cambiar:

```ts
            variant: { include: { product: true } },
```

por:

```ts
            variant: { include: { product: { include: { category: true } } } },
```

- [ ] **Step 2: Actualizar la lectura en `commissions.service.ts`**

Línea 154, cambiar:

```ts
      productCategory = line.variant.product?.category ?? null;
```

por:

```ts
      productCategory = line.variant.product?.category?.name ?? null;
```

- [ ] **Step 3: Actualizar `listKnownCategories` en `commission-plans.service.ts`**

Líneas 185-192, reemplazar por:

```ts
  async listKnownCategories(organizationId: number): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      where: { deletedAt: null, categoryId: { not: null } },
      select: { category: { select: { name: true } } },
      distinct: ['categoryId'],
    });
    return rows
      .map((r) => r.category?.name)
      .filter((name): name is string => Boolean(name));
  }
```

- [ ] **Step 4: Actualizar los specs existentes**

En `src/commissions/commission-plans.service.spec.ts`, línea 149:

```ts
    mockPrisma.product.findMany.mockResolvedValue([{ category: 'Accesorios' }, { category: 'Pantallas' }]);
```

→

```ts
    mockPrisma.product.findMany.mockResolvedValue([
      { category: { name: 'Accesorios' } },
      { category: { name: 'Pantallas' } },
    ]);
```

Líneas 154-156:

```ts
      where: { deletedAt: null, category: { not: null } },
      select: { category: true },
      distinct: ['category'],
```

→

```ts
      where: { deletedAt: null, categoryId: { not: null } },
      select: { category: { select: { name: true } } },
      distinct: ['categoryId'],
```

En `src/commissions/commissions.service.spec.ts`, las 4 ocurrencias (líneas 54, 105, 147, 169) de `product: { category: 'Accesorios' }` pasan a `product: { category: { name: 'Accesorios' } }` (usar find-and-replace de esa cadena exacta en el archivo — es literal en las 4 ocurrencias).

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `pnpm test -- commissions`
Expected: PASS (todos los tests de `commission-plans.service.spec.ts` y `commissions.service.spec.ts`).

- [ ] **Step 6: Typecheck y commit**

Run: `pnpm typecheck` (los errores restantes deben ser solo de `stock/`, corregidos en Task 8).

```bash
git add src/commissions
git commit -m "fix(commissions): match product category by relation name after categoryId migration"
```

---

### Task 8: Inventario — `categoryId` + generación de SKU + filtro real

**Files:**
- Modify: `src/stock/dto/create-inventory-item.dto.ts`
- Modify: `src/stock/stock.service.ts`
- Modify: `src/stock/stock.module.ts`
- Test: `src/stock/stock.service.spec.ts`

**Interfaces:**
- Consumes: `SkuGeneratorService.next` de Task 4.
- Produces: `CreateInventoryItemDto.categoryId?: number`. `StockService.createInventoryItem` sigue con la misma firma pública.

- [ ] **Step 1: Escribir los tests (fallando)**

Agregar a `src/stock/stock.service.spec.ts` (extender `mockPrismaService` con `product.findUnique`/`create` y `variant.create`, y agregar `SkuGeneratorService` como provider mockeado):

```ts
// dentro de mockPrismaService, agregar:
    product: {
      update: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    variant: {
      update: jest.fn(),
      create: jest.fn(),
    },
```

```ts
// import nuevo arriba del archivo
import { SkuGeneratorService } from '../sku/sku-generator.service';

// dentro de providers del TestingModule
        { provide: SkuGeneratorService, useValue: mockSkuGenerator },
```

```ts
  const mockSkuGenerator = {
    next: jest.fn(),
  };
```

```ts
  describe('createInventoryItem', () => {
    it('generates the sku from the mask for a new inline product', async () => {
      mockPrismaService.product.create.mockResolvedValue({ id: 1, name: 'Cable USB-C', categoryId: 2 });
      mockSkuGenerator.next.mockResolvedValue('CAC0001');
      mockPrismaService.variant.create.mockResolvedValue({ id: 1, sku: 'CAC0001' });

      await service.createInventoryItem(
        { name: 'Cable USB-C', categoryId: 2, qty: 10, min: 2 } as any,
        mockUser,
      );

      expect(mockSkuGenerator.next).toHaveBeenCalledWith(mockUser.organizationId, 2, 'Cable USB-C');
      expect(mockPrismaService.product.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ categoryId: 2 }) }),
      );
    });

    it('respects a manually provided sku without calling the generator', async () => {
      mockPrismaService.product.create.mockResolvedValue({ id: 1, name: 'Cable USB-C', categoryId: 2 });
      mockPrismaService.variant.create.mockResolvedValue({ id: 1, sku: 'MANUAL-1' });

      await service.createInventoryItem(
        { name: 'Cable USB-C', categoryId: 2, sku: 'MANUAL-1', qty: 10, min: 2 } as any,
        mockUser,
      );

      expect(mockSkuGenerator.next).not.toHaveBeenCalled();
    });

    it('throws when there is no sku and no category', async () => {
      mockPrismaService.product.create.mockResolvedValue({ id: 1, name: 'Cable USB-C', categoryId: null });

      await expect(
        service.createInventoryItem({ name: 'Cable USB-C', qty: 10, min: 2 } as any, mockUser),
      ).rejects.toThrow('categoría');
    });
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm test -- stock.service`
Expected: FAIL — el servicio actual no llama a `SkuGeneratorService`.

- [ ] **Step 3: Agregar `categoryId` al DTO**

En `src/stock/dto/create-inventory-item.dto.ts`, agregar (después de `productId`, línea 13):

```ts
  @ApiProperty({ description: 'Category ID (used when creating a new product inline)', required: false })
  @IsOptional()
  @IsInt()
  categoryId?: number;
```

- [ ] **Step 4: Actualizar `StockService`**

Agregar el import y el constructor en `src/stock/stock.service.ts`:

```ts
import { SkuGeneratorService } from '../sku/sku-generator.service';
```

```ts
  constructor(
    private prisma: PrismaService,
    private skuGenerator: SkuGeneratorService,
  ) { }
```

Reemplazar el filtro `categoriaId` (línea 61-72):

```ts
    if (filters?.categoriaId) {
      where.variant = {
        ...(where.variant || {}),
        product: {
          ...(where.variant?.product || {}),
          categoryId: parseInt(filters.categoriaId, 10),
        },
      };
    }
```

Reemplazar el `select` del producto embebido en `getStock` (línea 133-141):

```ts
              product: {
                select: {
                  id: true,
                  name: true,
                  categoryId: true,
                  category: { select: { id: true, name: true } },
                  brand: true,
                  model: true,
                  isPriceEditable: true,
                  tracksInventory: true,
                },
              },
```

Reemplazar `createInventoryItem` completo (línea 292-390):

```ts
  async createInventoryItem(dto: CreateInventoryItemDto, user: AuthUser) {
    const branchId = dto.branchId ?? user.branchId;
    if (!branchId) {
      throw new BadRequestException('BranchId is required');
    }

    let product;
    if (dto.productId) {
      product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
      if (!product) {
        throw new BadRequestException('Product not found');
      }
      dto.name = dto.name || product.name;
    } else {
      try {
        product = await this.prisma.product.create({
          data: {
            name: dto.name!,
            brand: dto.brand,
            model: dto.model,
            categoryId: dto.categoryId,
            isPriceEditable: dto.isPriceEditable,
            tracksInventory: dto.tracksInventory,
          },
        });
      } catch (error: any) {
        throw new BadRequestException(`Failed to create product: ${error.message}`);
      }
    }

    let sku = dto.sku;
    if (!sku) {
      if (!product.categoryId) {
        throw new BadRequestException(
          'Selecciona una categoría antes de generar el SKU automáticamente',
        );
      }
      sku = await this.skuGenerator.next(user.organizationId, product.categoryId, product.name);
    }

    let variant;
    try {
      variant = await this.prisma.variant.create({
        data: {
          productId: product.id,
          sku,
          name: dto.name,
          price: dto.price,
          purchasePrice: dto.purchasePrice,
          barcode: dto.barcode,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002' && error.meta?.target?.includes('sku')) {
        throw new BadRequestException(`SKU "${sku}" already exists. Please use a different SKU.`);
      }
      throw new BadRequestException(`Failed to create variant: ${error.message}`);
    }

    const stock = await this.prisma.stock.create({
      data: {
        branchId,
        variantId: variant.id,
        qty: dto.qty,
        min: dto.min,
        max: dto.max ?? 1000,
      },
    });

    return {
      ...stock,
      variant: {
        ...variant,
        product,
      },
    };
  }
```

(Nota: se elimina el retry manual con `Date.now()` — ya no hace falta, `SkuGeneratorService.next` garantiza unicidad vía el consecutivo atómico por prefijo; el único caso de colisión posible ahora es un `sku` puesto a mano por el usuario, que sigue lanzando el `BadRequestException` de "ya existe".)

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `pnpm test -- stock.service`
Expected: PASS (todos, incluyendo los 3 nuevos de `createInventoryItem`).

- [ ] **Step 6: Wiring del módulo**

```ts
// src/stock/stock.module.ts
import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { SkuModule } from '../sku/sku.module';

@Module({
  imports: [SkuModule],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
```

- [ ] **Step 7: Agregar un test e2e de generación de SKU**

Agregar a `test/stock.e2e-spec.ts` (nuevo `describe`, antes del `});` final):

```ts
  describe('/stock/items (POST)', () => {
    let adminAccessToken: string;

    beforeEach(async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'direccion@acme-repair.com', password: 'ChangeMe123!' });
      adminAccessToken = loginResponse.body.access_token;
    });

    it('auto-generates a mask-based sku when none is provided', async () => {
      const categoriesResponse = await request(app.getHttpServer())
        .get('/catalog/categories')
        .set('Authorization', `Bearer ${adminAccessToken}`);
      const firstCategory = categoriesResponse.body[0];
      const categoryId = firstCategory.children?.[0]?.id ?? firstCategory.id;

      const response = await request(app.getHttpServer())
        .post('/stock/items')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Producto E2E Sku Test',
          categoryId,
          qty: 1,
          min: 0,
        })
        .expect(201);

      expect(response.body.variant.sku).toBeTruthy();
      expect(response.body.variant.sku).not.toMatch(/^SKU-\d+/);
    });
  });
```

Run: `pnpm test:e2e -- stock`
Expected: PASS (requiere la base de datos de test sembrada — `pnpm db:seed` si hace falta).

- [ ] **Step 8: Typecheck completo y commit**

Run: `pnpm typecheck`
Expected: PASS sin errores (ya no quedan referencias a `product.category` como string en ningún archivo de `src/`).

Run: `pnpm test`
Expected: PASS (suite completa).

```bash
git add src/stock test/stock.e2e-spec.ts
git commit -m "feat(stock): categoryId inline product creation, mask-based SKU, real category filter"
```

---

### Task 9: Migración fase 2 — eliminar `categoryLegacy`

**Files:**
- Modify: `prisma/schema.prisma` (quitar `categoryLegacy`)
- Create: `prisma/migrations/<timestamp>_drop_category_legacy/migration.sql` (generado)

**Interfaces:** ninguna (limpieza de schema, no afecta código de aplicación — nada en `src/` referencia `categoryLegacy` desde Task 2).

**Gate manual:** correr solo después de haber ejecutado el backfill (Task 2, Step 6) en el ambiente correspondiente y haber revisado que la lista de "sin match" es aceptable (vacía, o los productos listados ya se re-categorizaron a mano desde el frontend).

- [ ] **Step 1: Confirmar que el backfill está limpio**

Run (contra la base de datos del ambiente que se va a migrar):

```sql
SELECT id, category FROM products WHERE category IS NOT NULL AND "categoryId" IS NULL;
```

Expected: 0 filas, o una lista ya revisada y aceptada manualmente.

- [ ] **Step 2: Quitar `categoryLegacy` del schema**

En `prisma/schema.prisma`, quitar la línea `categoryLegacy String? @map("category")` del modelo `Product` (queda solo `categoryId`/`category` relación).

- [ ] **Step 3: Generar y correr la migración**

Run: `pnpm db:migrate:dev --name drop_category_legacy`
Expected: Prisma genera un `DROP COLUMN "category"` y confirma sync.

- [ ] **Step 4: Regenerar cliente, typecheck y tests**

Run: `pnpm db:generate && pnpm typecheck && pnpm test`
Expected: todo PASS (nada en `src/` referenciaba `categoryLegacy`).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "chore(db): drop legacy category string column after backfill"
```

---

### Task 10: `celhm-app-main` — tipos compartidos (`@celhm/types`) + mocks

**Files:**
- Modify: `packages/types/src/catalog.ts`
- Modify: `packages/types/src/stock.ts`
- Modify: `src/mocks/index.ts`

**Interfaces:**
- Produces: `Product.categoryId: number | null`, `Product.category: { id, name } | null` (y lo mismo embebido en `Variant.product` y `StockItem.variant.product`). Lo consumen todas las tareas de frontend siguientes.

- [ ] **Step 1: Actualizar `packages/types/src/catalog.ts`**

Reemplazar `ProductSchema` (línea 3-19):

```ts
export const ProductSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().optional(),
  categoryId: z.number().nullable().optional(),
  category: z.object({ id: z.number(), name: z.string() }).nullable().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  variants: z.array(z.any()).optional(),
  _count: z.object({
    variants: z.number(),
  }).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isPriceEditable: z.boolean().optional(),
  tracksInventory: z.boolean().optional(),
  isCommissionable: z.boolean().optional(),
})
```

Reemplazar el `product` embebido de `VariantSchema` (línea 34-40):

```ts
  product: z.object({
    id: z.number(),
    name: z.string(),
    categoryId: z.number().nullable().optional(),
    category: z.object({ id: z.number(), name: z.string() }).nullable().optional(),
    isPriceEditable: z.boolean().optional(),
    tracksInventory: z.boolean().optional(),
  }).optional(),
```

- [ ] **Step 2: Actualizar `packages/types/src/stock.ts`**

Reemplazar el `product` embebido de `StockItemSchema` (línea 19-27):

```ts
    product: z.object({
      id: z.number(),
      name: z.string(),
      categoryId: z.number().nullable().optional(),
      category: z.object({ id: z.number(), name: z.string() }).nullable().optional(),
      brand: z.string().optional(),
      model: z.string().optional(),
      isPriceEditable: z.boolean().optional(),
      tracksInventory: z.boolean().optional(),
    }),
```

Agregar `categoryId` a `CreateInventoryItemSchema` (después de `productId`, línea 37):

```ts
  categoryId: z.number().optional(),
```

- [ ] **Step 3: Actualizar los mocks**

En `src/mocks/index.ts`, línea 35:

```ts
    category: { id: 1, name: 'Pantallas' },
    categoryId: 1,
```

Línea 61:

```ts
    category: { id: 2, name: 'Baterías' },
    categoryId: 2,
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: FALLA en `useCatalog.ts`/`useStock.ts`/`catalog/page.tsx`/`inventory/page.tsx` (todavía usan `category` como string) — es esperado, se corrige en las tareas siguientes. Confirmar que `packages/types` en sí compila: `pnpm --filter @celhm/types typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/catalog.ts packages/types/src/stock.ts src/mocks/index.ts
git commit -m "feat(types): model categoryId/category relation instead of flat category string"
```

---

### Task 11: Hooks — `useCatalog`, `useStock`, `useOrganization`

**Files:**
- Modify: `src/lib/hooks/useCatalog.ts`
- Modify: `src/lib/hooks/useStock.ts`
- Modify: `src/lib/hooks/useOrganization.ts`
- Test: `src/lib/hooks/useCatalog.test.ts` (nuevo)
- Modify: `src/lib/hooks/useStock.test.ts`

**Interfaces:**
- Produces: `Product.categoryId: number | null` (frontend-mapped, además del `category: string` de display que ya existía), `InventoryItem.categoryId` ya no hardcodeado a `0`, `Organization.skuMaskConfig: SkuMaskSegment[]`, tipo `SkuMaskSegment` exportado desde `useOrganization.ts`.

- [ ] **Step 1: Escribir el test de `useCatalog` (fallando)**

```ts
// src/lib/hooks/useCatalog.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useProducts } from './useCatalog'
import { api } from '../api'

jest.mock('../api')
const mockApi = api as jest.Mocked<typeof api>

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => QueryClientProvider({ client: queryClient, children })
}

describe('useProducts', () => {
  beforeEach(() => jest.clearAllMocks())

  it('maps categoryId and category name from the relation', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        data: [
          {
            id: 1,
            name: 'Cable USB-C',
            categoryId: 2,
            category: { id: 2, name: 'Cables' },
            createdAt: '',
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    })

    const { result } = renderHook(() => useProducts(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.data[0].categoryId).toBe(2)
    expect(result.current.data?.data[0].category).toBe('Cables')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test -- useCatalog`
Expected: FAIL — `categoryId` es `undefined` (la mapeada actual no lo lee).

- [ ] **Step 3: Actualizar `useCatalog.ts`**

Reemplazar la interfaz `Product` (línea 6-18):

```ts
export interface Product {
  id: number
  name: string
  description: string
  category: string
  categoryId: number | null
  brand: string
  model: string
  createdAt: string
  variantsCount?: number
  isPriceEditable?: boolean
  tracksInventory?: boolean
  isCommissionable?: boolean
}
```

En el `queryFn` de `useProducts` (línea 53-65), reemplazar el mapeo:

```ts
        data: response.data.data.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description || '',
          category: p.category?.name || '',
          categoryId: p.categoryId ?? null,
          brand: p.brand || '',
          model: p.model || '',
          createdAt: p.createdAt,
          variantsCount: p._count?.variants || 0,
          isPriceEditable: p.isPriceEditable,
          tracksInventory: p.tracksInventory,
          isCommissionable: (p as any).isCommissionable,
        })),
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test -- useCatalog`
Expected: PASS.

- [ ] **Step 5: Escribir el test de `useStock` (extender `useStock.test.ts`)**

Agregar `product: { id: 9, name: 'Pantalla', categoryId: 3 }` al mock existente (línea 41-44 del archivo actual) y una nueva aserción:

```ts
    expect(result.current.data?.data[0].categoryId).toBe(3)
```

- [ ] **Step 6: Correr el test y verificar que falla**

Run: `pnpm test -- useStock`
Expected: FAIL — `categoryId` sigue hardcodeado a `0`.

- [ ] **Step 7: Corregir el TODO en `useStock.ts`**

Línea 42, reemplazar:

```ts
    categoryId: 0, // TODO: Get from product.category when available
```

por:

```ts
    categoryId: item.variant.product.categoryId ?? 0,
```

- [ ] **Step 8: Correr los tests y verificar que pasan**

Run: `pnpm test -- useStock`
Expected: PASS.

- [ ] **Step 9: Actualizar `useOrganization.ts`**

Agregar el tipo y extender la interfaz (después de `TicketLegend`, línea 9):

```ts
export type SkuMaskSegment =
  | { type: "literal"; value: string }
  | { type: "root" | "category" | "product"; length: number }
  | { type: "sequence"; digits: number }
```

En `Organization` (línea 11-26) y `UpdateOrganizationRequest` (línea 28-39), agregar junto a `ticketLegends`:

```ts
  skuMaskConfig: SkuMaskSegment[]
```
```ts
  skuMaskConfig?: SkuMaskSegment[]
```

En el `queryFn` de `useOrganization` (línea 44-63), agregar junto al mapeo de `ticketLegends`:

```ts
        skuMaskConfig: Array.isArray(data.skuMaskConfig) ? data.skuMaskConfig : [],
```

- [ ] **Step 10: Typecheck y commit**

Run: `pnpm typecheck` (los errores restantes deben ser solo de `catalog/page.tsx`/`inventory/page.tsx`/`settings/page.tsx`, corregidos en Tasks 12-14).

```bash
git add src/lib/hooks/useCatalog.ts src/lib/hooks/useCatalog.test.ts src/lib/hooks/useStock.ts src/lib/hooks/useStock.test.ts src/lib/hooks/useOrganization.ts
git commit -m "feat(hooks): expose categoryId/skuMaskConfig from the category relation"
```

---

### Task 12: Catálogo — selector de categoría por `categoryId`

**Files:**
- Modify: `src/app/dashboard/catalog/page.tsx`

**Interfaces:**
- Consumes: `Product.categoryId`, `Product.category` (string de display, sin cambio) de Task 11.

- [ ] **Step 1: Actualizar `NewProductForm` y su estado inicial**

Reemplazar la interfaz (línea 78-88) y el estado inicial (línea 104-114):

```ts
interface NewProductForm {
  name: string;
  description: string;
  parentCategoryId: string;
  categoryId: string;
  brand: string;
  model: string;
  isPriceEditable: boolean;
  tracksInventory: boolean;
  isCommissionable: boolean;
}
```

```ts
const newProductInitialState: NewProductForm = {
  name: "",
  description: "",
  parentCategoryId: "",
  categoryId: "",
  brand: "",
  model: "",
  isPriceEditable: false,
  tracksInventory: true,
  isCommissionable: false,
};
```

(`categoryId`/`parentCategoryId` guardan el id como string — mismo criterio que `filterCategory` en `inventory/page.tsx`, que ya usa `cat.id.toString()` en sus `<option>`.)

- [ ] **Step 2: Actualizar el `useEffect` de recálculo (línea 179-191)**

```ts
  useEffect(() => {
    if (!productToEdit || categories.length === 0 || !isProductModalOpen) return;
    const parentCat = categories.find((cat) =>
      cat.children?.some((sub) => sub.id === productToEdit.categoryId)
    );
    setNewProductData((prev) => ({
      ...prev,
      parentCategoryId: parentCat
        ? String(parentCat.id)
        : productToEdit.categoryId
          ? String(productToEdit.categoryId)
          : "",
      categoryId: productToEdit.categoryId ? String(productToEdit.categoryId) : "",
    }));
  }, [categories, productToEdit, isProductModalOpen]);
```

- [ ] **Step 3: Actualizar `openEditProductModal` (línea 196-214)**

```ts
  const openEditProductModal = (product: Product) => {
    setProductToEdit(product);
    const parentCat = categories.find((cat) =>
      cat.children?.some((sub) => sub.id === product.categoryId)
    );
    setNewProductData({
      name: product.name,
      description: product.description,
      parentCategoryId: parentCat
        ? String(parentCat.id)
        : product.categoryId
          ? String(product.categoryId)
          : "",
      categoryId: product.categoryId ? String(product.categoryId) : "",
      brand: product.brand,
      model: product.model,
      isPriceEditable: product.isPriceEditable || false,
      tracksInventory: product.tracksInventory ?? true,
      isCommissionable: product.isCommissionable || false,
    });
    setIsProductModalOpen(true);
  };
```

- [ ] **Step 4: Actualizar `handleSaveProduct` (línea 232-277)**

En ambos payloads (`updateProduct.mutateAsync` línea 234-246 y `createProduct.mutateAsync` línea 253-262), reemplazar la línea `category: newProductData.category || undefined,` por:

```ts
            categoryId: newProductData.categoryId ? parseInt(newProductData.categoryId, 10) : undefined,
```

- [ ] **Step 5: Actualizar los `<select>` de categoría (línea 717-772)**

```tsx
                <div>
                  <label className="block text-sm font-medium text-foreground">
                    Categoría (padre)
                  </label>
                  <select
                    name="parentCategoryId"
                    value={newProductData.parentCategoryId}
                    onChange={(e) => {
                      setNewProductData({
                        ...newProductData,
                        parentCategoryId: e.target.value,
                        categoryId: e.target.value,
                      });
                    }}
                    className="mt-1 block w-full border border-border rounded-md p-2"
                  >
                    <option value="">Selecciona una categoría</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground">
                    Subcategoría
                  </label>
                  {(() => {
                    const parent = categories.find(
                      (cat) => String(cat.id) === newProductData.parentCategoryId
                    );
                    const subs = parent?.children ?? [];
                    return (
                      <select
                        name="categoryId"
                        value={subs.length > 0 ? newProductData.categoryId : ""}
                        onChange={handleProductModalChange}
                        disabled={subs.length === 0}
                        className="mt-1 block w-full border border-border rounded-md p-2 disabled:opacity-50"
                      >
                        <option value="">
                          {subs.length === 0
                            ? "Sin subcategorías"
                            : "Selecciona una subcategoría"}
                        </option>
                        {subs.map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name}
                          </option>
                        ))}
                      </select>
                    );
                  })()}
                </div>
```

(`{product.category}` en la fila de la tabla, línea 541, y en el modal de detalle, línea 928, no cambian — siguen leyendo el string de display que ya viene mapeado en `useCatalog.ts`.)

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: sin errores nuevos en `catalog/page.tsx`.

- [ ] **Step 7: Verificación manual**

Run: `pnpm dev`, abrir `/dashboard/catalog`, crear un producto eligiendo categoría padre + subcategoría, guardar, y confirmar que al reabrir "Editar" quedan preseleccionadas correctamente.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/catalog/page.tsx
git commit -m "feat(catalog): select category by id instead of name string"
```

---

### Task 13: Settings — editor de la máscara de código

**Files:**
- Create: `src/lib/sku-mask.ts`
- Test: `src/lib/sku-mask.test.ts`
- Modify: `src/app/dashboard/settings/page.tsx`

**Interfaces:**
- Consumes: `Organization.skuMaskConfig`, `useUpdateOrganization`, tipo `SkuMaskSegment` de Task 11.
- Produces: `renderSkuMask(segments, ctx): string` (solo para la vista previa local, ilustrativa — no llama al backend).

- [ ] **Step 1: Escribir el test de la utilidad de preview**

```ts
// src/lib/sku-mask.test.ts
import { normalizeSkuToken, renderSkuMask } from './sku-mask'

describe('normalizeSkuToken', () => {
  it('uppercases and strips accents/symbols', () => {
    expect(normalizeSkuToken('Cables y Cargadores', 2)).toBe('CA')
  })

  it('does not pad when the source is shorter than length', () => {
    expect(normalizeSkuToken('A', 4)).toBe('A')
  })
})

describe('renderSkuMask', () => {
  it('matches the CAC0117 example from the mask mockup', () => {
    const result = renderSkuMask(
      [
        { type: 'category', length: 2 },
        { type: 'product', length: 1 },
        { type: 'sequence', digits: 4 },
      ],
      { root: 'Accesorios', category: 'Cables', product: 'Cable USB-C', seq: 117 },
    )
    expect(result).toBe('CAC0117')
  })

  it('includes literal segments verbatim', () => {
    const result = renderSkuMask(
      [
        { type: 'literal', value: '-' },
        { type: 'category', length: 2 },
        { type: 'sequence', digits: 2 },
      ],
      { root: '', category: 'Cables', product: '', seq: 3 },
    )
    expect(result).toBe('-CA03')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test -- sku-mask`
Expected: FAIL — `Cannot find module './sku-mask'`.

- [ ] **Step 3: Implementar**

```ts
// src/lib/sku-mask.ts
export type SkuMaskSegment =
  | { type: "literal"; value: string }
  | { type: "root" | "category" | "product"; length: number }
  | { type: "sequence"; digits: number }

export interface SkuMaskContext {
  root: string
  category: string
  product: string
  seq: number
}

export function normalizeSkuToken(text: string, length: number): string {
  const cleaned = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
  return cleaned.slice(0, length)
}

export function renderSkuMask(segments: SkuMaskSegment[], ctx: SkuMaskContext): string {
  let prefix = ""
  let sequencePart = ""

  for (const segment of segments) {
    switch (segment.type) {
      case "literal":
        prefix += segment.value
        break
      case "root":
        prefix += normalizeSkuToken(ctx.root, segment.length)
        break
      case "category":
        prefix += normalizeSkuToken(ctx.category, segment.length)
        break
      case "product":
        prefix += normalizeSkuToken(ctx.product, segment.length)
        break
      case "sequence":
        sequencePart = String(ctx.seq).padStart(segment.digits, "0")
        break
    }
  }

  return prefix + sequencePart
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test -- sku-mask`
Expected: PASS (4 tests).

- [ ] **Step 5: Agregar el estado y los handlers en `settings/page.tsx`**

Agregar el import (junto a los de `useOrganization`, línea 5-9):

```ts
import { SkuMaskSegment } from "../../../lib/hooks/useOrganization";
import { renderSkuMask } from "../../../lib/sku-mask";
```

Agregar el estado (junto a `ticketLegends`, línea 50-51):

```ts
  const [skuMaskConfig, setSkuMaskConfig] = useState<SkuMaskSegment[]>([]);
  const [savedSkuMaskConfig, setSavedSkuMaskConfig] = useState<SkuMaskSegment[]>([]);
```

En el `useEffect` que sincroniza desde `organization` (línea 53-71), agregar:

```ts
      setSkuMaskConfig(organization.skuMaskConfig);
      setSavedSkuMaskConfig(organization.skuMaskConfig);
```

Agregar los helpers y handlers (después de `updateTicketLegend`, línea 120):

```ts
  const SKU_MASK_SLOTS = 4;

  const padSkuMaskConfig = (segments: SkuMaskSegment[]): SkuMaskSegment[] => {
    const padded = [...segments];
    while (padded.length < SKU_MASK_SLOTS) {
      padded.push({ type: "literal", value: "" });
    }
    return padded.slice(0, SKU_MASK_SLOTS);
  };

  const updateSkuMaskSlot = (index: number, segment: SkuMaskSegment) => {
    setSkuMaskConfig((prev) => {
      const next = padSkuMaskConfig(prev);
      next[index] = segment;
      return next;
    });
  };

  const handleSkuMaskTypeChange = (index: number, type: SkuMaskSegment["type"]) => {
    if (type === "literal") updateSkuMaskSlot(index, { type: "literal", value: "" });
    else if (type === "sequence") updateSkuMaskSlot(index, { type: "sequence", digits: 4 });
    else updateSkuMaskSlot(index, { type, length: 2 });
  };

  const hasSkuMaskChanges =
    JSON.stringify(padSkuMaskConfig(skuMaskConfig)) !== JSON.stringify(padSkuMaskConfig(savedSkuMaskConfig));

  const handleSkuMaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cleaned = padSkuMaskConfig(skuMaskConfig);
      await updateOrganization.mutateAsync({ skuMaskConfig: cleaned });
      setSkuMaskConfig(cleaned);
      setSavedSkuMaskConfig(cleaned);
      toast({
        variant: "success",
        title: "Máscara de código guardada",
        description: "La configuración del generador de SKU se actualizó correctamente.",
      });
    } catch (error) {
      console.error("Error actualizando la máscara de SKU:", error);
      toast({
        variant: "destructive",
        title: "Error al guardar",
        description: "Hubo un error al actualizar la máscara de código.",
      });
    }
  };

  const skuMaskPreview = renderSkuMask(padSkuMaskConfig(skuMaskConfig), {
    root: "Accesorios",
    category: "Cables",
    product: "Cable USB-C",
    seq: 1,
  });
```

- [ ] **Step 6: Agregar la sección al JSX**

Insertar antes de la sección "Acerca de la Configuración de la Empresa" (línea 564):

```tsx
      {/* Sección de Configuración de la máscara de código (SKU) */}
      <form
        onSubmit={handleSkuMaskSubmit}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6"
      >
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Configuración de la máscara de código
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Define cómo se arma automáticamente el código (SKU) al crear un
            producto: cada segmento puede ser texto fijo, caracteres de la
            categoría raíz (R), la categoría (C), el nombre del producto (P),
            o un consecutivo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {padSkuMaskConfig(skuMaskConfig).map((segment, index) => (
            <div
              key={index}
              className="border border-gray-200 dark:border-gray-700 rounded-md p-3 space-y-2"
            >
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Segmento {index + 1}
              </label>
              <select
                value={segment.type}
                onChange={(e) =>
                  handleSkuMaskTypeChange(index, e.target.value as SkuMaskSegment["type"])
                }
                className="w-full px-2 py-1.5 border rounded-md bg-white dark:bg-gray-700 text-sm border-gray-300 dark:border-gray-600"
              >
                <option value="literal">Texto fijo</option>
                <option value="root">Raíz de categoría (R)</option>
                <option value="category">Categoría (C)</option>
                <option value="product">Nombre de producto (P)</option>
                <option value="sequence">Consecutivo (#)</option>
              </select>

              {segment.type === "literal" && (
                <input
                  type="text"
                  value={segment.value}
                  maxLength={5}
                  onChange={(e) =>
                    updateSkuMaskSlot(index, { type: "literal", value: e.target.value })
                  }
                  placeholder="ej. -"
                  className="w-full px-2 py-1.5 border rounded-md bg-white dark:bg-gray-700 text-sm border-gray-300 dark:border-gray-600"
                />
              )}

              {(segment.type === "root" ||
                segment.type === "category" ||
                segment.type === "product") && (
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={segment.length}
                  onChange={(e) =>
                    updateSkuMaskSlot(index, {
                      type: segment.type,
                      length: Number(e.target.value) || 1,
                    })
                  }
                  className="w-full px-2 py-1.5 border rounded-md bg-white dark:bg-gray-700 text-sm border-gray-300 dark:border-gray-600"
                />
              )}

              {segment.type === "sequence" && (
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={segment.digits}
                  onChange={(e) =>
                    updateSkuMaskSlot(index, {
                      type: "sequence",
                      digits: Number(e.target.value) || 1,
                    })
                  }
                  className="w-full px-2 py-1.5 border rounded-md bg-white dark:bg-gray-700 text-sm border-gray-300 dark:border-gray-600"
                />
              )}
            </div>
          ))}
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/40 rounded-md p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Vista previa (categoría &quot;Accesorios / Cables&quot;, producto &quot;Cable USB-C&quot;):
          </p>
          <p className="text-lg font-mono font-semibold text-gray-900 dark:text-white">
            {skuMaskPreview || "—"}
          </p>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm">
            {hasSkuMaskChanges ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                Hay cambios sin guardar
              </span>
            ) : (
              <span className="text-green-600 dark:text-green-400 font-medium">
                Todos los cambios guardados
              </span>
            )}
          </p>
          <button
            type="submit"
            disabled={updateOrganization.isPending || !hasSkuMaskChanges}
            className={`inline-flex items-center px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              hasSkuMaskChanges
                ? "bg-blue-600 hover:bg-blue-700 text-white active:bg-blue-800"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            {updateOrganization.isPending ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      </form>
```

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: sin errores nuevos en `settings/page.tsx`.

- [ ] **Step 8: Verificación manual**

Run: `pnpm dev`, abrir `/dashboard/settings`, cambiar los 4 segmentos (probar un texto fijo, cambiar longitudes, cambiar dígitos del consecutivo), confirmar que la vista previa se actualiza en vivo, guardar, recargar la página y confirmar que la configuración persiste.

- [ ] **Step 9: Commit**

```bash
git add src/lib/sku-mask.ts src/lib/sku-mask.test.ts src/app/dashboard/settings/page.tsx
git commit -m "feat(settings): add sku mask configuration editor with live preview"
```

---

### Task 14: Inventario — categoría en alta inline, preview de SKU, fix de CSV

**Files:**
- Create: `src/lib/hooks/useDebounce.ts`
- Create: `src/lib/hooks/useSku.ts`
- Test: `src/lib/hooks/useSku.test.ts`
- Modify: `src/app/dashboard/inventory/page.tsx`

**Interfaces:**
- Consumes: `CreateInventoryItemRequest.categoryId` de Task 10.
- Produces: `useDebounce<T>(value, delay): T`, `useSkuPreview(categoryId, productName): UseQueryResult<{ sku: string }>`.

- [ ] **Step 1: Crear `useDebounce`**

```ts
// src/lib/hooks/useDebounce.ts
import { useState, useEffect } from "react"

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}
```

- [ ] **Step 2: Escribir el test de `useSkuPreview` (fallando)**

```ts
// src/lib/hooks/useSku.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSkuPreview } from './useSku'
import { api } from '../api'

jest.mock('../api')
const mockApi = api as jest.Mocked<typeof api>

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => QueryClientProvider({ client: queryClient, children })
}

describe('useSkuPreview', () => {
  beforeEach(() => jest.clearAllMocks())

  it('fetches the preview when categoryId and name are present', async () => {
    mockApi.get.mockResolvedValue({ data: { sku: 'CAC0001' } })

    const { result } = renderHook(() => useSkuPreview(2, 'Cable USB-C'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.sku).toBe('CAC0001')
    expect(mockApi.get).toHaveBeenCalledWith(
      expect.stringContaining('/catalog/sku/preview?categoryId=2&name=Cable%20USB-C'),
    )
  })

  it('does not fetch when categoryId is missing', () => {
    renderHook(() => useSkuPreview(undefined, 'Cable USB-C'), { wrapper: createWrapper() })

    expect(mockApi.get).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `pnpm test -- useSku`
Expected: FAIL — `Cannot find module './useSku'`.

- [ ] **Step 4: Implementar `useSkuPreview`**

```ts
// src/lib/hooks/useSku.ts
import { useQuery } from "@tanstack/react-query"
import { api } from "../api"

export function useSkuPreview(categoryId: number | null | undefined, productName: string) {
  const enabled = Boolean(categoryId) && productName.trim().length > 0

  return useQuery<{ sku: string }>({
    queryKey: ["catalog", "sku-preview", categoryId, productName],
    queryFn: async () => {
      const response = await api.get<{ sku: string }>(
        `/catalog/sku/preview?categoryId=${categoryId}&name=${encodeURIComponent(productName)}`,
      )
      return response.data
    },
    enabled,
    retry: false,
    staleTime: 0,
  })
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `pnpm test -- useSku`
Expected: PASS (2 tests).

- [ ] **Step 6: Agregar `categoryId` al formulario de alta**

En `src/app/dashboard/inventory/page.tsx`, agregar el campo a `NewProductForm` (línea 32-44) y a `newProductInitialState` (línea 46-57):

```ts
  categoryId: string;
```
```ts
  categoryId: "",
```

Quitar el estado `selectedCategory`/`setSelectedCategory` (línea 125) — ya no se usa, pasa a vivir en `newProduct.categoryId`. Quitar también `setSelectedCategory("")` de `closeModal` (línea 256-261).

- [ ] **Step 7: Reescribir `renderCategorySelectors` (línea 263-298) para usar id**

```tsx
  const renderCategorySelectors = () => {
    return (
      <div>
        <label className="block text-sm font-medium text-foreground">
          Categoría
        </label>
        <select
          value={newProduct.categoryId}
          onChange={(e) => setNewProduct({ ...newProduct, categoryId: e.target.value })}
          className="mt-1 block w-full border border-border rounded-md p-2"
        >
          <option value="">Selecciona una categoría</option>
          {categories.map((cat) => {
            const subs = cat.children ?? [];
            if (subs.length > 0) {
              return (
                <optgroup key={cat.id} label={cat.name}>
                  <option value={cat.id}>{cat.name} (general)</option>
                  {subs.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
                </optgroup>
              );
            }
            return (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            );
          })}
        </select>
      </div>
    );
  };
```

- [ ] **Step 8: Incluir `categoryId` en el payload de creación (línea 348-371)**

En `createItem.mutateAsync`, agregar:

```ts
          categoryId: newProduct.categoryId ? parseInt(newProduct.categoryId, 10) : undefined,
```

- [ ] **Step 9: Integrar el preview de SKU**

Agregar los imports:

```ts
import { useDebounce } from "../../../lib/hooks/useDebounce";
import { useSkuPreview } from "../../../lib/hooks/useSku";
```

Agregar el estado y el hook (junto a los demás estados del componente):

```ts
  const [skuTouched, setSkuTouched] = useState(false);
  const debouncedProductName = useDebounce(newProduct.name, 400);
  const previewCategoryId = newProduct.categoryId ? parseInt(newProduct.categoryId, 10) : undefined;
  const { data: skuPreview } = useSkuPreview(previewCategoryId, debouncedProductName);

  useEffect(() => {
    if (!skuTouched && skuPreview?.sku && createMode === "new" && !itemToEdit) {
      setNewProduct((prev) => ({ ...prev, sku: skuPreview.sku }));
    }
  }, [skuPreview, skuTouched, createMode, itemToEdit]);
```

En `closeModal` (línea 256-261), agregar `setSkuTouched(false);`.

Actualizar el input de SKU (línea 1323-1335):

```tsx
                <div>
                  <label className="block text-sm font-medium text-foreground">
                    SKU
                  </label>
                  <input
                    type="text"
                    value={newProduct.sku}
                    onChange={(e) => {
                      setSkuTouched(true);
                      setNewProduct({ ...newProduct, sku: e.target.value });
                    }}
                    className="mt-1 block w-full border border-border rounded-md p-2"
                  />
                </div>
```

- [ ] **Step 10: Arreglar la importación CSV (línea 601-648)**

Reemplazar la construcción del item (línea 610-627):

```ts
          const qty = parseInt(obj.qty) || 0;
          const min = parseInt(obj.min) || 0;
          const newItem: InventoryItem = {
            id: ++maxId,
            variantId: maxId,
            sku: obj.sku || "",
            name: obj.name,
            brand: obj.brand,
            model: obj.model,
            qty: qty,
            min: min,
            max: parseInt(obj.max) || 100,
            reserved: parseInt(obj.reserved) || 0,
            price: parseFloat(obj.price) || 0,
            status: qty <= min ? (qty <= 0 ? "critical" : "low") : "normal",
            categoryId: parseInt(obj.categoryId) || 0,
          };
          if (newItem.name && newItem.categoryId) newItems.push(newItem);
```

Reemplazar la llamada de creación (línea 632-644):

```ts
        for (const item of newItems) {
          try {
            await createItem.mutateAsync({
              name: item.name,
              brand: item.brand,
              model: item.model,
              sku: item.sku || undefined,
              categoryId: item.categoryId,
              price: item.price,
              qty: item.qty,
              min: item.min,
              max: item.max,
            });
            successCount++;
          } catch (err) {
            console.error("Error creating item:", err);
          }
        }
```

- [ ] **Step 11: Typecheck**

Run: `pnpm typecheck`
Expected: PASS sin errores (última tarea de la lista — ya no debe quedar ninguna referencia rota).

Run: `pnpm test`
Expected: PASS (suite completa del frontend).

- [ ] **Step 12: Verificación manual**

Run: `pnpm dev`, abrir `/dashboard/inventory`:
- "Agregar producto" (modo nuevo): elegir categoría, escribir un nombre, confirmar que el campo SKU se autocompleta tras ~400ms con el código esperado (ej. `CAC0001`), editarlo a mano y confirmar que ya no se sobreescribe.
- Importar un CSV sin columna `sku` con filas que sí tengan `categoryId`: confirmar que cada fila creada recibe un SKU generado por el backend (no `SKU-<timestamp>`).

- [ ] **Step 13: Commit**

```bash
git add src/lib/hooks/useDebounce.ts src/lib/hooks/useSku.ts src/lib/hooks/useSku.test.ts src/app/dashboard/inventory/page.tsx
git commit -m "feat(inventory): category selector, debounced sku preview, fix csv import"
```
