const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const { rateLimit } = require('express-rate-limit');
const ejsLayouts = require('express-ejs-layouts');

const config = require('./config/environment');
const logger = require('./config/logger');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');
const { optionalAuth } = require('./middlewares/auth.middleware');
const { sameOriginGuard } = require('./middlewares/security.middleware');

const app = express();

// Behind reverse proxies / load balancers, trust the first hop so
// express-rate-limit sees the real client IP.
app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ----------------------------- View engine ----------------------------- */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(ejsLayouts);
app.set('layout', 'layouts/main');
app.set('layout extractScripts', false);

// Template helpers available in every view
const { formatPrice, formatDate, discountPercent } = require('./utils/format');
app.locals.formatPrice = formatPrice;
app.locals.formatDate = formatDate;
app.locals.discountPercent = discountPercent;

/* ------------------------------ Security ------------------------------- */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
        connectSrc: ["'self'", 'https:'],
      },
    },
  }),
);
app.use(cors({ origin: config.corsOrigin, credentials: true }));

/* --------------------------- Parsing & perf ---------------------------- */
// The Stripe webhook must receive the RAW body before any JSON parser runs.
app.use('/api/payments', require('./routes/payments.webhook.routes'));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser(config.cookieSecret));
app.use(compression());

/* ------------------------------ Logging -------------------------------- */
if (config.isDevelopment) {
  app.use(morgan('dev', { stream: logger.stream }));
}

/* ---------------------------- Rate limiting ---------------------------- */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isDevelopment ? 5000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
  message: {
    success: false,
    message: 'Too many requests from this address, please try again later.',
    errors: [],
  },
});
app.use(globalLimiter);

/* ------------------------------- Static -------------------------------- */
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: config.isProduction ? '7d' : 0,
  }),
);

/* -------------- Session awareness + CSRF defense (global) --------------- */
/* optionalAuth personalizes templates (navbar) without blocking guests;    */
/* sameOriginGuard rejects cross-origin state-changing browser requests.    */
app.use(optionalAuth);
app.use(sameOriginGuard);
app.use(require('./middlewares/i18n.middleware').i18nMiddleware);
app.use(require('./middlewares/locals.middleware').attachLocals);

/* ------------------------------- Routes -------------------------------- */
app.use('/', routes);

/* -------------------------- Error handling ----------------------------- */
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
