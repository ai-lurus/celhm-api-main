# Admin de Planes de Comisión en el FE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the missing admin UI for the commission rule engine (plans, rules, overrides, preview, plan assignment) in `celhm-app-main`, adding the two small backend endpoints in `celhm-api-main` it depends on.

**Architecture:** Two repos. `celhm-api-main` gets two new read endpoints on the existing `CommissionPlansController`/`CommissionPlansService` (no schema changes). `celhm-app-main` gets one new data hook file (`useCommissionPlans.ts`) plus a set of small, single-purpose components under `src/app/dashboard/commissions/_components/`, wired into the existing `/dashboard/commissions` page as a new tab, plus a small addition to the existing user-edit modal in `/dashboard/users`.

**Tech Stack:** NestJS 10 + Prisma 5 + Jest (backend); Next.js 15 (App Router) + TanStack Query 5 + Tailwind + Jest/RTL (frontend). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-14-comisiones-admin-frontend-design.md`

## Global Constraints

- Backend: NestJS Services hold business logic, Controllers only map HTTP; explicit return types; no `console.log` (use Logger); no raw SQL.
- Backend: every admin route in `CommissionPlansController` stays behind `@Roles(Role.ADMINISTRADOR)` (class-level decorator already applied — do not add a conflicting route-level decorator).
- Frontend: functional components + hooks only; no `any` in new code (except where an existing pattern already uses `error: any` in catch blocks, which is this codebase's convention); Tailwind utility classes only; forms use local `useState`, not React Hook Form (matches `CustomerGroupsPage`, the established pattern for this admin-CRUD style — do not introduce RHF/Zod here).
- Frontend: all new hooks live in `src/lib/hooks/`, all new commission-admin components live in `src/app/dashboard/commissions/_components/`.
- Do not modify the commission calculation/generation logic, the existing `/dashboard/commissions` listing/pay flow, or the Prisma schema. Out of scope per spec.

---

## Task 1: Backend — list overrides for a membership

**Files:**
- Modify: `src/commissions/commission-plans.service.ts`
- Modify: `src/commissions/commission-plans.controller.ts`
- Test: `src/commissions/commission-plans.service.spec.ts`

**Interfaces:**
- Produces: `CommissionPlansService.listOverrides(membershipId: number, organizationId: number): Promise<CommissionRule[]>` (Prisma model type, not transformed)
- Produces: `GET /commissions/rules/overrides?membershipId=<int>` → `CommissionRule[]`, 404 if the membership doesn't belong to the caller's org (same body shape as the existing `NotFoundException('Empleado no encontrado en tu organización')` used in `createOverride`)

- [ ] **Step 1: Write the failing test**

Add to `src/commissions/commission-plans.service.spec.ts`, inside the first `describe('CommissionPlansService', ...)` block (it already has `orgMembership` absent from `mockPrisma` — add it):

```ts
  const mockPrisma = {
    commissionPlan: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    commissionRule: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    orgMembership: { findFirst: jest.fn() },
  };
```

(This replaces the existing `mockPrisma` declaration at the top of the `describe('CommissionPlansService', ...)` block — it only adds `findMany` to `commissionRule` and adds the `orgMembership` key.)

Then add these two tests at the end of the same `describe` block, before its closing `});`:

```ts
  it('lists override rules for a membership in the caller org', async () => {
    mockPrisma.orgMembership.findFirst.mockResolvedValue({ id: 9, organizationId: 1 });
    mockPrisma.commissionRule.findMany.mockResolvedValue([{ id: 1, membershipId: 9 }]);

    const result = await service.listOverrides(9, 1);

    expect(mockPrisma.orgMembership.findFirst).toHaveBeenCalledWith({ where: { id: 9, organizationId: 1 } });
    expect(mockPrisma.commissionRule.findMany).toHaveBeenCalledWith({
      where: { membershipId: 9 },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual([{ id: 1, membershipId: 9 }]);
  });

  it('throws NotFoundException when listing overrides for a membership outside the org', async () => {
    mockPrisma.orgMembership.findFirst.mockResolvedValue(null);
    await expect(service.listOverrides(9, 1)).rejects.toThrow(NotFoundException);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- commission-plans.service.spec.ts`
Expected: FAIL — `service.listOverrides is not a function`

- [ ] **Step 3: Implement `listOverrides` in the service**

In `src/commissions/commission-plans.service.ts`, add this method right after `createOverride` (after its closing `}` around line 73):

```ts
  async listOverrides(membershipId: number, organizationId: number) {
    const membership = await this.prisma.orgMembership.findFirst({
      where: { id: membershipId, organizationId },
    });
    if (!membership) throw new NotFoundException('Empleado no encontrado en tu organización');

    return this.prisma.commissionRule.findMany({
      where: { membershipId },
      orderBy: { createdAt: 'desc' },
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- commission-plans.service.spec.ts`
Expected: PASS (all tests in the file, including the two new ones)

- [ ] **Step 5: Wire the controller route**

In `src/commissions/commission-plans.controller.ts`, add this method after `createOverride` (after its closing `}` around line 67, before `reviseRule`):

```ts
  @Get('rules/overrides')
  @ApiOperation({ summary: 'List individual commission rule overrides for one employee' })
  listOverrides(@CurrentUser() user: AuthUser, @Query('membershipId', ParseIntPipe) membershipId: number) {
    return this.plansService.listOverrides(membershipId, user.organizationId);
  }
```

- [ ] **Step 6: Typecheck and full test run**

Run: `pnpm build && pnpm test -- commissions`
Expected: build succeeds, all commission-related tests pass

- [ ] **Step 7: Commit**

```bash
git add src/commissions/commission-plans.service.ts src/commissions/commission-plans.controller.ts src/commissions/commission-plans.service.spec.ts
git commit -m "feat(commissions): add endpoint to list an employee's rule overrides"
```

---

## Task 2: Backend — list known product categories for rule scoping

**Files:**
- Modify: `src/commissions/commission-plans.controller.ts`
- Test: `src/commissions/commission-plans.service.spec.ts`

**Interfaces:**
- Consumes: `CommissionPlansService.listKnownCategories(organizationId: number): Promise<string[]>` (already exists, `commission-plans.service.ts:172-179`, unchanged)
- Produces: `GET /commissions/categories` → `string[]` (distinct, non-null `Product.category` values for the org)

- [ ] **Step 1: Write the failing test**

Add a new top-level `describe` block at the end of `src/commissions/commission-plans.service.spec.ts` (after the `CommissionPlansService.preview` block):

```ts
describe('CommissionPlansService.listKnownCategories', () => {
  let service: CommissionPlansService;

  const mockPrisma = {
    product: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommissionPlansService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(CommissionPlansService);
  });

  it('returns distinct non-null product categories for the organization', async () => {
    mockPrisma.product.findMany.mockResolvedValue([{ category: 'Accesorios' }, { category: 'Pantallas' }]);

    const result = await service.listKnownCategories(1);

    expect(mockPrisma.product.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, category: { not: null } },
      select: { category: true },
      distinct: ['category'],
    });
    expect(result).toEqual(['Accesorios', 'Pantallas']);
  });
});
```

Note: this test documents existing, already-correct behavior of `listKnownCategories` (it isn't directly tested yet — it's only exercised indirectly through `preview`). It should pass immediately since the method is unchanged; it exists to guard the new controller route's dependency.

- [ ] **Step 2: Run test to verify it passes already**

Run: `pnpm test -- commission-plans.service.spec.ts`
Expected: PASS (this locks in current behavior before we expose it via a new route)

- [ ] **Step 3: Add the controller route**

In `src/commissions/commission-plans.controller.ts`, add this method right after `findAll` (the `GET plans` handler, after its closing `}` around line 29), so `categories` is grouped with the other simple `GET` listing endpoints:

```ts
  @Get('categories')
  @ApiOperation({ summary: 'List distinct product categories usable as PRODUCT_CATEGORY rule scope' })
  listCategories(@CurrentUser() user: AuthUser) {
    return this.plansService.listKnownCategories(user.organizationId);
  }
```

- [ ] **Step 4: Typecheck and full test run**

Run: `pnpm build && pnpm test -- commissions`
Expected: build succeeds, all commission-related tests pass

- [ ] **Step 5: Commit**

```bash
git add src/commissions/commission-plans.controller.ts src/commissions/commission-plans.service.spec.ts
git commit -m "feat(commissions): add endpoint to list known product categories for rule scoping"
```

---

## Task 3: Frontend — `useCommissionPlans` data hook

**Files:**
- Create: `src/lib/hooks/useCommissionPlans.ts`
- Test: `src/lib/hooks/useCommissionPlans.test.ts`

**Interfaces:**
- Consumes: `api` from `src/lib/api.ts` (axios instance, already used by every other hook file)
- Produces (all exported from this file, used by every component task below):
  - Types: `CommissionBasis`, `CommissionScope`, `CommissionCalcMethod`, `CommissionRule`, `CommissionPlan`, `CommissionRulePreviewResult`, `CommissionRuleInput`, `CommissionRuleReviseInput`
  - `useCommissionPlans()`, `useCreateCommissionPlan()`, `useUpdateCommissionPlan()`, `useDeactivateCommissionPlan()`
  - `useAddCommissionRule()`, `useReviseCommissionRule()`, `useDeleteCommissionRule()`
  - `useCommissionOverrides(membershipId: number | null)`, `useCreateCommissionOverride()`
  - `useCommissionRulePreview(membershipId: number | null, date: string | null)`
  - `useCommissionCategories()`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/hooks/useCommissionPlans.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  useCommissionPlans,
  useCreateCommissionPlan,
  useAddCommissionRule,
  useCommissionOverrides,
  useCommissionRulePreview,
} from './useCommissionPlans'
import { api } from '../api'

jest.mock('../api')
const mockApi = api as jest.Mocked<typeof api>

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => QueryClientProvider({ client: queryClient, children })
}

describe('useCommissionPlans', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('fetches plans from /commissions/plans', async () => {
    mockApi.get.mockResolvedValue({ data: [{ id: 1, name: 'Vendedor', role: null, active: true, rules: [] }] })

    const { result } = renderHook(() => useCommissionPlans(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi.get).toHaveBeenCalledWith('/commissions/plans')
    expect(result.current.data?.[0].name).toBe('Vendedor')
  })

  it('posts a new plan to /commissions/plans', async () => {
    mockApi.post.mockResolvedValue({ data: { id: 1, name: 'Técnico', role: 'TECNICO', active: true, rules: [] } })

    const { result } = renderHook(() => useCreateCommissionPlan(), { wrapper: createWrapper() })
    result.current.mutate({ name: 'Técnico', role: 'TECNICO' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi.post).toHaveBeenCalledWith('/commissions/plans', { name: 'Técnico', role: 'TECNICO' })
  })

  it('posts a new rule to /commissions/plans/:id/rules', async () => {
    mockApi.post.mockResolvedValue({ data: { id: 1 } })

    const { result } = renderHook(() => useAddCommissionRule(), { wrapper: createWrapper() })
    result.current.mutate({
      planId: 7,
      data: { basis: 'SALE_TOTAL', scopeType: 'GENERAL', calcMethod: 'PERCENTAGE', value: 5 },
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi.post).toHaveBeenCalledWith('/commissions/plans/7/rules', {
      basis: 'SALE_TOTAL',
      scopeType: 'GENERAL',
      calcMethod: 'PERCENTAGE',
      value: 5,
    })
  })

  it('does not fetch overrides when membershipId is null', () => {
    const { result } = renderHook(() => useCommissionOverrides(null), { wrapper: createWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockApi.get).not.toHaveBeenCalled()
  })

  it('fetches overrides with membershipId as a query param when set', async () => {
    mockApi.get.mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useCommissionOverrides(9), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi.get).toHaveBeenCalledWith('/commissions/rules/overrides', { params: { membershipId: 9 } })
  })

  it('does not fetch a preview until both membershipId and date are set', () => {
    const { result } = renderHook(() => useCommissionRulePreview(null, null), { wrapper: createWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockApi.get).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- useCommissionPlans.test.ts`
Expected: FAIL — cannot find module `./useCommissionPlans`

- [ ] **Step 3: Implement the hook file**

Create `src/lib/hooks/useCommissionPlans.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { Role } from '@celhm/types'

export type CommissionBasis = 'SALE_TOTAL' | 'PROFIT'
export type CommissionScope = 'GENERAL' | 'PRODUCT_CATEGORY' | 'CUSTOMER_GROUP'
export type CommissionCalcMethod = 'PERCENTAGE' | 'FIXED'

export interface CommissionRule {
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

export interface CommissionPlan {
  id: number
  name: string
  role: Role | null
  active: boolean
  rules: CommissionRule[]
}

export interface CommissionRulePreviewResult {
  scopeLabel: string
  ruleId: number
  basis: CommissionBasis
  calcMethod: CommissionCalcMethod
  value: number
}

export interface CommissionRuleInput {
  basis: CommissionBasis
  scopeType: CommissionScope
  scopeValue?: string
  calcMethod: CommissionCalcMethod
  value: number
  label?: string
}

export interface CommissionRuleReviseInput {
  calcMethod: CommissionCalcMethod
  value: number
  label?: string
}

export function useCommissionPlans() {
  return useQuery<CommissionPlan[]>({
    queryKey: ['commission-plans'],
    queryFn: async () => {
      const response = await api.get<CommissionPlan[]>('/commissions/plans')
      return response.data
    },
  })
}

export function useCreateCommissionPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { name: string; role?: Role }) => {
      const response = await api.post<CommissionPlan>('/commissions/plans', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-plans'] })
    },
  })
}

export function useUpdateCommissionPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name?: string; active?: boolean } }) => {
      const response = await api.patch<CommissionPlan>(`/commissions/plans/${id}`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-plans'] })
    },
  })
}

export function useDeactivateCommissionPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await api.delete<CommissionPlan>(`/commissions/plans/${id}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-plans'] })
    },
  })
}

export function useAddCommissionRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ planId, data }: { planId: number; data: CommissionRuleInput }) => {
      const response = await api.post<CommissionRule>(`/commissions/plans/${planId}/rules`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-plans'] })
    },
  })
}

export function useReviseCommissionRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CommissionRuleReviseInput }) => {
      const response = await api.put<CommissionRule>(`/commissions/rules/${id}/revise`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-plans'] })
      queryClient.invalidateQueries({ queryKey: ['commission-overrides'] })
    },
  })
}

export function useDeleteCommissionRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await api.delete(`/commissions/rules/${id}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-plans'] })
      queryClient.invalidateQueries({ queryKey: ['commission-overrides'] })
    },
  })
}

export function useCommissionOverrides(membershipId: number | null) {
  return useQuery<CommissionRule[]>({
    queryKey: ['commission-overrides', membershipId],
    queryFn: async () => {
      const response = await api.get<CommissionRule[]>('/commissions/rules/overrides', {
        params: { membershipId },
      })
      return response.data
    },
    enabled: membershipId !== null,
  })
}

export function useCreateCommissionOverride() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: CommissionRuleInput & { membershipId: number }) => {
      const response = await api.post<CommissionRule>('/commissions/rules/override', data)
      return response.data
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['commission-overrides', variables.membershipId] })
    },
  })
}

export function useCommissionRulePreview(membershipId: number | null, date: string | null) {
  return useQuery<CommissionRulePreviewResult[]>({
    queryKey: ['commission-preview', membershipId, date],
    queryFn: async () => {
      const response = await api.get<CommissionRulePreviewResult[]>('/commissions/rules/preview', {
        params: { membershipId, date },
      })
      return response.data
    },
    enabled: membershipId !== null && date !== null,
  })
}

export function useCommissionCategories() {
  return useQuery<string[]>({
    queryKey: ['commission-categories'],
    queryFn: async () => {
      const response = await api.get<string[]>('/commissions/categories')
      return response.data
    },
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- useCommissionPlans.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/hooks/useCommissionPlans.ts src/lib/hooks/useCommissionPlans.test.ts
git commit -m "feat(commissions): add useCommissionPlans data hook"
```

---

## Task 4: Frontend — expose `commissionPlanId` on `useUsers`

**Files:**
- Modify: `src/lib/hooks/useUsers.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `OrgMember.commissionPlanId: number | null`; `useUpdateMember()` mutation now accepts an optional `commissionPlanId?: number | null` field (used by Task 13)

- [ ] **Step 1: Add the field to `OrgMember`**

In `src/lib/hooks/useUsers.ts`, modify the `OrgMember` interface (around line 5-23):

```ts
export interface OrgMember {
  id: number;
  organizationId: number;
  userId: number;
  role: Role;
  commissionRate: number | null;
  commissionPlanId: number | null;
  user: {
    id: number;
    name: string | null;
    email: string | null;
    branch: {
      id: number;
      name: string;
      code: string;
    } | null;
  };
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Accept and send the field in `useUpdateMember`**

Modify `useUpdateMember` (around line 68-89):

```ts
export function useUpdateMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      id: number;
      role?: Role;
      branchId?: number | null;
      commissionRate?: number | null;
      commissionPlanId?: number | null;
    }) => {
      const response = await api.patch(`/orgs/members/${data.id}`, {
        role: data.role,
        branchId: data.branchId,
        commissionRate: data.commissionRate,
        commissionPlanId: data.commissionPlanId,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors (existing callers of `useUpdateMember` don't pass `commissionPlanId`, which is fine since it's optional)

- [ ] **Step 4: Commit**

```bash
git add src/lib/hooks/useUsers.ts
git commit -m "feat(users): expose commissionPlanId on member records and updates"
```

---

## Task 5: Frontend — `RuleFormModal` component

**Files:**
- Create: `src/app/dashboard/commissions/_components/RuleFormModal.tsx`
- Test: `src/app/dashboard/commissions/_components/RuleFormModal.test.tsx`

**Interfaces:**
- Consumes: `useCommissionCategories()`, `CommissionBasis`, `CommissionScope`, `CommissionCalcMethod`, `CommissionRule`, `CommissionRuleInput`, `CommissionRuleReviseInput` from `../../../../lib/hooks/useCommissionPlans` (Task 3); `useCustomerGroups()`, `CustomerGroup` from `../../../../lib/hooks/useCustomerGroups` (existing)
- Produces: default export `RuleFormModal`, used by Task 6's `PlansTab`/`OverridesPanel` consumers (Tasks 9 and 11)

- [ ] **Step 1: Write the failing test**

Create `src/app/dashboard/commissions/_components/RuleFormModal.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import RuleFormModal from './RuleFormModal'

jest.mock('../../../../lib/hooks/useCommissionPlans', () => ({
  useCommissionCategories: () => ({ data: ['Accesorios', 'Pantallas'] }),
}))
jest.mock('../../../../lib/hooks/useCustomerGroups', () => ({
  useCustomerGroups: () => ({ data: [{ id: 1, name: 'Mayorista', discountPercent: 10, isDefault: false, isFrequentBuyerTarget: false }] }),
}))

describe('RuleFormModal', () => {
  it('disables submit until a scope value is chosen when scope is not GENERAL', () => {
    render(
      <RuleFormModal
        isOpen
        mode="add"
        ruleToRevise={null}
        isSaving={false}
        onClose={jest.fn()}
        onSubmitAdd={jest.fn()}
        onSubmitRevise={jest.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('Alcance'), { target: { value: 'PRODUCT_CATEGORY' } })
    fireEvent.change(screen.getByLabelText('Valor (%)'), { target: { value: '10' } })

    expect(screen.getByText('Guardar')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Accesorios' } })
    expect(screen.getByText('Guardar')).not.toBeDisabled()
  })

  it('submits the add payload with the chosen fields', () => {
    const onSubmitAdd = jest.fn()
    render(
      <RuleFormModal
        isOpen
        mode="add"
        ruleToRevise={null}
        isSaving={false}
        onClose={jest.fn()}
        onSubmitAdd={onSubmitAdd}
        onSubmitRevise={jest.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('Valor (%)'), { target: { value: '15' } })
    fireEvent.click(screen.getByText('Guardar'))

    expect(onSubmitAdd).toHaveBeenCalledWith({
      basis: 'SALE_TOTAL',
      scopeType: 'GENERAL',
      scopeValue: undefined,
      calcMethod: 'PERCENTAGE',
      value: 15,
      label: undefined,
    })
  })

  it('renders only the revise fields in revise mode, prefilled from the rule', () => {
    render(
      <RuleFormModal
        isOpen
        mode="revise"
        ruleToRevise={{
          id: 1, planId: 2, membershipId: null, basis: 'SALE_TOTAL', scopeType: 'GENERAL',
          scopeValue: null, calcMethod: 'PERCENTAGE', value: 8, validFrom: '2026-01-01',
          validTo: null, label: null,
        }}
        isSaving={false}
        onClose={jest.fn()}
        onSubmitAdd={jest.fn()}
        onSubmitRevise={jest.fn()}
      />
    )

    expect(screen.queryByLabelText('Alcance')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Valor (%)')).toHaveValue(8)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- RuleFormModal.test.tsx`
Expected: FAIL — cannot find module `./RuleFormModal`

- [ ] **Step 3: Implement the component**

Create `src/app/dashboard/commissions/_components/RuleFormModal.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import {
  useCommissionCategories,
  CommissionBasis,
  CommissionScope,
  CommissionCalcMethod,
  CommissionRule,
  CommissionRuleInput,
  CommissionRuleReviseInput,
} from '../../../../lib/hooks/useCommissionPlans'
import { useCustomerGroups } from '../../../../lib/hooks/useCustomerGroups'

interface RuleFormModalProps {
  isOpen: boolean
  mode: 'add' | 'revise'
  ruleToRevise: CommissionRule | null
  isSaving: boolean
  onClose: () => void
  onSubmitAdd: (data: CommissionRuleInput) => void
  onSubmitRevise: (data: CommissionRuleReviseInput) => void
}

const BASIS_OPTIONS: { value: CommissionBasis; label: string }[] = [
  { value: 'SALE_TOTAL', label: 'Venta total' },
  { value: 'PROFIT', label: 'Ganancia' },
]

const SCOPE_OPTIONS: { value: CommissionScope; label: string }[] = [
  { value: 'GENERAL', label: 'General' },
  { value: 'PRODUCT_CATEGORY', label: 'Categoría de producto' },
  { value: 'CUSTOMER_GROUP', label: 'Grupo de cliente' },
]

const CALC_OPTIONS: { value: CommissionCalcMethod; label: string }[] = [
  { value: 'PERCENTAGE', label: 'Porcentaje (%)' },
  { value: 'FIXED', label: 'Monto fijo ($)' },
]

const emptyForm = {
  basis: 'SALE_TOTAL' as CommissionBasis,
  scopeType: 'GENERAL' as CommissionScope,
  scopeValue: '',
  calcMethod: 'PERCENTAGE' as CommissionCalcMethod,
  value: '',
  label: '',
}

export default function RuleFormModal({
  isOpen,
  mode,
  ruleToRevise,
  isSaving,
  onClose,
  onSubmitAdd,
  onSubmitRevise,
}: RuleFormModalProps) {
  const [form, setForm] = useState(emptyForm)
  const { data: categories = [] } = useCommissionCategories()
  const { data: customerGroups = [] } = useCustomerGroups()

  useEffect(() => {
    if (!isOpen) return
    if (mode === 'revise' && ruleToRevise) {
      setForm({
        basis: ruleToRevise.basis,
        scopeType: ruleToRevise.scopeType,
        scopeValue: ruleToRevise.scopeValue ?? '',
        calcMethod: ruleToRevise.calcMethod,
        value: String(ruleToRevise.value),
        label: ruleToRevise.label ?? '',
      })
    } else {
      setForm(emptyForm)
    }
  }, [isOpen, mode, ruleToRevise])

  if (!isOpen) return null

  const needsScopeValue = form.scopeType !== 'GENERAL'
  const numericValue = Number(form.value)
  const isValueValid = form.value !== '' && !Number.isNaN(numericValue) && numericValue >= 0
  const isScopeValid = mode === 'revise' || !needsScopeValue || form.scopeValue !== ''
  const canSubmit = isValueValid && isScopeValid

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    if (mode === 'revise') {
      onSubmitRevise({
        calcMethod: form.calcMethod,
        value: numericValue,
        label: form.label || undefined,
      })
      return
    }

    onSubmitAdd({
      basis: form.basis,
      scopeType: form.scopeType,
      scopeValue: needsScopeValue ? form.scopeValue : undefined,
      calcMethod: form.calcMethod,
      value: numericValue,
      label: form.label || undefined,
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
      <div className="bg-card p-6 rounded-lg shadow-2xl w-full max-w-md">
        <h2 className="text-xl font-bold text-foreground">
          {mode === 'revise' ? 'Revisar regla' : 'Agregar regla'}
        </h2>
        {mode === 'revise' && (
          <p className="text-xs text-muted-foreground mt-2">
            Esto cierra la regla actual y crea una nueva a partir de hoy.
          </p>
        )}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {mode === 'add' && (
            <>
              <div>
                <label htmlFor="rule-basis" className="block text-sm font-medium text-foreground mb-1">Basis</label>
                <select
                  id="rule-basis"
                  aria-label="Basis"
                  value={form.basis}
                  onChange={(e) => setForm({ ...form, basis: e.target.value as CommissionBasis })}
                  className="w-full border border-border rounded-md px-3 py-2"
                  disabled={isSaving}
                >
                  {BASIS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="rule-scope" className="block text-sm font-medium text-foreground mb-1">Alcance</label>
                <select
                  id="rule-scope"
                  aria-label="Alcance"
                  value={form.scopeType}
                  onChange={(e) => setForm({ ...form, scopeType: e.target.value as CommissionScope, scopeValue: '' })}
                  className="w-full border border-border rounded-md px-3 py-2"
                  disabled={isSaving}
                >
                  {SCOPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {form.scopeType === 'PRODUCT_CATEGORY' && (
                <div>
                  <label htmlFor="rule-category" className="block text-sm font-medium text-foreground mb-1">Categoría</label>
                  <select
                    id="rule-category"
                    aria-label="Categoría"
                    value={form.scopeValue}
                    onChange={(e) => setForm({ ...form, scopeValue: e.target.value })}
                    className="w-full border border-border rounded-md px-3 py-2"
                    disabled={isSaving}
                  >
                    <option value="">Selecciona una categoría</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}
              {form.scopeType === 'CUSTOMER_GROUP' && (
                <div>
                  <label htmlFor="rule-group" className="block text-sm font-medium text-foreground mb-1">Grupo de cliente</label>
                  <select
                    id="rule-group"
                    aria-label="Grupo de cliente"
                    value={form.scopeValue}
                    onChange={(e) => setForm({ ...form, scopeValue: e.target.value })}
                    className="w-full border border-border rounded-md px-3 py-2"
                    disabled={isSaving}
                  >
                    <option value="">Selecciona un grupo</option>
                    {customerGroups.map((g) => (
                      <option key={g.id} value={String(g.id)}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
          <div>
            <label htmlFor="rule-calc" className="block text-sm font-medium text-foreground mb-1">Cálculo</label>
            <select
              id="rule-calc"
              aria-label="Cálculo"
              value={form.calcMethod}
              onChange={(e) => setForm({ ...form, calcMethod: e.target.value as CommissionCalcMethod })}
              className="w-full border border-border rounded-md px-3 py-2"
              disabled={isSaving}
            >
              {CALC_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rule-value" className="block text-sm font-medium text-foreground mb-1">
              Valor {form.calcMethod === 'PERCENTAGE' ? '(%)' : '($)'}
            </label>
            <input
              id="rule-value"
              aria-label={form.calcMethod === 'PERCENTAGE' ? 'Valor (%)' : 'Valor ($)'}
              type="number"
              min="0"
              max={form.calcMethod === 'PERCENTAGE' ? 100 : undefined}
              step="0.01"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              className="w-full border border-border rounded-md px-3 py-2"
              disabled={isSaving}
            />
          </div>
          <div>
            <label htmlFor="rule-label" className="block text-sm font-medium text-foreground mb-1">Etiqueta (opcional)</label>
            <input
              id="rule-label"
              aria-label="Etiqueta (opcional)"
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="w-full border border-border rounded-md px-3 py-2"
              disabled={isSaving}
            />
          </div>
          <div className="flex justify-end space-x-4 pt-2">
            <button type="button" onClick={onClose} disabled={isSaving} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-md disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={isSaving || !canSubmit} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md disabled:opacity-50">
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- RuleFormModal.test.tsx`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/commissions/_components/RuleFormModal.tsx src/app/dashboard/commissions/_components/RuleFormModal.test.tsx
git commit -m "feat(commissions): add RuleFormModal for add/revise rule forms"
```

---

## Task 6: Frontend — `RuleTable` component

**Files:**
- Create: `src/app/dashboard/commissions/_components/RuleTable.tsx`

**Interfaces:**
- Consumes: `CommissionRule` from `../../../../lib/hooks/useCommissionPlans` (Task 3); `useCustomerGroups()` from `../../../../lib/hooks/useCustomerGroups` (existing); `IconEdit`, `IconDelete`, `IconPlus` from `../../inventory/_components/icons` (existing)
- Produces: default export `RuleTable`, props `{ title: string; rules: CommissionRule[]; onAddRule: () => void; onReviseRule: (rule: CommissionRule) => void; onDeleteRule: (rule: CommissionRule) => void; isMutating: boolean }`, used by Tasks 9 and 11

- [ ] **Step 1: Implement the component**

Create `src/app/dashboard/commissions/_components/RuleTable.tsx`:

```tsx
'use client'

import { CommissionRule } from '../../../../lib/hooks/useCommissionPlans'
import { useCustomerGroups } from '../../../../lib/hooks/useCustomerGroups'
import { IconEdit, IconDelete, IconPlus } from '../../inventory/_components/icons'

interface RuleTableProps {
  title: string
  rules: CommissionRule[]
  onAddRule: () => void
  onReviseRule: (rule: CommissionRule) => void
  onDeleteRule: (rule: CommissionRule) => void
  isMutating: boolean
}

function formatScopeLabel(rule: CommissionRule, groupNameById: Map<number, string>): string {
  if (rule.scopeType === 'GENERAL') return 'General'
  if (rule.scopeType === 'PRODUCT_CATEGORY') return `Categoría: ${rule.scopeValue}`
  const groupId = Number(rule.scopeValue)
  return `Grupo: ${groupNameById.get(groupId) ?? rule.scopeValue}`
}

function formatCalc(rule: CommissionRule): string {
  return rule.calcMethod === 'PERCENTAGE' ? `${rule.value}%` : `$${rule.value} fijo`
}

function formatBasis(rule: CommissionRule): string {
  return rule.basis === 'SALE_TOTAL' ? 'Venta total' : 'Ganancia'
}

function formatVigencia(rule: CommissionRule): string {
  const from = new Date(rule.validFrom).toLocaleDateString()
  if (!rule.validTo) return `Desde ${from} · Vigente`
  return `${from} – ${new Date(rule.validTo).toLocaleDateString()}`
}

export default function RuleTable({ title, rules, onAddRule, onReviseRule, onDeleteRule, isMutating }: RuleTableProps) {
  const { data: customerGroups = [] } = useCustomerGroups()
  const groupNameById = new Map(customerGroups.map((g) => [g.id, g.name]))

  return (
    <div className="bg-card rounded-lg shadow">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <h3 className="text-lg font-bold text-foreground">{title}</h3>
        <button onClick={onAddRule} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center space-x-2">
          <IconPlus className="w-4 h-4" />
          <span>Agregar regla</span>
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Alcance</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Basis</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Cálculo</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Vigencia</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rules.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-muted-foreground">Sin reglas todavía</td>
              </tr>
            ) : (
              rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-muted">
                  <td className="px-4 py-2 text-sm text-foreground">{formatScopeLabel(rule, groupNameById)}</td>
                  <td className="px-4 py-2 text-sm text-foreground">{formatBasis(rule)}</td>
                  <td className="px-4 py-2 text-sm text-foreground">{formatCalc(rule)}</td>
                  <td className="px-4 py-2 text-sm text-foreground">{formatVigencia(rule)}</td>
                  <td className="px-4 py-2 text-sm">
                    <div className="flex items-center space-x-3">
                      <button onClick={() => onReviseRule(rule)} title="Revisar" disabled={isMutating} className="p-1 rounded-md text-primary hover:bg-blue-100 hover:text-blue-800 disabled:opacity-30">
                        <IconEdit className="w-5 h-5" />
                      </button>
                      <button onClick={() => onDeleteRule(rule)} title="Eliminar" disabled={isMutating} className="p-1 rounded-md text-red-600 hover:bg-red-100 hover:text-red-800 disabled:opacity-30">
                        <IconDelete className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/commissions/_components/RuleTable.tsx
git commit -m "feat(commissions): add RuleTable for displaying plan/override rules"
```

---

## Task 7: Frontend — `PlanFormModal` component

**Files:**
- Create: `src/app/dashboard/commissions/_components/PlanFormModal.tsx`
- Test: `src/app/dashboard/commissions/_components/PlanFormModal.test.tsx`

**Interfaces:**
- Consumes: `CommissionPlan` from `../../../../lib/hooks/useCommissionPlans` (Task 3); `Role` from `@celhm/types`
- Produces: default export `PlanFormModal`, used by Task 8's `PlanList`

- [ ] **Step 1: Write the failing test**

Create `src/app/dashboard/commissions/_components/PlanFormModal.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import PlanFormModal from './PlanFormModal'

describe('PlanFormModal', () => {
  it('disables submit when name is empty', () => {
    render(<PlanFormModal isOpen planToEdit={null} isSaving={false} onClose={jest.fn()} onSave={jest.fn()} />)
    expect(screen.getByText('Guardar')).toBeDisabled()
  })

  it('submits name and role when creating a new plan', () => {
    const onSave = jest.fn()
    render(<PlanFormModal isOpen planToEdit={null} isSaving={false} onClose={jest.fn()} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Vendedor estándar' } })
    fireEvent.change(screen.getByLabelText('Rol (opcional)'), { target: { value: 'VENDEDOR' } })
    fireEvent.click(screen.getByText('Guardar'))

    expect(onSave).toHaveBeenCalledWith({ name: 'Vendedor estándar', role: 'VENDEDOR' })
  })

  it('does not show the role field when editing an existing plan', () => {
    render(
      <PlanFormModal
        isOpen
        planToEdit={{ id: 1, name: 'Vendedor', role: 'VENDEDOR', active: true, rules: [] }}
        isSaving={false}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    )
    expect(screen.queryByLabelText('Rol (opcional)')).not.toBeInTheDocument()
    expect(screen.getByText('Actualizar')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- PlanFormModal.test.tsx`
Expected: FAIL — cannot find module `./PlanFormModal`

- [ ] **Step 3: Implement the component**

Create `src/app/dashboard/commissions/_components/PlanFormModal.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { CommissionPlan } from '../../../../lib/hooks/useCommissionPlans'
import { Role } from '@celhm/types'

interface PlanFormModalProps {
  isOpen: boolean
  planToEdit: CommissionPlan | null
  isSaving: boolean
  onClose: () => void
  onSave: (data: { name: string; role?: Role }) => void
}

const ROLE_OPTIONS: Role[] = ['ADMINISTRADOR', 'TECNICO', 'VENDEDOR', 'ALMACENISTA', 'CAJERO']

export default function PlanFormModal({ isOpen, planToEdit, isSaving, onClose, onSave }: PlanFormModalProps) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role | ''>('')

  useEffect(() => {
    if (!isOpen) return
    setName(planToEdit?.name ?? '')
    setRole(planToEdit?.role ?? '')
  }, [isOpen, planToEdit])

  if (!isOpen) return null

  const canSubmit = name.trim().length > 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    onSave({ name: name.trim(), role: role || undefined })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
      <div className="bg-card p-6 rounded-lg shadow-2xl w-full max-w-md">
        <h2 className="text-xl font-bold text-foreground">{planToEdit ? 'Editar plan' : 'Agregar plan'}</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="plan-name" className="block text-sm font-medium text-foreground mb-1">Nombre</label>
            <input
              id="plan-name"
              aria-label="Nombre"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Vendedor estándar"
              className="w-full border border-border rounded-md px-3 py-2"
              autoFocus
              disabled={isSaving}
            />
          </div>
          {!planToEdit && (
            <div>
              <label htmlFor="plan-role" className="block text-sm font-medium text-foreground mb-1">Rol (opcional)</label>
              <select
                id="plan-role"
                aria-label="Rol (opcional)"
                value={role}
                onChange={(e) => setRole(e.target.value as Role | '')}
                className="w-full border border-border rounded-md px-3 py-2"
                disabled={isSaving}
              >
                <option value="">— Sin rol específico —</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex justify-end space-x-4 pt-2">
            <button type="button" onClick={onClose} disabled={isSaving} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-md disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={isSaving || !canSubmit} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md disabled:opacity-50">
              {isSaving ? 'Guardando...' : (planToEdit ? 'Actualizar' : 'Guardar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- PlanFormModal.test.tsx`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/commissions/_components/PlanFormModal.tsx src/app/dashboard/commissions/_components/PlanFormModal.test.tsx
git commit -m "feat(commissions): add PlanFormModal for create/edit plan forms"
```

---

## Task 8: Frontend — `PlanList` component

**Files:**
- Create: `src/app/dashboard/commissions/_components/PlanList.tsx`

**Interfaces:**
- Consumes: `CommissionPlan`, `useCreateCommissionPlan`, `useUpdateCommissionPlan`, `useDeactivateCommissionPlan` from `../../../../lib/hooks/useCommissionPlans` (Task 3); `useToast` from `../../../../hooks/use-toast` (existing); `parseApiError` from `../../../../lib/utils` (existing); `IconEdit`, `IconPlus` from `../../inventory/_components/icons` (existing); `PlanFormModal` from `./PlanFormModal` (Task 7)
- Produces: default export `PlanList`, props `{ plans: CommissionPlan[]; isLoading: boolean; selectedPlanId: number | null; onSelectPlan: (id: number) => void }`, used by Task 11's `PlansTab`

- [ ] **Step 1: Implement the component**

Create `src/app/dashboard/commissions/_components/PlanList.tsx`:

```tsx
'use client'

import { useState } from 'react'
import {
  CommissionPlan,
  useCreateCommissionPlan,
  useUpdateCommissionPlan,
  useDeactivateCommissionPlan,
} from '../../../../lib/hooks/useCommissionPlans'
import { useToast } from '../../../../hooks/use-toast'
import { parseApiError } from '../../../../lib/utils'
import { IconEdit, IconPlus } from '../../inventory/_components/icons'
import PlanFormModal from './PlanFormModal'
import { Role } from '@celhm/types'

interface PlanListProps {
  plans: CommissionPlan[]
  isLoading: boolean
  selectedPlanId: number | null
  onSelectPlan: (id: number) => void
}

export default function PlanList({ plans, isLoading, selectedPlanId, onSelectPlan }: PlanListProps) {
  const { toast } = useToast()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [planToEdit, setPlanToEdit] = useState<CommissionPlan | null>(null)
  const [planToDeactivate, setPlanToDeactivate] = useState<CommissionPlan | null>(null)

  const createPlan = useCreateCommissionPlan()
  const updatePlan = useUpdateCommissionPlan()
  const deactivatePlan = useDeactivateCommissionPlan()
  const isSaving = createPlan.isPending || updatePlan.isPending

  const openAdd = () => { setPlanToEdit(null); setIsModalOpen(true) }
  const openEdit = (plan: CommissionPlan) => { setPlanToEdit(plan); setIsModalOpen(true) }
  const closeModal = () => { if (isSaving) return; setIsModalOpen(false); setPlanToEdit(null) }

  const handleSave = async (data: { name: string; role?: Role }) => {
    try {
      if (planToEdit) {
        await updatePlan.mutateAsync({ id: planToEdit.id, data: { name: data.name } })
        toast({ variant: 'success', title: 'Plan actualizado', description: 'El plan se actualizó correctamente.' })
      } else {
        await createPlan.mutateAsync(data)
        toast({ variant: 'success', title: 'Plan creado', description: 'El plan se creó correctamente.' })
      }
      closeModal()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: parseApiError(error, 'Error al guardar plan') })
    }
  }

  const handleDeactivate = async () => {
    if (!planToDeactivate) return
    try {
      await deactivatePlan.mutateAsync(planToDeactivate.id)
      toast({ variant: 'success', title: 'Plan desactivado', description: 'El plan quedó inactivo.' })
      setPlanToDeactivate(null)
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error al desactivar', description: parseApiError(error, 'Error al desactivar plan') })
    }
  }

  return (
    <div className="bg-card rounded-lg shadow">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <h3 className="text-lg font-bold text-foreground">Planes de comisión</h3>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center space-x-2">
          <IconPlus className="w-4 h-4" />
          <span>Agregar plan</span>
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Nombre</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Rol</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase"># Reglas</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Estatus</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-4 text-center text-muted-foreground">Cargando...</td></tr>
            ) : plans.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-4 text-center text-muted-foreground">No hay planes todavía</td></tr>
            ) : (
              plans.map((plan) => (
                <tr
                  key={plan.id}
                  onClick={() => onSelectPlan(plan.id)}
                  className={`cursor-pointer hover:bg-muted ${selectedPlanId === plan.id ? 'bg-muted' : ''}`}
                >
                  <td className="px-4 py-2 text-sm font-medium text-foreground">{plan.name}</td>
                  <td className="px-4 py-2 text-sm text-foreground">{plan.role ?? '—'}</td>
                  <td className="px-4 py-2 text-sm text-foreground">{plan.rules.length}</td>
                  <td className="px-4 py-2 text-sm">
                    {plan.active ? (
                      <span className="inline-flex text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Activo</span>
                    ) : (
                      <span className="inline-flex text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center space-x-3">
                      <button onClick={() => openEdit(plan)} title="Editar" className="p-1 rounded-md text-primary hover:bg-blue-100 hover:text-blue-800">
                        <IconEdit className="w-5 h-5" />
                      </button>
                      {plan.active && (
                        <button onClick={() => setPlanToDeactivate(plan)} title="Desactivar" className="text-xs text-red-600 hover:underline">
                          Desactivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PlanFormModal isOpen={isModalOpen} planToEdit={planToEdit} isSaving={isSaving} onClose={closeModal} onSave={handleSave} />

      {planToDeactivate && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
          <div className="bg-card p-6 rounded-lg shadow-2xl w-full max-w-md">
            <h2 className="text-xl font-bold text-foreground">Confirmar desactivación</h2>
            <p className="text-muted-foreground mt-4">
              ¿Desactivar el plan <span className="font-medium">{planToDeactivate.name}</span>? Dejará de aplicar a
              ventas nuevas; sus reglas y comisiones ya generadas no se borran.
            </p>
            <div className="flex justify-end space-x-4 mt-6">
              <button onClick={() => setPlanToDeactivate(null)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-md">Cancelar</button>
              <button onClick={handleDeactivate} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-md">Desactivar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/commissions/_components/PlanList.tsx
git commit -m "feat(commissions): add PlanList with create/edit/deactivate actions"
```

---

## Task 9: Frontend — `OverridesPanel` component

**Files:**
- Create: `src/app/dashboard/commissions/_components/OverridesPanel.tsx`

**Interfaces:**
- Consumes: `useUsers()` from `../../../../lib/hooks/useUsers` (existing); `useCommissionOverrides`, `useCreateCommissionOverride`, `useReviseCommissionRule`, `useDeleteCommissionRule`, `CommissionRule`, `CommissionRuleInput`, `CommissionRuleReviseInput` from `../../../../lib/hooks/useCommissionPlans` (Task 3); `useToast` (existing); `parseApiError` (existing); `RuleTable` (Task 6); `RuleFormModal` (Task 5)
- Produces: default export `OverridesPanel` (no props — self-contained), used by Task 11's `PlansTab`

- [ ] **Step 1: Implement the component**

Create `src/app/dashboard/commissions/_components/OverridesPanel.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useUsers } from '../../../../lib/hooks/useUsers'
import {
  useCommissionOverrides,
  useCreateCommissionOverride,
  useReviseCommissionRule,
  useDeleteCommissionRule,
  CommissionRule,
  CommissionRuleInput,
  CommissionRuleReviseInput,
} from '../../../../lib/hooks/useCommissionPlans'
import { useToast } from '../../../../hooks/use-toast'
import { parseApiError } from '../../../../lib/utils'
import RuleTable from './RuleTable'
import RuleFormModal from './RuleFormModal'

export default function OverridesPanel() {
  const { toast } = useToast()
  const { data: members = [] } = useUsers()
  const [membershipId, setMembershipId] = useState<number | null>(null)
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false)
  const [ruleToRevise, setRuleToRevise] = useState<CommissionRule | null>(null)

  const { data: overrides = [], isLoading } = useCommissionOverrides(membershipId)
  const createOverride = useCreateCommissionOverride()
  const reviseRule = useReviseCommissionRule()
  const deleteRule = useDeleteCommissionRule()

  const openAddRule = () => { setRuleToRevise(null); setIsRuleModalOpen(true) }
  const openReviseRule = (rule: CommissionRule) => { setRuleToRevise(rule); setIsRuleModalOpen(true) }
  const closeRuleModal = () => { setIsRuleModalOpen(false); setRuleToRevise(null) }

  const handleSubmitAdd = async (data: CommissionRuleInput) => {
    if (membershipId === null) return
    try {
      await createOverride.mutateAsync({ ...data, membershipId })
      toast({ variant: 'success', title: 'Override creado', description: 'La regla individual se creó correctamente.' })
      closeRuleModal()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: parseApiError(error, 'Error al crear override') })
    }
  }

  const handleSubmitRevise = async (data: CommissionRuleReviseInput) => {
    if (!ruleToRevise) return
    try {
      await reviseRule.mutateAsync({ id: ruleToRevise.id, data })
      toast({ variant: 'success', title: 'Regla revisada', description: 'Se creó una nueva versión de la regla.' })
      closeRuleModal()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error al revisar', description: parseApiError(error, 'Error al revisar regla') })
    }
  }

  const handleDeleteRule = async (rule: CommissionRule) => {
    if (!confirm('¿Eliminar este override? Si ya fue usado en comisiones generadas, solo se cerrará su vigencia.')) return
    try {
      await deleteRule.mutateAsync(rule.id)
      toast({ variant: 'success', title: 'Override eliminado', description: 'El override se procesó correctamente.' })
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error al eliminar', description: parseApiError(error, 'Error al eliminar override') })
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-lg shadow p-4">
        <label htmlFor="override-member" className="block text-sm font-medium text-foreground mb-1">Empleado</label>
        <select
          id="override-member"
          value={membershipId ?? ''}
          onChange={(e) => setMembershipId(e.target.value ? Number(e.target.value) : null)}
          className="w-full max-w-md border border-border rounded-md px-3 py-2"
        >
          <option value="">Selecciona un empleado</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.user.name || m.user.email}</option>
          ))}
        </select>
      </div>

      {membershipId !== null && (
        isLoading ? (
          <div className="bg-card rounded-lg shadow p-4 text-center text-muted-foreground">Cargando overrides...</div>
        ) : (
          <RuleTable
            title="Reglas individuales"
            rules={overrides}
            onAddRule={openAddRule}
            onReviseRule={openReviseRule}
            onDeleteRule={handleDeleteRule}
            isMutating={deleteRule.isPending}
          />
        )
      )}

      <RuleFormModal
        isOpen={isRuleModalOpen}
        mode={ruleToRevise ? 'revise' : 'add'}
        ruleToRevise={ruleToRevise}
        isSaving={createOverride.isPending || reviseRule.isPending}
        onClose={closeRuleModal}
        onSubmitAdd={handleSubmitAdd}
        onSubmitRevise={handleSubmitRevise}
      />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/commissions/_components/OverridesPanel.tsx
git commit -m "feat(commissions): add OverridesPanel for per-employee rule overrides"
```

---

## Task 10: Frontend — `PreviewPanel` component

**Files:**
- Create: `src/app/dashboard/commissions/_components/PreviewPanel.tsx`

**Interfaces:**
- Consumes: `useUsers()` from `../../../../lib/hooks/useUsers` (existing); `useCommissionRulePreview` from `../../../../lib/hooks/useCommissionPlans` (Task 3)
- Produces: default export `PreviewPanel` (no props — self-contained), used by Task 11's `PlansTab`

- [ ] **Step 1: Implement the component**

Create `src/app/dashboard/commissions/_components/PreviewPanel.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useUsers } from '../../../../lib/hooks/useUsers'
import { useCommissionRulePreview } from '../../../../lib/hooks/useCommissionPlans'

function formatBasis(basis: 'SALE_TOTAL' | 'PROFIT'): string {
  return basis === 'SALE_TOTAL' ? 'Venta total' : 'Ganancia'
}

function formatCalc(calcMethod: 'PERCENTAGE' | 'FIXED', value: number): string {
  return calcMethod === 'PERCENTAGE' ? `${value}%` : `$${value} fijo`
}

export default function PreviewPanel() {
  const { data: members = [] } = useUsers()
  const [membershipId, setMembershipId] = useState<number | null>(null)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [query, setQuery] = useState<{ membershipId: number; date: string } | null>(null)

  const { data: results = [], isFetching } = useCommissionRulePreview(query?.membershipId ?? null, query?.date ?? null)

  const handleCalculate = () => {
    if (membershipId === null) return
    setQuery({ membershipId, date })
  }

  return (
    <div className="bg-card rounded-lg shadow p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div>
          <label htmlFor="preview-member" className="block text-sm font-medium text-foreground mb-1">Empleado</label>
          <select
            id="preview-member"
            value={membershipId ?? ''}
            onChange={(e) => setMembershipId(e.target.value ? Number(e.target.value) : null)}
            className="w-full border border-border rounded-md px-3 py-2"
          >
            <option value="">Selecciona un empleado</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.user.name || m.user.email}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="preview-date" className="block text-sm font-medium text-foreground mb-1">Fecha</label>
          <input
            id="preview-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-border rounded-md px-3 py-2"
          />
        </div>
        <button
          onClick={handleCalculate}
          disabled={membershipId === null || isFetching}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md disabled:opacity-50"
        >
          {isFetching ? 'Calculando...' : 'Calcular'}
        </button>
      </div>

      {query && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Alcance</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Basis</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Cálculo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.length === 0 && !isFetching ? (
                <tr><td colSpan={3} className="px-4 py-4 text-center text-muted-foreground">Sin regla aplicable</td></tr>
              ) : (
                results.map((r) => (
                  <tr key={r.scopeLabel}>
                    <td className="px-4 py-2 text-sm text-foreground">{r.scopeLabel}</td>
                    <td className="px-4 py-2 text-sm text-foreground">{formatBasis(r.basis)}</td>
                    <td className="px-4 py-2 text-sm text-foreground">{formatCalc(r.calcMethod, r.value)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/commissions/_components/PreviewPanel.tsx
git commit -m "feat(commissions): add PreviewPanel for winning-rule simulation"
```

---

## Task 11: Frontend — `PlansTab` orchestrator

**Files:**
- Create: `src/app/dashboard/commissions/_components/PlansTab.tsx`

**Interfaces:**
- Consumes: `useCommissionPlans`, `useAddCommissionRule`, `useReviseCommissionRule`, `useDeleteCommissionRule`, `CommissionRule`, `CommissionRuleInput`, `CommissionRuleReviseInput` from `../../../../lib/hooks/useCommissionPlans` (Task 3); `useToast` (existing); `parseApiError` (existing); `PlanList` (Task 8); `RuleTable` (Task 6); `RuleFormModal` (Task 5); `OverridesPanel` (Task 9); `PreviewPanel` (Task 10)
- Produces: default export `PlansTab` (no props — self-contained), used by Task 12's `commissions/page.tsx`

- [ ] **Step 1: Implement the component**

Create `src/app/dashboard/commissions/_components/PlansTab.tsx`:

```tsx
'use client'

import { useState } from 'react'
import {
  useCommissionPlans,
  useAddCommissionRule,
  useReviseCommissionRule,
  useDeleteCommissionRule,
  CommissionRule,
  CommissionRuleInput,
  CommissionRuleReviseInput,
} from '../../../../lib/hooks/useCommissionPlans'
import { useToast } from '../../../../hooks/use-toast'
import { parseApiError } from '../../../../lib/utils'
import PlanList from './PlanList'
import RuleTable from './RuleTable'
import RuleFormModal from './RuleFormModal'
import OverridesPanel from './OverridesPanel'
import PreviewPanel from './PreviewPanel'

type SubTab = 'plans' | 'overrides' | 'preview'

const SUB_TAB_LABELS: Record<SubTab, string> = {
  plans: 'Planes',
  overrides: 'Overrides',
  preview: 'Preview',
}

export default function PlansTab() {
  const { toast } = useToast()
  const [subTab, setSubTab] = useState<SubTab>('plans')
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false)
  const [ruleToRevise, setRuleToRevise] = useState<CommissionRule | null>(null)

  const { data: plans = [], isLoading } = useCommissionPlans()
  const addRule = useAddCommissionRule()
  const reviseRule = useReviseCommissionRule()
  const deleteRule = useDeleteCommissionRule()

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null

  const openAddRule = () => { setRuleToRevise(null); setIsRuleModalOpen(true) }
  const openReviseRule = (rule: CommissionRule) => { setRuleToRevise(rule); setIsRuleModalOpen(true) }
  const closeRuleModal = () => { setIsRuleModalOpen(false); setRuleToRevise(null) }

  const handleSubmitAdd = async (data: CommissionRuleInput) => {
    if (selectedPlanId === null) return
    try {
      await addRule.mutateAsync({ planId: selectedPlanId, data })
      toast({ variant: 'success', title: 'Regla agregada', description: 'La regla se agregó correctamente.' })
      closeRuleModal()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: parseApiError(error, 'Error al agregar regla') })
    }
  }

  const handleSubmitRevise = async (data: CommissionRuleReviseInput) => {
    if (!ruleToRevise) return
    try {
      await reviseRule.mutateAsync({ id: ruleToRevise.id, data })
      toast({ variant: 'success', title: 'Regla revisada', description: 'Se creó una nueva versión de la regla.' })
      closeRuleModal()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error al revisar', description: parseApiError(error, 'Error al revisar regla') })
    }
  }

  const handleDeleteRule = async (rule: CommissionRule) => {
    if (!confirm('¿Eliminar esta regla? Si ya fue usada en comisiones generadas, solo se cerrará su vigencia.')) return
    try {
      await deleteRule.mutateAsync(rule.id)
      toast({ variant: 'success', title: 'Regla eliminada', description: 'La regla se procesó correctamente.' })
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error al eliminar', description: parseApiError(error, 'Error al eliminar regla') })
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-border">
        <nav className="-mb-px flex space-x-8">
          {(Object.keys(SUB_TAB_LABELS) as SubTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setSubTab(tab)}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                subTab === tab
                  ? 'border-blue-500 text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {SUB_TAB_LABELS[tab]}
            </button>
          ))}
        </nav>
      </div>

      {subTab === 'plans' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PlanList plans={plans} isLoading={isLoading} selectedPlanId={selectedPlanId} onSelectPlan={setSelectedPlanId} />
          {selectedPlan && (
            <RuleTable
              title={`Reglas de "${selectedPlan.name}"`}
              rules={selectedPlan.rules}
              onAddRule={openAddRule}
              onReviseRule={openReviseRule}
              onDeleteRule={handleDeleteRule}
              isMutating={deleteRule.isPending}
            />
          )}
        </div>
      )}

      {subTab === 'overrides' && <OverridesPanel />}
      {subTab === 'preview' && <PreviewPanel />}

      <RuleFormModal
        isOpen={isRuleModalOpen}
        mode={ruleToRevise ? 'revise' : 'add'}
        ruleToRevise={ruleToRevise}
        isSaving={addRule.isPending || reviseRule.isPending}
        onClose={closeRuleModal}
        onSubmitAdd={handleSubmitAdd}
        onSubmitRevise={handleSubmitRevise}
      />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/commissions/_components/PlansTab.tsx
git commit -m "feat(commissions): add PlansTab orchestrating plans, overrides, and preview"
```

---

## Task 12: Frontend — wire `PlansTab` into `/dashboard/commissions`

**Files:**
- Modify: `src/app/dashboard/commissions/page.tsx`

**Interfaces:**
- Consumes: `PlansTab` from `./_components/PlansTab` (Task 11)

- [ ] **Step 1: Add tab state and import**

In `src/app/dashboard/commissions/page.tsx`, add the import after the existing `parseApiError` import (line 17):

```tsx
import { parseApiError } from "../../../lib/utils";
import PlansTab from "./_components/PlansTab";
```

Add tab state right after the existing `useState` declarations (after line 27, `const [pageSize] = useState(10);`):

```tsx
  const [activeTab, setActiveTab] = useState<"comisiones" | "planes">("comisiones");
```

- [ ] **Step 2: Wrap the header and existing content in the "comisiones" tab, add the tab nav and "planes" tab**

Replace the opening of the returned JSX (currently starting at line 115 `return (` through the header block at lines 115-132) with a version that adds the tab nav below the header, and wraps everything from the summary cards (line 134) through the pagination controls (ending at line 302, the closing `</div>` for the detailed table) in a `{activeTab === "comisiones" && (...)}` block. Concretely:

```tsx
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Comisiones</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gestionar y pagar comisiones de laboratorio
          </p>
        </div>
        {activeTab === "comisiones" && (
          <button
            onClick={handleExport}
            disabled={exportMutation.isPending}
            className="bg-white hover:bg-gray-50 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-white border border-gray-300 dark:border-gray-600 font-medium py-2 px-4 rounded-md transition-colors flex items-center space-x-2"
          >
            <Download className="w-5 h-5" />
            <span>{exportMutation.isPending ? "Exportando..." : "Exportar CSV"}</span>
          </button>
        )}
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("comisiones")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "comisiones"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400"
            }`}
          >
            Comisiones
          </button>
          <button
            onClick={() => setActiveTab("planes")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "planes"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400"
            }`}
          >
            Planes
          </button>
        </nav>
      </div>

      {activeTab === "comisiones" && (
        <>
          {/* Tarjetas de Resumen */}
```

This replaces lines 115-134 (through the `{/* Tarjetas de Resumen */}` comment). Keep everything from the summary cards `<div className="grid grid-cols-1 md:grid-cols-3 gap-4">` (original line 135) through the end of the pagination controls block (original line 301, the `)}` closing the `commissionsData.pagination.totalPages > 1` conditional) exactly as-is. Immediately after that block's closing (what was the table's outer `</div>` at original line 302), close the new wrapper and add the "planes" tab:

```tsx
        </>
      )}

      {activeTab === "planes" && <PlansTab />}
    </div>
  );
}
```

This replaces the original closing `</div>\n  );\n}` at lines 302-305.

- [ ] **Step 3: Typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: no errors

- [ ] **Step 4: Manual smoke check**

Run: `pnpm dev`, open `http://localhost:3000/dashboard/commissions` as an ADMINISTRADOR user, confirm both tabs render, "Comisiones" still shows the existing list/export/pay flow unchanged, "Planes" shows the new `PlansTab` (empty plan list initially).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/commissions/page.tsx
git commit -m "feat(commissions): add Planes tab to the commissions page"
```

---

## Task 13: Frontend — assign commission plan from the Users edit modal

**Files:**
- Modify: `src/app/dashboard/users/page.tsx`

**Interfaces:**
- Consumes: `useCommissionPlans` from `../../../lib/hooks/useCommissionPlans` (Task 3); `OrgMember.commissionPlanId` (Task 4)

- [ ] **Step 1: Import the hook and fetch plans**

Add the import after the existing `useBranches` import (line 13):

```tsx
import { useBranches } from "../../../lib/hooks/useBranches";
import { useCommissionPlans } from "../../../lib/hooks/useCommissionPlans";
```

Add the query call right after `const updateMember = useUpdateMember();` (line 96):

```tsx
  const updateMember = useUpdateMember();
  const { data: commissionPlans = [] } = useCommissionPlans();
```

- [ ] **Step 2: Add `commissionPlanId` to `editForm` state**

Modify the `editForm` state declaration (lines 101-105):

```tsx
  const [editForm, setEditForm] = useState({
    role: "" as Role,
    branchId: "",
    commissionRate: "",
    commissionPlanId: "",
  });
```

- [ ] **Step 3: Populate it in `handleOpenEdit`**

Modify `handleOpenEdit` (lines 212-221):

```tsx
  const handleOpenEdit = (member: OrgMember) => {
    setEditingMember(member);
    setEditForm({
      role: member.role,
      branchId: member.user.branch?.id.toString() || "",
      commissionRate:
        member.commissionRate != null ? member.commissionRate.toString() : "",
      commissionPlanId:
        member.commissionPlanId != null ? member.commissionPlanId.toString() : "",
    });
    setIsEditModalOpen(true);
  };
```

- [ ] **Step 4: Send it in `handleUpdateMember`**

Modify `handleUpdateMember` (lines 239-264), adding `commissionPlanId` to the mutation payload:

```tsx
  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    try {
      await updateMember.mutateAsync({
        id: editingMember.id,
        role: editForm.role,
        branchId: editForm.branchId ? parseInt(editForm.branchId) : null,
        commissionRate: editForm.commissionRate
          ? parseFloat(editForm.commissionRate)
          : null,
        commissionPlanId: editForm.commissionPlanId
          ? parseInt(editForm.commissionPlanId)
          : null,
      });
      handleCloseEdit();
      toast({
        variant: "success",
        title: "Usuario actualizado",
        description: "Los cambios se guardaron correctamente.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al actualizar",
        description: parseApiError(error, "Error al actualizar usuario"),
      });
    }
  };
```

- [ ] **Step 5: Add the plan selector to the edit modal JSX**

In the edit modal (around original lines 695-719), add the new select right after the closing `</div>` of the `commissionRate` block (after line 718) and before the closing `)}` of that same conditional (line 719):

```tsx
              {["TECNICO", "ADMINISTRADOR", "VENDEDOR", "CAJERO"].includes(editForm.role) && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tasa de Comisión (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="Ej: 10.00"
                    value={editForm.commissionRate}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        commissionRate: e.target.value,
                      })
                    }
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Porcentaje aplicado al subtotal de cada venta de laboratorio
                  </p>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 mt-4">
                    Plan de comisión
                  </label>
                  <select
                    value={editForm.commissionPlanId}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        commissionPlanId: e.target.value,
                      })
                    }
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Ninguno —</option>
                    {commissionPlans
                      .filter((plan) => plan.active)
                      .map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                        </option>
                      ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Si se asigna un plan, sus reglas tienen prioridad sobre la tasa fija de arriba.
                  </p>
                </div>
              )}
```

This replaces the entire original block from line 695 through line 719.

- [ ] **Step 6: Typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: no errors

- [ ] **Step 7: Manual smoke check**

Run: `pnpm dev`, open `http://localhost:3000/dashboard/users`, edit a VENDEDOR/TECNICO/ADMINISTRADOR/CAJERO member, confirm the "Plan de comisión" selector appears below the commission-rate field, populated with active plans, and that saving persists the selection (re-open the edit modal and confirm it's still selected).

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/users/page.tsx
git commit -m "feat(users): allow assigning a commission plan from the member edit modal"
```

---

## Task 14: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start both dev servers**

Run in `celhm-api-main`: `pnpm dev` (port 3001)
Run in `celhm-app-main`: `pnpm dev` (port 3000)

- [ ] **Step 2: Walk the full admin flow as an ADMINISTRADOR user**

1. `/dashboard/commissions` → "Planes" tab → "Agregar plan" → create a plan named "Vendedor estándar" with role `VENDEDOR`.
2. Select the new plan → "Agregar regla" → add a `GENERAL` / `SALE_TOTAL` / `PERCENTAGE` / `5` rule.
3. Add a second rule with `PRODUCT_CATEGORY` scope, picking a real category from the dropdown (confirms `GET /commissions/categories` returns real `Product.category` values, not the `ProductCategory` catalog).
4. Click "Revisar" on the first rule, change the value to `7`, confirm the table now shows a new row with `validFrom = hoy` and the old one shows a closed `validTo`.
5. Switch to "Overrides" tab, pick an employee, add an individual override rule, confirm it appears in that employee's table (validates the new `GET /commissions/rules/overrides` endpoint end-to-end).
6. Switch to "Preview" tab, pick the same employee and today's date, click "Calcular", confirm the results table shows the override winning over the plan rule for matching scopes.
7. Go to `/dashboard/users`, edit the employee used above, assign "Vendedor estándar" as their "Plan de comisión", save, reopen the modal, confirm the selection persisted.
8. Go back to `/dashboard/commissions` → "Comisiones" tab, confirm the existing list/summary/export/pay flow still works unchanged.

- [ ] **Step 3: Run full test suites in both repos**

Run in `celhm-api-main`: `pnpm test`
Run in `celhm-app-main`: `pnpm test && pnpm typecheck`
Expected: all green

- [ ] **Step 4: Report results**

No commit for this task — it's verification only. If any step fails, return to the relevant task above, fix, and re-run the affected step.
