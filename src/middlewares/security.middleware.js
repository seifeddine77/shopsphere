const { forbidden } = require('../utils/errors');

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defense-in-depth via Origin/Referer verification (OWASP recommended).
 *
 * Our session cookie is SameSite=Lax + HttpOnly; this guard additionally
 * rejects browser-initiated cross-origin state-changing requests.
 * Non-browser clients (curl, tests) send no Origin/Referer and pass through.
 */
function sameOriginGuard(req, res, next) {
  if (!UNSAFE_METHODS.has(req.method)) return next();

  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return next(); // not a browser request

  try {
    const originHost = new URL(origin).host;
    if (originHost === req.headers.host) return next();
  } catch (_error) {
    // Malformed header falls through to rejection
  }

  return next(forbidden('Cross-origin request blocked'));
}

module.exports = { sameOriginGuard };
