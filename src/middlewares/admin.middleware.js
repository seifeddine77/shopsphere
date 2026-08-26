/**
 * Role-based authorization gate.
 * MUST be chained after authMiddleware.protect (which populates req.user).
 */
const { forbidden } = require('../utils/errors');

function adminOnly(req, _res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return next(forbidden('Administrator access required'));
  }
  return next();
}

module.exports = { adminOnly };
