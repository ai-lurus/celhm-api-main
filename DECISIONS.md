# DECISIONS.md

## Stack Decisions

### Framework: NestJS
-   **Status**: Accepted
-   **Date**: Unknown (Inferred from codebase)
-   **Tradeoffs**: Higher boilerplate/learning curve vs. standardized architecture and dependency injection.
-   **Rejected**: Express (too unopinionated), Fastify (formatting/plugin differences).

### Database: PostgreSQL (Supabase)
-   **Status**: Accepted
-   **Date**: Unknown
-   **Tradeoffs**: Relational integrity and tough schemas vs. NoSQL flexibility. Supabase adds managed convenience.
-   **Rejected**: MongoDB, MySQL.

### ORM: Prisma
-   **Status**: Accepted
-   **Date**: Unknown
-   **Tradeoffs**: Generated client and type safety vs. raw SQL performance tuning.
-   **Rejected**: TypeORM (complexity), Sequelize.

### Authentication: JWT (Passport)
-   **Status**: Accepted
-   **Date**: Unknown
-   **Tradeoffs**: Stateless auth vs. session management.
-   **Rejected**: Session-based auth.

## Implicit Decisions
-   **API Design**: RESTful design (Controllers map to resources).
-   **Documentation**: Swagger/OpenAPI auto-generated from DTOs and decorators.
-   **Language**: TypeScript (Enforced by NestJS).
