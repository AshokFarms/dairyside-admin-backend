const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const config = require('./config/env');
const pool = require('./config/database');
const logger = require('./utils/logger');
const requestContext = require('./middleware/requestContext');
const { errorHandler } = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');

// Route trees
const adminRoutes = require('./routes'); // /v1/admin/*
const legacyCategories = require('./routes/categoryRoutes'); // kept alias
const legacyProducts = require('./routes/productRoutes'); // kept alias

const app = express();

// Behind a load balancer / proxy — trust it so rate-limit sees real client IPs.
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS locked to known admin origins, credentials enabled for future cookie auth.
app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin/non-browser (no Origin header) and whitelisted origins.
      if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(requestContext);

// Rate limiting on the admin surface.
const adminLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
});

// Health check — no auth, no rate limit. Verifies DB connectivity.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
  } catch (err) {
    res.status(503).json({ success: false, error: 'Database unavailable' });
  }
});

// Primary admin API.
app.use('/v1/admin', adminLimiter, adminRoutes);

// Backward-compatible aliases for the already-wired frontend redux slices
// (axiosConfig → :PORT/api/products|categories). Unchanged behavior.
app.use('/api/categories', adminLimiter, legacyCategories);
app.use('/api/products', adminLimiter, legacyProducts);

// 404 + centralized error handling (must be last).
app.use(notFound);
app.use(errorHandler);

// Only bind a port when run directly (`node server.js`). When required by tests
// (supertest drives the app object in-process) we skip listen + signal handlers.
if (require.main === module) {
  const server = app.listen(config.port, () => {
    logger.info('server.started', { port: config.port, env: config.env });
  });

  // ── Graceful shutdown ──
  const shutdown = (signal) => {
    logger.info('server.shutdown', { signal });
    server.close(async () => {
      try {
        await pool.end();
      } catch (err) {
        logger.error('pool.close_failed', { message: err.message });
      }
      process.exit(0);
    });
    // Force-exit if connections don't drain in time.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection', { message: reason?.message || String(reason) });
  });
}

module.exports = app;
