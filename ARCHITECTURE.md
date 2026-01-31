# ARCHITECTURE.md

## System Structure
Modular Monolith built with NestJS.

### Core Components
- **`src/app.module.ts`**: Root module, imports all feature modules.
- **`src/prisma`**: Database connection module.
- **`src/auth`**: Authentication logic (Guards, Strategies).
- **Feature Modules**: `sales`, `customers`, `tickets`, `stock`, `cash`, `reports`. Each contains:
    - `*.controller.ts`: API Endpoints.
    - `*.service.ts`: Business Logic.
    - `*.module.ts`: Dependency Injection config.
    - `dto/`: Data Transfer Objects for validation.

## Responsibility Boundaries
- **Controller**: Validate input (DTOs), Parse params, Call Service, Return DTO/Response.
- **Service**: Implement business rules, Call Prisma Repository, Handle Errors.
- **Prisma Schema**: Define Data Model and relations.
- **Guards**: Handle Authorization (e.g., `JwtAuthGuard`).
- **Interceptors**: Transform response data (serialization).

## Data Flow
1.  **Request**: HTTP Request hits Controller.
2.  **Guard**: Auth Guard validates JWT (if protected).
3.  **Validation**: ValidationPipe validates Request Body against DTO.
4.  **Logic**: Controller calls Service method.
5.  **Data Access**: Service calls Prisma Client.
6.  **DB**: Prisma executes SQL query on Supabase PostgreSQL.
7.  **Response**: Data returns up the stack, is serialized, and sent as JSON.

## Structural Decisions
- **NestJS Modules**: Enforced separation of features.
- **Prisma**: Type-safe DB access.
- **Supabase**: Managed Postgres + Auth (Used for Admin access/Role Key).
- **Swagger**: Auto-generated API documentation accessible at `/docs`.
