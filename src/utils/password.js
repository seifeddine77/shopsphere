const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * Pre-computed hash used to equalize response time when a login attempt
 * targets a non-existent email (timing-attack mitigation).
 * Computed lazily so application boot stays fast.
 */
let dummyHashPromise = null;
function compareAgainstDummyHash(plain) {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash(
      'timing-equalizer-placeholder-value',
      SALT_ROUNDS,
    );
  }
  return dummyHashPromise.then((hash) => bcrypt.compare(plain, hash));
}

module.exports = { hashPassword, comparePassword, compareAgainstDummyHash };
