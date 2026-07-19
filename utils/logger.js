// Minimal structured (JSON-line) logger with levels and request context.
// No external dependency — keeps the admin API lean while still emitting
// machine-parseable logs with a correlation id per request.
const config = require('../config/env');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

function emit(level, message, meta) {
  if (LEVELS[level] > threshold) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta && typeof meta === 'object' ? meta : meta !== undefined ? { detail: meta } : {}),
  };
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify(line)}\n`);
}

const logger = {
  error: (msg, meta) => emit('error', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  debug: (msg, meta) => emit('debug', msg, meta),
  /** Return a logger bound to a request's correlation id + method/path. */
  child: (ctx) => ({
    error: (msg, meta) => emit('error', msg, { ...ctx, ...meta }),
    warn: (msg, meta) => emit('warn', msg, { ...ctx, ...meta }),
    info: (msg, meta) => emit('info', msg, { ...ctx, ...meta }),
    debug: (msg, meta) => emit('debug', msg, { ...ctx, ...meta }),
  }),
};

module.exports = logger;
