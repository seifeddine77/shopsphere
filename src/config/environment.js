require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';

const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isDevelopment: nodeEnv === 'development',
  isTest: nodeEnv === 'test',

  port: Number.parseInt(process.env.PORT || '3000', 10),

  // Public base URL used to build absolute links (emails, resets...)
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || '3000'}`,

  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ecommerce',

  corsOrigin: process.env.CORS_ORIGIN || true,

  // Populated in Phase 2 (authentication)
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookieSecret: process.env.COOKIE_SECRET || '',

  // Shipping rules (Phase 6)
  shipping: {
    flatRate: Number.parseFloat(process.env.SHIPPING_FLAT_RATE || '5.99'),
    freeThreshold: Number.parseFloat(process.env.SHIPPING_FREE_THRESHOLD || '200'),
  },

  // Populated in Phase 10 (email). Empty SMTP config => console transport.
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number.parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.EMAIL_FROM || 'E-Commerce <no-reply@localhost>',
  },

  // Populated in Phase 6 (payments)
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',

  // Populated in Phase 10 (image hosting)
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
};

/**
 * Fail-fast validation of critical configuration.
 * Only enforced when the application actually needs the value,
 * so the project stays runnable at every phase of the roadmap.
 */
function validateEnvironment() {
  const problems = [];

  if (config.isProduction) {
    if (!process.env.MONGODB_URI) {
      problems.push('MONGODB_URI is required in production');
    }
    if (!process.env.COOKIE_SECRET || process.env.COOKIE_SECRET.length < 32) {
      problems.push('COOKIE_SECRET is required in production (min 32 chars)');
    }
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      problems.push('JWT_SECRET is required in production (min 32 chars)');
    }
  }

  return problems;
}

module.exports = Object.freeze({ ...config, validateEnvironment });
