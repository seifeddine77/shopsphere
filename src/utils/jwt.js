const jwt = require('jsonwebtoken');
const config = require('../config/environment');
const { unauthorized } = require('./errors');

const AUTH_COOKIE = 'token';

/** Parse duration strings like "30m", "12h", "7d" into milliseconds */
function parseDurationMs(duration) {
  const match = /^(\d+)([smhd])$/.exec(String(duration));
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return Number(match[1]) * multipliers[match[2]];
}

function signAccessToken(userId) {
  return jwt.sign({ id: userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (error) {
    throw unauthorized('Your session is invalid or has expired');
  }
}

function authCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: parseDurationMs(config.jwtExpiresIn),
  };
}

module.exports = { AUTH_COOKIE, signAccessToken, verifyAccessToken, authCookieOptions };
