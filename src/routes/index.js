const express = require('express');

const authApiRoutes = require('./auth.routes');
const adminApiRoutes = require('./admin.routes');
const productApiRoutes = require('./product.routes');
const taxonomyApiRoutes = require('./taxonomy.routes');
const shoppingApiRoutes = require('./shopping.routes');
const orderApiRoutes = require('./order.routes');
const reviewApiRoutes = require('./review.routes');
const userApiRoutes = require('./user.routes');
const uploadApiRoutes = require('./upload.routes');
const newsletterApiRoutes = require('./newsletter.routes');
const pageRoutes = require('./pages.routes');
const homeController = require('../controllers/home.controller');

const router = express.Router();

/* ------------------------------- JSON API ------------------------------- */
/* Mounted under /api - responses use the standardized envelope.            */

const api = express.Router();
api.use('/auth', authApiRoutes);
api.use('/admin', adminApiRoutes); // protects itself via protect + adminOnly
api.use('/products', productApiRoutes);
api.use('/', shoppingApiRoutes); // /api/cart + /api/wishlist (self-protected)
api.use('/', orderApiRoutes); // /api/orders + /api/coupons/validate
api.use('/', reviewApiRoutes); // /api/reviews/:id (own edits/removals)
api.use('/', userApiRoutes); // /api/users/me* (profile, password, addresses)
api.use('/', uploadApiRoutes); // /api/uploads/image [admin]
api.use('/', newsletterApiRoutes); // POST /api/newsletter
api.use('/', taxonomyApiRoutes); // /api/categories + /api/brands
// Future API modules mount here:
// api.use('/cart', cartApiRoutes);
router.use('/api', api);

/* --------------------------- Server-rendered ---------------------------- */

router.get('/health', homeController.health);
router.use(pageRoutes);

module.exports = router;
