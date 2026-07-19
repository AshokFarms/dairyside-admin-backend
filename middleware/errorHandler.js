// Centralized error handling. Controllers/services throw ApiError (or any Error);
// this is the single place that shapes the response. Never leaks stack traces or
// secrets to clients; full detail goes to the structured log.
const config = require('../config/env');
const logger = require('../utils/logger');

/** Operational error carrying an HTTP status. Use for expected 4xx cases. */
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

// Translate common MySQL driver errors into clean client-facing messages.
function mapDbError(err) {
  switch (err.code) {
    case 'ER_DUP_ENTRY':
      return new ApiError(409, 'A record with these details already exists');
    case 'ER_NO_REFERENCED_ROW_2':
    case 'ER_NO_REFERENCED_ROW':
      return new ApiError(400, 'Referenced record does not exist');
    case 'ER_ROW_IS_REFERENCED_2':
    case 'ER_ROW_IS_REFERENCED':
      return new ApiError(409, 'Record is in use and cannot be deleted');
    case 'ER_BAD_FIELD_ERROR':
      return new ApiError(400, 'Invalid field in request');
    default:
      return null;
  }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let error = err;
  if (!(error instanceof ApiError)) {
    const mapped = mapDbError(err);
    error = mapped || new ApiError(err.statusCode || 500, err.message || 'Internal Server Error');
    if (!mapped && !err.statusCode) error.isOperational = false;
  }

  const log = req.log || logger;
  const logMeta = { status: error.statusCode, code: err.code, stack: err.stack };
  if (error.statusCode >= 500) log.error(error.message, logMeta);
  else log.warn(error.message, { status: error.statusCode });

  const body = { success: false, error: error.statusCode >= 500 ? 'Internal Server Error' : error.message };
  if (error.details && error.statusCode < 500) body.details = error.details;
  if (!config.isProd && error.statusCode >= 500) body.debug = error.message;

  res.status(error.statusCode || 500).json(body);
}

module.exports = { errorHandler, ApiError };
