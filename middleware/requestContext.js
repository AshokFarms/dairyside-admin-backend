// Attaches a correlation id and a request-scoped logger to every request, and
// logs completion with status + duration. Keeps handlers free of logging noise.
const { randomUUID } = require('crypto');
const logger = require('../utils/logger');

function requestContext(req, res, next) {
  const requestId = req.headers['x-request-id'] || randomUUID();
  req.requestId = requestId;
  req.log = logger.child({ requestId, method: req.method, path: req.originalUrl });
  res.setHeader('x-request-id', requestId);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    req.log.info('request.completed', { status: res.statusCode, durationMs: Math.round(ms) });
    logger.flush(requestId);
  });
  
  res.on('close', () => {
    logger.flush(requestId);
  });

  next();
}

module.exports = requestContext;
