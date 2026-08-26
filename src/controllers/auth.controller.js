const authService = require('../services/auth.service');
const { AUTH_COOKIE, authCookieOptions } = require('../utils/jwt');
const { sendSuccess } = require('../utils/response');

/**
 * POST /api/auth/register
 */
async function register(req, res, next) {
  try {
    const { user, token } = await authService.register(req.body);
    res.cookie(AUTH_COOKIE, token, authCookieOptions());
    return sendSuccess(res, {
      status: 201,
      message: 'Account created successfully. Welcome!',
      data: { user },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const { user, token } = await authService.login(req.body.email, req.body.password);
    res.cookie(AUTH_COOKIE, token, authCookieOptions());
    return sendSuccess(res, {
      message: 'Logged in successfully',
      data: { user },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/auth/logout
 * Stateless JWT: clearing the cookie is the entire logout.
 */
function logout(req, res) {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
  return sendSuccess(res, { message: 'Logged out successfully' });
}

/**
 * GET /api/auth/me - current session profile
 */
function me(req, res) {
  return sendSuccess(res, {
    message: 'Current user',
    data: { user: req.user.toJSON() },
  });
}

/**
 * POST /api/auth/forgot-password
 * Identical response whether or not the account exists (anti-enumeration).
 */
async function forgotPassword(req, res, next) {
  try {
    await authService.requestPasswordReset(req.body.email);
    return sendSuccess(res, {
      message: 'If an account exists for this email, a reset link has been sent.',
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/auth/reset-password
 */
async function resetPassword(req, res, next) {
  try {
    await authService.resetPassword(req.body.token, req.body.password);
    return sendSuccess(res, {
      message: 'Password updated successfully. You can now log in.',
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  login,
  logout,
  me,
  forgotPassword,
  resetPassword,
};
