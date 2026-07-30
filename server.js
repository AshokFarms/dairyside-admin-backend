const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
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
// Deliberately NO urlencoded parser: keeping this API json-only means a
// cross-site form post can never produce a parseable body, which is what makes
// the SameSite=None session cookie safe (see adminAuth.service.js).
app.use(cookieParser());
app.use(requestContext);

// Rate limiting on the admin surface.
const adminLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
});

// Liveness — no auth, no rate limit, NO DB. This is what Render's health check
// pings: it answers "is the process up and serving?" so a transient DB blip
// can't trigger a restart loop. Always 200 while the server is running.
app.get('/health', (req, res) => {
  res.status(200).json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
});

// Readiness — the DEEP check (DB reachable). Use this for monitoring/debugging,
// not as the Render health-check path. 503 when the DB is unreachable.
app.get('/health/db', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ success: true, data: { status: 'ok', db: 'connected' } });
  } catch (err) {
    res.status(503).json({ success: false, error: 'Database unavailable' });
  }
});

// Sign-in surface. Mounted BEFORE the guarded tree because these three routes
// are the ones an unauthenticated caller is allowed to reach.
app.use('/v1/admin/auth', require('./routes/adminAuthRoutes'));

// Process-to-process bridge from the customer backend (shared-secret auth).
// Also outside the guarded tree — the caller is a server, not a signed-in admin.
app.use('/v1/admin/internal', require('./routes/internalRoutes'));

// Primary admin API — everything here is behind adminGuard (see routes/index.js).
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
  // Wrap Express in an HTTP server so Socket.IO can share the port. REST is
  // unaffected; the socket only adds a push channel for the panel.
  const http = require('http');
  const { initSocket } = require('./services/socket');

  const httpServer = http.createServer(app);
  initSocket(httpServer);

  const server = httpServer.listen(config.port, () => {
    logger.info('server.started', { port: config.port, env: config.env });
    // Make the open posture impossible to deploy by accident unnoticed.
    if (!config.auth.enabled) {
      logger.warn('admin.auth_DISABLED', {
        detail: 'Every /v1/admin route is reachable WITHOUT authentication. ' +
          'Set ADMIN_AUTH_ENABLED=true and ADMIN_UIDS=<firebase uid> to close it.',
      });
    } else if (config.auth.adminUids.length === 0) {
      logger.error('admin.auth_MISCONFIGURED', {
        detail: 'ADMIN_AUTH_ENABLED=true but ADMIN_UIDS is empty — every request will be rejected.',
      });
    } else if (!require('./config/firebaseAdmin').isAvailable()) {
      // Auth enforced with no way to verify anyone = a locked-out deployment
      // where every route 401s and no password can ever work. Say so at boot
      // rather than leaving it to be discovered through failed sign-ins.
      logger.error('admin.auth_NO_CREDENTIALS', {
        detail: 'ADMIN_AUTH_ENABLED=true but Firebase credentials are missing — nobody can sign in. ' +
          'Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.',
      });
    }
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
