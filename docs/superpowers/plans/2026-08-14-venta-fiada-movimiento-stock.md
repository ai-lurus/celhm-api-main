# Venta fiada: mover stock siempre al crear + corregir estado de pago parcial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `SalesService.create()` so stock moves for every sale line at creation time regardless of payment status, and so a sale's status correctly reflects a partial payment instead of always being marked `PAGADO`.

**Architecture:** Two isolated edits to `src/sales/sales.service.ts::create()`. Fix 1 hoists the existing stock-movement transaction out of the payment-conditional block so it always runs. Fix 2 replaces an unconditional `status: PAGADO` write with a computed status (mirroring the logic `addPayment()` already uses) and gates commission generation / customer-purchase registration on that computed status. No schema changes, no new files.

**Tech Stack:** NestJS 10, Prisma 5.7, Jest (unit tests), pnpm.

## Global Constraints

- No `console.log` — use the existing `Logger` (already used in this file).
- Explicit return types stay as they are on the touched method (no signature change).
- Don't touch `cancelSale()` or `createReturn()` — the spec confirmed both already assume the fixed behavior and need no changes.
- Don't change the `Ticket.advancePayment` increment condition (`totalEfectivoAmount > 0`) — it's intentionally independent of the sale's paid status.

---

## Task 1: Move stock decrement out of the payment-conditional block

**Files:**
- Modify: `src/sales/sales.service.ts` (method `create()`, currently lines 22-203)
- Test: `src/sales/sales.service.spec.ts`

**Interfaces:**
- Consumes: `MovementType` enum from `@prisma/client` (already imported in `sales.service.ts` line 9 as `import { PaymentMethod, SaleStatus, MovementType } from '@prisma/client';`).
- Produces: no new exported symbols. Behavior change only — `SalesService.create()` now always creates a `Movement` (`type: VTA`) and decrements `Stock` for every line with `variantId` and `tracksInventory !== false`, independent of `createSaleDto.payments`.

- [ ] **Step 1: Write the failing test**

In `src/sales/sales.service.spec.ts`, add `MovementType` to the existing `@prisma/client` import (line 9):

```ts
import { Role, SaleStatus, MovementType } from '@prisma/client';
```

Then add this test inside `describe('create', ...)` (after the three existing tests, before the closing `});` of that `describe` block):

```ts
    it('creates a stock movement and decrements stock for a fiado sale (no payments)', async () => {
      mockPrismaService.sale.create.mockResolvedValueOnce({
        id: 999,
        total: 100,
        lines: [
          {
            id: 1,
            variantId: 55,
            qty: 2,
            variant: { product: { tracksInventory: true } },
          },
        ],
      });

      await service.create(
        {
          branchId: 1,
          cashRegisterId: 1,
          lines: [{ variantId: 55, description: 'Producto', qty: 2, unitPrice: 50, discount: 0 }],
        } as any,
        mockUser,
      );

      expect(mockPrismaService.movement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          branchId: 1,
          variantId: 55,
          type: MovementType.VTA,
          qty: 2,
        }),
      });
      expect(mockPrismaService.stock.updateMany).toHaveBeenCalledWith({
        where: { branchId: 1, variantId: 55 },
        data: { qty: { decrement: 2 } },
      });
      expect(mockPrismaService.sale.update).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/sales/sales.service.spec.ts -t "creates a stock movement and decrements stock for a fiado sale"`
Expected: FAIL — `movement.create` / `stock.updateMany` were never called, because today the stock loop only runs inside `if (createSaleDto.payments && createSaleDto.payments.length > 0)`, and this DTO has no `payments`.

- [ ] **Step 3: Implement — hoist the stock-movement loop**

In `src/sales/sales.service.ts`, find this text (currently around lines 110-115):

```ts
    });

    // If payments are provided, process them
    if (createSaleDto.payments && createSaleDto.payments.length > 0) {
```

Replace it with:

```ts
    });

    // Create stock movements and update stock for every line with a variant,
    // regardless of payment status — the item leaves inventory when the sale
    // is created, not when it's paid.
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
            where: {
              branchId: createSaleDto.branchId,
              variantId: line.variantId,
            },
            data: {
              qty: { decrement: line.qty },
            },
          }),
        ]);
      }
    }

    // If payments are provided, process them
    if (createSaleDto.payments && createSaleDto.payments.length > 0) {
```

Then remove the now-duplicate original loop further down (currently around lines 165-199 in the un-modified file — it sits right before the closing `}` of the `if (createSaleDto.payments...)` block and right after the `commissionsService.generateForSale` try/catch). Find this text:

```ts
      // If variant is provided, create stock movements and update stock
      for (const line of createSaleDto.lines) {
        if (line.variantId) {
          const variant = await this.prisma.variant.findUnique({
            where: { id: line.variantId },
            include: { product: true },
          });

          if (variant?.product?.tracksInventory !== false) {
            // Use batch transaction for movement and stock update
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
                where: {
                  branchId: createSaleDto.branchId,
                  variantId: line.variantId,
                },
                data: {
                  qty: { decrement: line.qty },
                },
              }),
            ]);
          }
        }
      }
    }

    return this.findOne(sale.id, user.organizationId);
```

Replace it with:

```ts
    }

    return this.findOne(sale.id, user.organizationId);
```

(This deletes the old inner loop but keeps the `if (createSaleDto.payments...)` block's closing brace and the final `return`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/sales/sales.service.spec.ts`
Expected: PASS — all tests in the file, including the new one and the three pre-existing `describe('create', ...)` tests (their default mock has `lines: []`, so the new unconditional loop is a no-op for them; nothing else changed yet).

- [ ] **Step 5: Commit**

```bash
git add src/sales/sales.service.ts src/sales/sales.service.spec.ts
git commit -m "fix: move sale stock decrement to run regardless of payment status"
```

---

## Task 2: Compute sale status from amount paid instead of always marking PAGADO

**Files:**
- Modify: `src/sales/sales.service.ts` (method `create()`, inside the `if (createSaleDto.payments...)` block left by Task 1)
- Test: `src/sales/sales.service.spec.ts`

**Interfaces:**
- Consumes: `SaleStatus.PAGADO` / `SaleStatus.PENDIENTE` from `@prisma/client` (already imported). `sale.total` (Decimal) from the `Sale` record returned by `this.prisma.sale.create(...)` in this same method.
- Produces: no new exported symbols. `SalesService.create()` now sets `Sale.status` to `PAGADO` only when the sum of the provided payments covers `sale.total`; otherwise it stays `PENDIENTE`. `customersService.registerPurchase` and `commissionsService.generateForSale` are now only invoked when that computed status is `PAGADO`.

- [ ] **Step 1: Write the failing test(s) and fix shared test fixtures**

In `src/sales/sales.service.spec.ts`, the shared `beforeEach` mocks `sale.create` with no `total` field (line 92: `mockPrismaService.sale.create.mockResolvedValue({ id: 999, lines: [] });`). Task 2's implementation compares `totalPaymentAmount` against `Number(sale.total)`, so this default needs a `total` to keep the existing full-payment tests meaningful. Update it to:

```ts
    mockPrismaService.sale.create.mockResolvedValue({ id: 999, lines: [], total: 100 });
```

Then add these two tests inside `describe('create', ...)`, after the test added in Task 1:

```ts
    it('leaves the sale PENDIENTE and skips commissions/purchase registration on a partial payment', async () => {
      await service.create(
        { ...baseDto, customerId: 7, payments: [{ amount: 40, method: 'EFECTIVO' as any }] } as any,
        mockUser,
      );

      expect(mockPrismaService.sale.update).toHaveBeenCalledWith({
        where: { id: 999 },
        data: { status: SaleStatus.PENDIENTE },
      });
      expect(mockCustomersService.registerPurchase).not.toHaveBeenCalled();
      expect(mockCommissionsService.generateForSale).not.toHaveBeenCalled();
    });

    it('marks the sale PAGADO and generates commissions once the payment covers the total', async () => {
      await service.create(
        { ...baseDto, customerId: 7, payments: [{ amount: 100, method: 'EFECTIVO' as any }] } as any,
        mockUser,
      );

      expect(mockPrismaService.sale.update).toHaveBeenCalledWith({
        where: { id: 999 },
        data: { status: SaleStatus.PAGADO },
      });
      expect(mockCustomersService.registerPurchase).toHaveBeenCalledWith(7);
      expect(mockCommissionsService.generateForSale).toHaveBeenCalledWith(999);
    });
```

- [ ] **Step 2: Run the tests to verify the partial-payment test fails**

Run: `pnpm test -- src/sales/sales.service.spec.ts -t "leaves the sale PENDIENTE"`
Expected: FAIL — today `create()` unconditionally sets `status: SaleStatus.PAGADO` whenever any payment is provided (regardless of amount) and unconditionally calls `registerPurchase`/`generateForSale` in that same branch, so a 40-against-100 payment still ends up `PAGADO` with both side effects fired.

- [ ] **Step 3: Implement — compute status from amount paid, gate side effects**

In `src/sales/sales.service.ts`, inside the `if (createSaleDto.payments...)` block (left in place by Task 1), find this text:

```ts
      // Mark as paid (either real payment or covered by advance)
      await this.prisma.sale.update({
        where: { id: sale.id },
        data: { status: SaleStatus.PAGADO },
      });

      // Registered customers (not "Mostrador") count this paid sale towards
      // frequent-buyer promotion, applied for their next sale onward.
      if (createSaleDto.customerId) {
        try {
          await this.customersService.registerPurchase(createSaleDto.customerId);
        } catch (error) {
          this.logger.error(`Error registering purchase for customer ${createSaleDto.customerId}:`, error);
        }
      }

      // If sale is for a ticket, update ticket advance payment
      if (createSaleDto.ticketId && totalEfectivoAmount > 0) {
        await this.prisma.ticket.update({
          where: { id: createSaleDto.ticketId },
          data: {
            advancePayment: {
              increment: totalEfectivoAmount,
            },
          },
        });
      }

      // Generate commissions for this sale (rule engine resolves per line)
      try {
        await this.commissionsService.generateForSale(sale.id);
      } catch (error) {
        this.logger.error(`Error generating commissions for sale ${sale.id}:`, error);
      }
    }
```

Replace it with:

```ts
      // Only mark the sale as paid once the amount received covers the total
      const newStatus = totalPaymentAmount >= Number(sale.total) ? SaleStatus.PAGADO : SaleStatus.PENDIENTE;
      await this.prisma.sale.update({
        where: { id: sale.id },
        data: { status: newStatus },
      });

      if (newStatus === SaleStatus.PAGADO) {
        // Registered customers (not "Mostrador") count this paid sale towards
        // frequent-buyer promotion, applied for their next sale onward.
        if (createSaleDto.customerId) {
          try {
            await this.customersService.registerPurchase(createSaleDto.customerId);
          } catch (error) {
            this.logger.error(`Error registering purchase for customer ${createSaleDto.customerId}:`, error);
          }
        }

        // Generate commissions for this sale (rule engine resolves per line)
        try {
          await this.commissionsService.generateForSale(sale.id);
        } catch (error) {
          this.logger.error(`Error generating commissions for sale ${sale.id}:`, error);
        }
      }

      // If sale is for a ticket, update ticket advance payment
      if (createSaleDto.ticketId && totalEfectivoAmount > 0) {
        await this.prisma.ticket.update({
          where: { id: createSaleDto.ticketId },
          data: {
            advancePayment: {
              increment: totalEfectivoAmount,
            },
          },
        });
      }
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- src/sales/sales.service.spec.ts`
Expected: PASS — all tests in the file, including both new Task 2 tests and the pre-existing `describe('create', ...)` / `describe('addPayment', ...)` / `describe('createReturn', ...)` tests (unaffected, since `addPayment` and `createReturn` weren't touched, and the updated default mock's `total: 100` matches the full-payment amount those pre-existing tests already use).

- [ ] **Step 5: Commit**

```bash
git add src/sales/sales.service.ts src/sales/sales.service.spec.ts
git commit -m "fix: only mark a sale PAGADO once payments cover its total"
```

---

## Task 3: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `pnpm test`
Expected: all suites pass, no failures introduced outside `sales.service.spec.ts`.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: no new lint errors in `src/sales/sales.service.ts` or `src/sales/sales.service.spec.ts`.

- [ ] **Step 3: Manual verification against a real branch/variant**

With `pnpm dev` running against a dev database with a known `variant`/`Stock.qty`:

1. Create a sale with one line referencing that `variantId` and **no `payments`** (fiado). Confirm via `pnpm db:studio` (or the stock endpoint) that `Stock.qty` decreased by the line's `qty` and a `Movement` with `type: VTA` exists for that `variantId`.
2. Cancel that sale (`cancelSale` endpoint). Confirm `Stock.qty` returns to its original value (one `DEV` movement exactly offsetting the earlier `VTA`, not a net increase).
3. Create another sale on the same variant with a **partial** payment (amount less than the line total). Confirm the sale's `status` is `PENDIENTE` and `Stock.qty` already decreased at creation. Complete the payment via the add-payment endpoint and confirm `status` becomes `PAGADO` without any further stock movement.

- [ ] **Step 4: Commit (only if Step 3 surfaced fixes)**

If manual verification requires no code changes, skip this step — Task 1 and Task 2 commits already cover the change.
