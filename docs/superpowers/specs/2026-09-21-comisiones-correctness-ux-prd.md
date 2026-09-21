# Comisiones: correctness and UX rework (PRD)

Status: draft, waiting for "proceed" (PR A only). Date: 2026-09-21.
Supersedes the "coexisting mechanisms" note in `2026-08-14-comisiones-admin-frontend-design.md`.

## 1. Problem

The same employee (Chlau, user 4, date 2026-09-21) gets four different answers:

| Surface | Source | Result |
|---|---|---|
| Comisiones card "Tasa actual" | `OrgMembership.commissionRate` (`commissions.service.ts:380`) | 10.0% |
| Overrides tab | raw `commission_rules` rows; "Vigente" only means `validTo === null` | 5% |
| Preview | resolver, date `"2026-09-21"` parsed as `2026-09-21T00:00:00.000Z` | Sin regla aplicable |
| Real sale (`generateForLine`) | resolver, `sale.createdAt` | would pay 5% |

Live data: Chlau's override has `validFrom = 2026-09-21T18:10:15.580Z` (server `new Date()`), so `validFrom <= 00:00Z` is false and Preview drops it.

Root causes:
1. `commissionRate` is dead for payouts but shown as live. The UI copy promises a fallback no code implements. Origin: the 08-08 backend design migrates the rate into an override and hides the field; the 08-14 frontend spec kept it as a "coexisting mechanism". The migration script was never run (0 rules labeled "Migrado de commissionRate legacy").
2. `validFrom` is a raw timestamp and Preview compares against UTC midnight. `Organization.timezone` (`America/Mexico_City`) is stored and never read.
3. Rule candidates are built twice (`getCandidateRules`, `preview`) and never for the summary.
4. Configuration is buried two tab levels deep in the payout page, rules are hidden behind a row click, and plan assignment lives only on `/dashboard/users`.

## 2. Success criteria

- For any employee and date, card, Preview and real commission calculation return the same rule. Enforced by one shared function and a parametrized test across all three.
- A rule created today shows in Preview for today. The 16:00Z vs 00:00Z case is a regression test.
- No UI text mentions a flat rate. Card shows the effective rule or "Sin regla: no genera comisiones".
- Desactivar names the affected employees. Nobody silently loses commissions.
- Adding a rule for the same employee and scope closes the previous one, so the UI never creates a silent tie.
- Existing suites stay green. New tests cover every case in PR A below.

## 3. Scope

**Confirmed decisions (2026-09-21, before PR A code):**
- No data migration. Existing rules keep their old intraday `validFrom` timestamps (Chlau's is `2026-09-21T18:10:15.580Z`).
- Preview receives a date-only input (`YYYY-MM-DD`) and evaluates it at the END of that day (23:59:59.999) in `Organization.timezone`, never at UTC midnight. Legacy rules that started mid-day therefore show as applicable on their start date.
- Real sales are untouched: `generateForLine` keeps resolving with the exact `sale.createdAt` instant. Only Preview (and new rule start dates) use the org-timezone helper.
- New rules start at the start of the chosen day in `Organization.timezone`. The helper is scoped to commissions.
- Resolver priority and tie logic do not change.

**PR A (correctness), one commit per step, on branch `fix/comisiones-correctness`:**
1. Failing test: override `validFrom = 2026-09-21T16:00Z`, Preview for `2026-09-21` in `America/Mexico_City`, expects the override (RED).
2. One shared "effective rule for employee E on date D": `buildRuleCandidates(membership)` plus `resolveEffectiveRule(membership, ctx)` and one shared Prisma include, used by `generateForLine`, `preview` and the Comisiones summary. Cross-surface tests: same-day override, plan only, neither, override vs plan. Review checkpoint.
3. `commission-dates.ts` (start and end of day in org timezone via `Intl`, no new dependency). Preview parses date-only input with it (test 1 turns green). Rule start = start of day for add rule, add override and "Revisar"; each closes the open same-scope rule (`validTo = newValidFrom - 1ms`, scope type and value, regardless of basis). Web asks for confirmation before replacing.
4. Card inclusion: active plan, any override rule, role TECNICO or VENDEDOR, or any commission row. No effective rule shows "Sin regla: no genera comisiones".
5. Remove the legacy rate from the UI in four places (Usuarios "Comisión" column, Edit User, Create User, Comisiones card "Tasa actual"). Edit and Create payloads omit `commissionRate`; the server treats a missing key as no change. Tests on both sides. DB column, DTO field, registration write and migration script stay.
6. Desactivar dialog lists assigned employees (count and names); plans endpoint gains `assignedMembers` (additive). Members on an inactive plan show a warning.
7. Overrides list shows Vigente / Programada / Vencida from both dates.

Not in PR A unless asked: the null-safe `commission.ticket` fix (Q7), pay-status guard (Q5) and everything in PR B.

**PR B (UX):** shared `ConfirmDialog` (none exists; five ad hoc versions today); config moved to its own route behind "Configurar planes" with a single tab level; plan detail with "Ver reglas", chevron, "Sin reglas: este plan no genera comisiones" and inline "Agregar regla"; hide plan "Rol"; "Reglas individuales" with an editable "Vigente desde" (status badges and the replace confirmation already ship in PR A); "Simulador" with sample sale amount (plus optional cost for base Ganancia), winning rule and reason; empty states with cause and next step; Spanish copy, helper text, labeled counts ("Pendientes: 0 · $0.00"), one date format (dd/mm/yyyy, org timezone) via one helper; aria-labels on icon buttons; period filter (reuse `components/ui/DateRangePicker`) and employee filter (API already supports `userId`, `startDate`, `endDate`); remove "Cancelada" option; label negative refund rows "Devolución"; batch pay (API and hook exist, unused); card footer explaining who appears and who does not.

## 4. Non-goals

No Caja integration. No resolver semantic or priority change. No backfill or retroactive commissions. No DB column drops. Migration script not run. No repo-wide timezone refactor (helper scoped to commissions; unused `Organization.timezone` elsewhere logged as tech debt). No editing of Chlau's rows or any data.

## 5. Constraints

Reuse first: `DateRangePicker`, `packages/ui` Button/Badge/Card/Input, toast, `useUsers`/`useCommissionPlans` hooks, existing inline-modal pattern in `PlanList`. Copy in Mexican Spanish, no long dashes. One commit per step. Usage lists before any route, column or shared-type change (see Q6).

## 6. Open questions

**Phase 1c findings (read-only; DB has 1 organization, 7 memberships, 2 plans):**
- (a) Legacy rate, no active plan, no override: **0**. The only rate holder is Chlau, who has a hand-made override. Broader "rate and no rule valid now": 0.
- (b) Silent ties (2+ valid overrides, same scope): **0**.
- (c) Rules labeled "Migrado de commissionRate legacy": **0** (1 rule exists in total: Chlau's, empty label).
- (d) Memberships on an inactive plan: **0** (both plans active, 0 rules, 0 members).
- Extra: 2 PAGADO sales (2026-08-14, seller user 2, no rule) produced 0 commissions. Consistent with "no rule pays nothing". 2a is zero, so no business decision is pending on people who earned nothing, but this is a test database with one org; a production org could differ.
- Migration script: sets no `validFrom`, so schema default `now()` at run time (same timestamp class as the bug). Skips a member only if a GENERAL + SALE_TOTAL rule exists (any date, any label). It does NOT skip members with a GENERAL + PROFIT, category or group override, nor members with a plan. Since the resolver ignores basis when ranking, a GENERAL + PROFIT override plus the migrated GENERAL + SALE_TOTAL rule tie, and the newer `validFrom` (the migrated one) wins, with only a log warning. Re-running is idempotent. Not run, per instruction.
- Override edit ("Revisar") does use `validFrom: new Date()` (`commission-plans.service.ts:105`), so it has the same bug class. Add rule and add override do not close the previous rule today.
- Pay flow: web only exposes single "Pagar". `PATCH /commissions/pay-batch` exists and `usePayCommissionBatch` exists, unused.

**Decisions needed (recommendation first):**
- Q1 Card inclusion once the rate filter goes. Today Chlau (ADMINISTRADOR) appears only because of `commissionRate`; without a change he vanishes. Recommend: role TECNICO/VENDEDOR, or any rule (plan or override), or any commission row.
- Q2 (DECIDED) Preview uses the end of that day in org timezone. Chlau's legacy row (12:10 local) then resolves for 2026-09-21. Real sales keep their exact timestamp.
- Q3 (DONE in PR A) The API rejects a `validFrom` day before today; future days are allowed ("Programada"). Non-goal: no retroactive commissions.
- Q4 Close-on-add matches scope type and value regardless of basis (the resolver ignores basis). Apply to plan rules too? Recommend yes, same tie risk.
- Q5 (FOLLOW-UP) `markAsPaid` and `markManyAsPaid` have no status guard. Risk today: LOW. It cannot break the screen and moves no money (no Caja), but a stale tab or double click on "Pagar" rewrites `paidAt` on an already paid row, and a refund (negative) row can be marked paid. Can wait for PR B; must land before batch pay. Fix: `PENDIENTE`-only guard.
- Q6 (CHANGED) `commissionRate` stays in the `/commissions/summary` response in PR A (deprecated, additive) so the API can deploy before the web PR. Producer `commissions.service.ts` (getSummary); the only web readers were the card and the Usuarios column, both removed in PR A. Removing the field from the response is a follow-up after the web PR is deployed. DTOs, column and script untouched.
- Q7 (FOLLOW-UP, decide whether it waits for PR B) Risk today: HIGH once a row exists. `commissions/page.tsx:245` renders `commission.ticket.folio`, and `ticket` is null for retail lines (`ticketId` is nullable; `generateForLine` writes `ticketId: line.ticketId ?? null`). The first retail commission row (any paid retail sale by Chlau, who now has a 5% rule) throws a TypeError, and the whole Comisiones screen falls to the root `error.tsx`. Not visible today because there are 0 commission rows. Read from the code, not reproduced in the browser (no writes allowed). Fix is one null-safe line; recommend shipping it separately before PR B.
- Q8 Fourth location of the legacy rate: the create-user modal (`users/page.tsx:889-911`, copy "Porcentaje aplicado al subtotal de comisiones"). Recommend removing it too.
- Q9 `.worktrees/comisiones-personalizadas` is a stale copy of the API (files differ from `src/`). It will not be touched and grep results from it will be ignored.
- Q10 Git is broken (Xcode CLI tools), so per-step commits and rollback points are blocked until it is fixed.

## 7. Follow-ups (not in PR A)

| Item | Risk today | Notes |
|---|---|---|
| Q7 null `commission.ticket` in the table | High once a retail commission exists | One-line fix; recommend not waiting for PR B |
| Q5 pay status guard | Low (audit date only, no money moves) | Required before batch pay |
| Remove `commissionRate` from the summary response | None | After the web PR is deployed |
| `Organization.timezone` is unused outside commissions | None | Tech debt, no repo-wide refactor |
| Plan "Rol" field, empty states, Spanish copy, one date format, filters, batch pay | UX | PR B |
| Card inclusion also covers an assigned INACTIVE plan | None | Deliberate superset of "active plan" so the inactive-plan warning stays visible; one line in `getSummary` if you want the strict version |
| Legacy rule revised the same day it was created | Cosmetic | Old rule ends 1 ms before start of day, so its range reads inverted; status shows "Vencida" |
