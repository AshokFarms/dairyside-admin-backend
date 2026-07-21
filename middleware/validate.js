// Boundary validation using Joi. Rejects bad payloads with a clean 400 (listing
// the offending fields) BEFORE any DB work. Also strips unknown keys and applies
// coercion/defaults, so controllers receive a trusted, normalized value.
const { ApiError } = require('./errorHandler');

/**
 * @param {import('joi').Schema} schema
 * @param {'body'|'query'|'params'} source
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { value, error } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      const details = error.details.map((d) => ({ field: d.path.join('.'), message: d.message }));
      return next(new ApiError(400, 'Validation failed', details));
    }
    // Express 5 exposes `req.query` as a GETTER-ONLY property: a plain
    // assignment is silently swallowed, so Joi's coercion/defaults/stripUnknown
    // would never reach the controller (a query `?flag=false` would arrive as
    // the STRING "false", which is truthy). Redefine the property instead.
    if (source === 'query') {
      Object.defineProperty(req, 'query', {
        value,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } else {
      req[source] = value;
    }
    return next();
  };
}

module.exports = validate;
