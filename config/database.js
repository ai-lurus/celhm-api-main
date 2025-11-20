const mysql = require("mysql2/promise");
require("dotenv").config({ path: "./config.env" });

// Configuración de la base de datos
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "wardappc_apiuser",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "wardappc_app",
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
};

// Crear pool de conexiones
const pool = mysql.createPool(dbConfig);

// Función para probar la conexión
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("✅ Conexión a la base de datos exitosa");
    connection.release();
    return { success: true, message: "Conexión exitosa" };
  } catch (error) {
    console.error("❌ Error de conexión a la base de datos:", error.message);
    return { success: false, message: error.message };
  }
}

// Función para ejecutar consultas
async function executeQuery(sql, params = []) {
  try {
    const [rows] = await pool.execute(sql, params);
    return { success: true, data: rows };
  } catch (error) {
    console.error("Error en consulta:", error.message);
    return { success: false, error: error.message };
  }
}

// Función para obtener todas las tablas
async function getTables() {
  const sql = `
    SELECT 
      TABLE_NAME as name,
      TABLE_ROWS as rows,
      ROUND(((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024), 2) as size
    FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME
  `;

  return await executeQuery(sql, [process.env.DB_NAME]);
}

// Función para obtener datos de una tabla
async function getTableData(tableName, limit = 100, offset = 0) {
  const sql = `SELECT * FROM ${tableName} LIMIT ? OFFSET ?`;
  return await executeQuery(sql, [limit, offset]);
}

// Función para insertar datos
async function insertData(tableName, data) {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = columns.map(() => "?").join(", ");

  const sql = `INSERT INTO ${tableName} (${columns.join(
    ", "
  )}) VALUES (${placeholders})`;
  return await executeQuery(sql, values);
}

// Función para actualizar datos
async function updateData(tableName, data, whereCondition) {
  const setClause = Object.keys(data)
    .map((key) => `${key} = ?`)
    .join(", ");
  const whereClause = Object.keys(whereCondition)
    .map((key) => `${key} = ?`)
    .join(" AND ");

  const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
  const values = [...Object.values(data), ...Object.values(whereCondition)];

  return await executeQuery(sql, values);
}

// Función para eliminar datos
async function deleteData(tableName, whereCondition) {
  const whereClause = Object.keys(whereCondition)
    .map((key) => `${key} = ?`)
    .join(" AND ");
  const sql = `DELETE FROM ${tableName} WHERE ${whereClause}`;

  return await executeQuery(sql, Object.values(whereCondition));
}

module.exports = {
  pool,
  testConnection,
  executeQuery,
  getTables,
  getTableData,
  insertData,
  updateData,
  deleteData,
};
