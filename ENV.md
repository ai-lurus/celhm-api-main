# ENV.md

## Required Environment Variables

| Variable | Description | Source | Default |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL Connection String (Direct/Transaction Mode) | Supabase Settings | - |
| `DIRECT_URL` | Direct PostgreSQL Connection (Required for migrations) | Supabase Settings | - |
| `SUPABASE_URL` | Supabase Project URL | Supabase Settings | - |
| `SUPABASE_SECRET_KEY` | Service Role Key (Admin Access) | Supabase Settings | - |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role JWT Token | Supabase Settings | - |
| `API_PORT` | Port for the NestJS server | Local Config | `3001` |

## Optional Environment Variables

| Variable | Description | Source |
| :--- | :--- | :--- |
| `SHADOW_DATABASE_URL`| Separate DB for Prisma Migrations (Recommended) | Supabase/Local Postgres |
| `NODE_ENV` | Environment mode (development/production) | Runtime Config |

## Environment Context

### Development
-   **File**: `.env`
-   **Notes**: Use the "Direct Connection" string (port 5432) for running migrations locally.
-   **Database URL**: Can use pooler (port 6543) for app, but direct connection (port 5432) for migrations.

### Production
-   **File**: `.env.production` (template provided)
-   **Notes**: 
    - **MUST** use Direct Connection (port 5432) for migrations
    - Can use Transaction Pooler (port 6543) for running the app
    - Never commit this file with real credentials
-   **Migration Command**: `DATABASE_URL="your_production_url" pnpm run db:migrate`

## Migration Commands

| Command | Description | Environment |
| :--- | :--- | :--- |
| `pnpm run db:migrate` | Deploy migrations (production) | Production |
| `pnpm run db:migrate:dev` | Create and apply migrations | Development |
| `pnpm run db:generate` | Generate Prisma Client | All |
| `pnpm run db:push` | Sync schema without migrations | Development only |
| `pnpm run db:studio` | Open Prisma Studio | All |

## Prohibitions
-   **Default Secrets**: Never use default secrets in production.
-   **Commit**: Never commit `.env` or `.env.production` files to version control.
-   **db:push in Production**: Never use `db:push` in production, always use `db:migrate`.
-   **Pooler for Migrations**: Never use connection pooler URLs for running migrations.
