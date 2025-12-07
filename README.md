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
- PostgreSQL

## Instalación

```bash
# Instalar dependencias
pnpm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Generar cliente de Prisma
pnpm db:generate

# Ejecutar migraciones
pnpm db:migrate
```

## Desarrollo

```bash
# Iniciar servidor de desarrollo
pnpm dev

# El servidor estará disponible en http://localhost:3001
# La documentación Swagger en http://localhost:3001/docs
```

## Scripts Disponibles

- `pnpm dev` - Inicia servidor en modo desarrollo
- `pnpm build` - Compila el proyecto
- `pnpm start:prod` - Inicia servidor en producción
- `pnpm db:generate` - Genera cliente de Prisma
- `pnpm db:migrate` - Ejecuta migraciones
- `pnpm db:push` - Sincroniza schema con BD (desarrollo)
- `pnpm db:studio` - Abre Prisma Studio
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
