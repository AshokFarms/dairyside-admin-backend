// Single shared, pooled MySQL connection for the whole admin API.
// Exports the pool directly (unchanged interface) so existing models keep
// working; server.js calls pool.end() on shutdown for a graceful close.
const mysql = require('mysql2/promise');
const config = require('./env');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  ssl: { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: 'Z', // store/read in UTC; business tz handling stays in app logic
});

// Verify connectivity at startup (does not block export).
pool
  .getConnection()
  .then((connection) => {
    logger.info('db.connected', { host: config.db.host, database: config.db.database });
    connection.release();
  })
  .catch((err) => {
    logger.error('db.connection_failed', { message: err.message });
  });

module.exports = pool;
