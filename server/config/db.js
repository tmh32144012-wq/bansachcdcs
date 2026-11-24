const sql = require('mssql');
require('dotenv').config();

/**
 * Cấu hình kết nối Microsoft SQL Server với Connection Pool
 */
const dbConfig = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_DATABASE || 'BookstoreDB',
  port: parseInt(process.env.DB_PORT || '1433', 10),
  pool: {
    max: 20,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  options: {
    encrypt: false, // Đặt true nếu dùng Azure SQL
    trustServerCertificate: true, // Bắt buộc cho môi trường local Windows / Self-signed cert
    enableArithAbort: true,
  },
};

let poolPromise = null;

/**
 * Khởi tạo hoặc lấy Connection Pool hiện tại
 * @returns {Promise<sql.ConnectionPool>}
 */
const getPool = async () => {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(dbConfig)
      .connect()
      .then((pool) => {
        console.log(`[SQL Server] Đã kết nối thành công tới database: ${dbConfig.database}`);
        return pool;
      })
      .catch((err) => {
        poolPromise = null;
        console.error('[SQL Server] Lỗi kết nối cơ sở dữ liệu:', err.message);
        throw err;
      });
  }
  return poolPromise;
};

module.exports = {
  sql,
  getPool,
};

