# CelHM API Backend - README

## 🚀 API REST para CelHM en Render

Backend de la API REST para el sistema de gestión de CelHM, optimizado para despliegue en Render.

## 📁 Estructura del Proyecto

```
backend/
├── server.js              # Servidor principal
├── package.json           # Dependencias Node.js
├── config.env             # Variables de entorno
├── render.yaml            # Configuración Render
├── .gitignore             # Archivos a ignorar
├── setup-database.sql     # Script SQL
└── config/
    └── database.js        # Configuración MySQL
```

## 🛠️ Configuración para Render

### Variables de Entorno en Render:

```env
PORT=10000
DB_HOST=<host público de tu MySQL en el hosting>
DB_NAME=wardappc_app
DB_USER=wardappc_apiuser
DB_PASS=********
API_TOKEN=<algo-largo>
NODE_ENV=production
CORS_ORIGIN=https://celhm.wardapp.com.mx
```

### Configuración del Servicio en Render:

1. **Tipo de Servicio:** Web Service
2. **Build Command:** `npm install`
3. **Start Command:** `node server.js`
4. **Puerto:** 10000

## 📡 Endpoints Disponibles

- `GET /` - Información de la API
- `GET /api/status` - Estado del servidor
- `GET /api/connection` - Prueba de conexión BD
- `GET /api/tables` - Listar tablas
- `GET /api/:table` - Obtener datos
- `POST /api/:table` - Insertar datos
- `PUT /api/:table/:id` - Actualizar datos
- `DELETE /api/:table/:id` - Eliminar datos

## 🔧 Desarrollo Local

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
# Editar config.env con tus credenciales

# Iniciar servidor
npm start

# Desarrollo con nodemon
npm run dev
```

## 🚀 Despliegue en Render

1. **Conectar repositorio** a Render
2. **Configurar variables de entorno** en el dashboard
3. **Deploy automático** en cada push

## 🔒 Seguridad

- ✅ **API Token** para autenticación
- ✅ **CORS** configurado para dominio específico
- ✅ **Rate Limiting** (100 requests/15min)
- ✅ **Helmet.js** para headers de seguridad
- ✅ **Pool de conexiones** MySQL

## 📊 Monitoreo

- Logs automáticos en Render
- Métricas de rendimiento
- Alertas de errores

## 🔗 URLs de Producción

- **API:** https://celhm-api.onrender.com
- **Estado:** https://celhm-api.onrender.com/api/status
- **Conexión:** https://celhm-api.onrender.com/api/connection

---

**CelHM API Backend v1.0.0** - Optimizado para Render
