// Centralized, validated configuration. Loaded once at startup; if a required
// variable is missing the process exits immediately (fail fast) rather than
// throwing an obscure error on the first DB call or request.
require('dotenv').config();

const REQUIRED = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

function loadConfig() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`[config] Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  return {
    env: process.env.NODE_ENV || 'development',
    isProd: (process.env.NODE_ENV || 'development') === 'production',
    port: Number(process.env.PORT) || 5001,

    db: {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    },

    // Comma-separated list of allowed browser origins for the admin panel.
    corsOrigins: (process.env.ADMIN_CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),

    // Auth seam. Admin login is intentionally OFF for now (see middleware/adminGuard.js).
    // Flip ADMIN_AUTH_ENABLED=true once an auth strategy is wired to enforce it.
    auth: {
      enabled: process.env.ADMIN_AUTH_ENABLED === 'true',
      // Allowlist of admin Firebase UIDs, used only when auth is enabled.
      adminUids: (process.env.ADMIN_UIDS || '')
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean),
    },

    rateLimit: {
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
      max: Number(process.env.RATE_LIMIT_MAX) || 300,
    },

    // Inventory / real-time. After an admin stock change we notify the CUSTOMER
    // backend (separate process, same DB) so it can broadcast to connected
    // shoppers over Socket.IO. Both must share INTERNAL_STOCK_SECRET.
    stock: {
      customerApiUrl: process.env.CUSTOMER_API_URL || '',
      internalSecret: process.env.INTERNAL_STOCK_SECRET || '',
      defaultLowStockThreshold: Number(process.env.LOW_STOCK_THRESHOLD) || 10,
    },

    logLevel: process.env.LOG_LEVEL || 'info',
  };
}

module.exports = loadConfig();
