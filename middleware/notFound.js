// 404 for any unmatched route, funneled through the standard error envelope.
const { ApiError } = require('./errorHandler');

function notFound(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

module.exports = notFound;
