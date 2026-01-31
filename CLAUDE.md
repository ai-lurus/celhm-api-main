# CLAUDE.md

## Role
REST API Backend for CelHM (Cellular Repair Shop Management System).

## Stack
- **Framework**: NestJS 10+
- **Database**: PostgreSQL (via Supabase)
- **ORM**: Prisma 5.7+
- **Auth**: JWT, Passport
- **Documentation**: Swagger/OpenAPI
- **Package Manager**: pnpm

## Commands
- **Dev Server**: `pnpm dev` (Runs on http://localhost:3001)
- **Build**: `pnpm build`
- **Start Prod**: `pnpm start:prod`
- **Test (Unit)**: `pnpm test`
- **Test (E2E)**: `pnpm test:e2e`
- **Lint**: `pnpm lint`
- **DB Generate**: `pnpm db:generate` (Run after schema changes)
- **DB Studio**: `pnpm db:studio` (GUI for database)

## Rules
- **Modules**: Organize code by domain modules (e.g., `src/sales`, `src/auth`).
- **DTOs**: Use class-validator DTOs for all input validation.
- **Services**: Business logic goes in Services, not Controllers.
- **Controllers**: Handle HTTP request/response mapping only.
- **Env**: Never commit `.env`.
- **Async**: Use `async/await` for all DB operations.
- **Types**: Explicit return types for Controller and Service methods.

## Prohibitions
- Do not bypass Prisma for raw SQL unless necessary for performance.
- Do not use `console.log` (use NestJS Logger).
- Do not commit secrets/keys.
