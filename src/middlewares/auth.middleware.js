const User = require('../models/User');
const { AUTH_COOKIE, verifyAccessToken } = require('../utils/jwt');
const { unauthorized } = require('../utils/errors');
const { isApiRequest } = require('../utils/request');

/**
 * Requires a valid session. Attaches req.user (full document).
 * API requests receive a JSON 401; page requests are redirected to login
 * with a ?redirect= parameter so the user lands back where they started.
 */
async function protect(req, res, next) {
  try {
    const token = req.cookies ? req.cookies[AUTH_COOKIE] : null;
    if (!token) throw unauthorized('Authentication required');

    const decoded = verifyAccessToken(token);

    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      res.clearCookie(AUTH_COOKIE);
      throw unauthorized('Your account no longer exists or has been disabled');
    }

    req.user = user;
    return next();
  } catch (error) {
    if (!isApiRequest(req)) {
      const target = req.originalUrl && !req.originalUrl.startsWith('/auth/') ? `?redirect=${encodeURIComponent(req.originalUrl)}` : '';
      return res.redirect(`/auth/login${target}`);
    }
    if (req.cookies && req.cookies[AUTH_COOKIE]) {
      res.clearCookie(AUTH_COOKIE);
    }
    return next(error.statusCode ? error : unauthorized('Authentication required'));
  }
}

/**
 * Attaches req.user when a valid session exists, never blocks.
 * Used on public pages so templates can personalize the navbar.
 */
async function optionalAuth(req, _res, next) {
  try {
    const token = req.cookies ? req.cookies[AUTH_COOKIE] : null;
    if (token) {
      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.id);
      if (user && user.isActive) {
        req.user = user;
      }
    }
  } catch (_error) {
    // Invalid/expired token on a public page: treat as anonymous
  }
  return next();
}

/**
 * Page-route variant of `protect`: redirects guests to the login page
 * (with a return path) instead of answering with a JSON 401.
 */
function requirePageAuth(req, res, next) {
  if (!req.user) {
    return res.redirect(`/auth/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }
  return next();
}

/**
 * Admin-only page guard. Guests go to login, non-admins back to the shop.
 */
function requirePageAdmin(req, res, next) {
  if (!req.user) {
    return res.redirect(`/auth/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }
  if (req.user.role !== 'ADMIN') {
    return res.redirect('/');
  }
  return next();
}

module.exports = { protect, optionalAuth, requirePageAuth, requirePageAdmin };
