# CELHM API

API REST para el sistema de gestión de talleres de reparación de celulares.

## Versión

**v1.0.1** - Build optimizado y limpieza de archivos temporales

## Stack Tecnológico

- **NestJS** - Framework Node.js
- **PostgreSQL** - Base de datos
- **Prisma** - ORM
- **JWT** - Autenticación
- **Swagger** - Documentación API

## Requisitos

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Proyecto en Supabase (Existente)

## Instalación

1. **Instalar dependencias**

```bash
pnpm install
```

2. **Configurar variables de entorno**

Crea un archivo `.env` en la raíz del proyecto:

```bash
touch .env
```

Agrega las siguientes variables. Es crucial usar la **Conexión Directa** (Puerto 5432) para que las migraciones funcionen correctamente desde tu entorno local, aunque la aplicación soporte Pooler en producción.

```env
# Supabase > Settings > Database > Connection string > Direct connection
# El formato debe ser: postgresql://[user]:[password]@db.[ref].supabase.co:5432/postgres
DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres?sslmode=require"

# Opcional, solo si necesitas generar migraciones que requieren shadow db
# SHADOW_DATABASE_URL=""

# JWT Secret para firmar tokens
JWT_SECRET="super-secret"

# Puerto (Opcional, default 3001)
API_PORT=3001
```

3. **Generar cliente de Prisma**

Como la base de datos ya existe, solo necesitamos generar el cliente:

```bash
pnpm db:generate
```

> **Nota**: No ejecutes `pnpm db:migrate` a menos que tengas cambios locales en el schema que quieras aplicar a la base de datos remota de Supabase.

## Desarrollo

Inicia el servidor de desarrollo:

```bash
pnpm dev
```

- API: http://localhost:3001
- Documentación (Swagger): http://localhost:3001/docs
- Prisma Studio: `pnpm db:studio` (Para visualizar datos)

## Scripts Disponibles

- `pnpm dev` - Inicia servidor en modo desarrollo
- `pnpm build` - Compila el proyecto
- `pnpm db:generate` - Genera el cliente de Prisma (Ejecutar tras cambios en .env o schema)
- `pnpm db:studio` - Abre interfaz visual para la BD
- `pnpm test` - Ejecuta tests
- `pnpm lint` - Ejecuta linter

## Estructura del Proyecto

```
celhm-api-main/
├── src/
│   ├── auth/          # Autenticación
│   ├── customers/     # Gestión de clientes
│   ├── sales/         # Ventas
│   ├── cash/          # Caja y cortes
│   ├── tickets/       # Órdenes de reparación
│   ├── stock/         # Inventario
│   ├── catalog/       # Catálogo de productos
│   ├── reports/       # Reportes
│   └── common/        # Utilidades compartidas
├── prisma/
│   ├── schema.prisma  # Schema de base de datos
│   └── migrations/    # Migraciones
└── test/              # Tests
```

## Variables de Entorno

Ver `env.example` para la lista completa de variables requeridas.

Las principales son:
- `DATABASE_URL` - URL de conexión a PostgreSQL
- `SHADOW_DATABASE_URL` - URL de base de datos shadow para migraciones
- `JWT_SECRET` - Secret para JWT tokens
- `API_PORT` - Puerto del servidor (default: 3001)

## Documentación

La documentación de la API está disponible en `/docs` cuando el servidor está corriendo.
