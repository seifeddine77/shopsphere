const productService = require('../services/product.service');
const categoryService = require('../services/category.service');
const mongoose = require('mongoose');
const config = require('../config/environment');
const { isDatabaseConnected } = require('../config/database');
const { sendSuccess } = require('../utils/response');

/**
 * GET / - Home page with real catalog data.
 * When the database is unreachable the page renders in degraded mode
 * (empty sections) instead of failing - matching the server's
 * degraded-mode philosophy reported by /health.
 */
async function index(req, res, next) {
  try {
    if (!isDatabaseConnected()) {
      return res.render('home/index', {
        title: 'Home',
        description: 'ShopSphere - a modern e-commerce experience',
        stylesheets: ['/css/product.css'],
        scripts: [],
        categories: [],
        featuredProducts: [],
        latestProducts: [],
      });
    }

    const [categories, featured, latest] = await Promise.all([
      categoryService.listCategories(),
      // Featured: up to 8, highest rated first
      productService.listProducts({ isFeatured: 'true', sort: 'best_rating', limit: '8' }),
      // Latest arrivals
      productService.listProducts({ sort: 'newest', limit: '8' }),
    ]);

    return res.render('home/index', {
      title: 'Home',
      description: 'ShopSphere - a modern e-commerce experience',
      stylesheets: ['/css/product.css'],
      scripts: [],
      categories: categories.map((category) => category.toJSON()),
      featuredProducts: featured.products.map((product) => product.toJSON()),
      latestProducts: latest.products.map((product) => product.toJSON()),
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /health - Liveness/readiness probe used by Docker health checks
 * and load balancers. Reports database connectivity state.
 */
function health(req, res) {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  sendSuccess(res, {
    message: 'Service is healthy',
    data: {
      status: 'ok',
      environment: config.nodeEnv,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      database: {
        state: states[mongoose.connection.readyState] || 'unknown',
      },
    },
  });
}

module.exports = { index, health };
