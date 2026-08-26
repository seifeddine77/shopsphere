const router = require('express').Router();
const { rateLimit } = require('express-rate-limit');

const authController = require('../controllers/auth.controller');
const { validate } = require('../middlewares/validation.middleware');
const { protect } = require('../middlewares/auth.middleware');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('../validators/auth.validator');

/* --------------------------- Rate limiters ------------------------------ */

/** Login: stricter limit keyed by IP + attempted email */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => `${req.ip}:${(req.body && req.body.email) || ''}`.toLowerCase(),
  message: {
    success: false,
    message: 'Too many login attempts. Please try again in 15 minutes.',
    errors: [],
  },
});

/** Other auth actions: moderate limit per IP */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many attempts. Please try again later.',
    errors: [],
  },
});

/* ------------------------------- Routes --------------------------------- */

router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', loginLimiter, validate(loginSchema), authController.login);
router.post('/logout', authController.logout);
router.get('/me', protect, authController.me);
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), authController.resetPassword);

module.exports = router;
