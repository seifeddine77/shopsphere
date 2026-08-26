const crypto = require('crypto');
const User = require('../models/User');
const config = require('../config/environment');
const {
  signAccessToken,
} = require('../utils/jwt');
const { conflict, badRequest, unauthorized, forbidden } = require('../utils/errors');
const { compareAgainstDummyHash } = require('../utils/password');
const logger = require('../config/logger');
const emailService = require('./email.service');

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MINUTES = 15;

/* --------------------------------- Register ------------------------------ */

async function register(userData) {
  const existing = await User.findOne({ email: userData.email });
  if (existing) {
    throw conflict('An account with this email already exists');
  }

  // role/isActive are never taken from client input
  const user = await User.create({
    firstName: userData.firstName,
    lastName: userData.lastName,
    email: userData.email,
    password: userData.password,
    phone: userData.phone || '',
  });

  const token = signAccessToken(user._id);
  setImmediate(() => {
    emailService.sendWelcomeEmail(user).catch((error) => logger.error(`Welcome email failed: ${error.message}`));
  });

  return { user: user.toJSON(), token };
}

/* ---------------------------------- Login -------------------------------- */

async function login(email, plainPassword) {
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    // Equalize timing with the found-user path
    await compareAgainstDummyHash(plainPassword);
    throw unauthorized('Invalid email or password');
  }

  const passwordMatches = await user.comparePassword(plainPassword);
  if (!passwordMatches) {
    throw unauthorized('Invalid email or password');
  }

  if (!user.isActive) {
    throw forbidden('This account has been deactivated');
  }

  const token = signAccessToken(user._id);
  return { user: user.toJSON(), token };
}

/* ------------------------------ Password reset --------------------------- */

function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generates a reset token, stores only its SHA-256 hash and emails the raw link.
 * Returns false when the email is unknown - callers respond identically either
 * way so accounts cannot be enumerated.
 */
async function requestPasswordReset(email) {
  const user = await User.findOne({ email });
  if (!user) return false;

  const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
  user.resetPasswordToken = hashResetToken(rawToken);
  user.resetPasswordExpires = new Date(
    Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000,
  );
  await user.save();

  const resetUrl = `${config.appUrl}/auth/reset-password/${rawToken}`;
  setImmediate(() => {
    emailService
      .sendPasswordResetEmail(user, resetUrl, RESET_TOKEN_TTL_MINUTES)
      .catch((error) => logger.error(`Reset email failed: ${error.message}`));
  });

  return true;
}

/** Consumes a valid raw token and sets the new password */
async function resetPassword(rawToken, newPassword) {
  const hashedToken = hashResetToken(rawToken);

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: new Date() },
  }).select('+resetPasswordToken +resetPasswordExpires +password');

  if (!user) {
    throw badRequest('This password reset link is invalid or has expired');
  }

  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  return user.toJSON();
}

module.exports = {
  register,
  login,
  requestPasswordReset,
  resetPassword,
  RESET_TOKEN_TTL_MINUTES,
};
