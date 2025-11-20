const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config({ path: "./config.env" });

const {
  testConnection,
  getTables,
  getTableData,
  insertData,
  updateData,
  deleteData,
} = require("./config/database");

const app = express();
const PORT = process.env.PORT || 3001;

// Configuración de seguridad
app.use(helmet());

// Configuración de CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "https://celhm.wardapp.com.mx",
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por ventana
});
app.use(limiter);

// Middleware para parsear JSON
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Middleware de logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Ruta de prueba de conexión
app.get("/api/connection", async (req, res) => {
  try {
    const result = await testConnection();
    res.json({
      success: result.success,
      message: result.message,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Ruta para obtener todas las tablas
app.get("/api/tables", async (req, res) => {
  try {
    const result = await getTables();
    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        count: result.data.length,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Ruta para obtener datos de una tabla específica
app.get("/api/:table", async (req, res) => {
  try {
    const { table } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const result = await getTableData(table, parseInt(limit), parseInt(offset));
    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        count: result.data.length,
        table: table,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Ruta para insertar datos
app.post("/api/:table", async (req, res) => {
  try {
    const { table } = req.params;
    const data = req.body;

    const result = await insertData(table, data);
    if (result.success) {
      res.status(201).json({
        success: true,
        message: "Datos insertados correctamente",
        data: result.data,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Ruta para actualizar datos
app.put("/api/:table/:id", async (req, res) => {
  try {
    const { table, id } = req.params;
    const data = req.body;
    const whereCondition = { id: id };

    const result = await updateData(table, data, whereCondition);
    if (result.success) {
      res.json({
        success: true,
        message: "Datos actualizados correctamente",
        data: result.data,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Ruta para eliminar datos
app.delete("/api/:table/:id", async (req, res) => {
  try {
    const { table, id } = req.params;
    const whereCondition = { id: id };

    const result = await deleteData(table, whereCondition);
    if (result.success) {
      res.json({
        success: true,
        message: "Datos eliminados correctamente",
        data: result.data,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Ruta de estado del servidor
app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    message: "CelHM API funcionando correctamente",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Ruta raíz
app.get("/", (req, res) => {
  res.json({
    success: true,
    message:
      "CelHM API - Sistema de Gestión para Accesorios y Reparación de Celulares",
    version: "1.0.0",
    endpoints: {
      connection: "/api/connection",
      tables: "/api/tables",
      tableData: "/api/:table",
      status: "/api/status",
    },
  });
});

// Middleware para manejar rutas no encontradas
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Ruta no encontrada",
  });
});

// Middleware para manejar errores
app.use((error, req, res, next) => {
  console.error("Error:", error);
  res.status(500).json({
    success: false,
    error: "Error interno del servidor",
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 CelHM API iniciada en puerto ${PORT}`);
  console.log(`📊 Entorno: ${process.env.NODE_ENV || "development"}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
});

module.exports = app;
