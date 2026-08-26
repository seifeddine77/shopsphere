const { unprocessable } = require('../utils/errors');

/**
 * Factory middleware validating req[source] against a Joi schema.
 * On success the sanitized value replaces the original payload.
 *
 * Usage: router.post('/x', validate(schema), handler)
 *        router.get('/x', validate(schema, 'params'), handler)
 */
function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const { value, error } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const fieldErrors = error.details.map((detail) => ({
        field: detail.path.join('.') || source,
        message: detail.message,
      }));
      return next(unprocessable('Validation failed', fieldErrors));
    }

    req[source] = value;
    return next();
  };
}

module.exports = { validate };
