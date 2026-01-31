# ENV.md

## Required Environment Variables

| Variable | Description | Source | Default |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL Connection String (Direct/Transaction Mode) | Supabase Settings | - |
| `SUPABASE_URL` | Supabase Project URL | Supabase Settings | - |
| `SUPABASE_SECRET_KEY` | Service Role Key (Admin Access) | Supabase Settings | - |
| `API_PORT` | Port for the NestJS server | Local Config | `3001` |

## Optional Environment Variables

| Variable | Description | Source |
| :--- | :--- | :--- |
| `SHADOW_DATABASE_URL`| Separate DB for Prisma Migrations (Recommended) | Supabase/Local Postgres |

## Environment Context

### Development
-   **File**: `.env`
-   **Notes**: Use the "Direct Connection" string (port 5432) for running migrations locally.

### Production
-   **File**: Cloud Provider (Render/Railway/etc.)
-   **Notes**: Can use Transaction Pooler string (port 6543) for running the app, but Direct Connection is required for migrations.

## Prohibitions
-   **Default Secrets**: Never use default secrets in production.
-   **Commit**: Never commit `.env` file to version control.
