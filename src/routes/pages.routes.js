const router = require('express').Router();

const homeController = require('../controllers/home.controller');
const pageController = require('../controllers/page.controller');
const {
  optionalAuth,
  requirePageAuth,
  requirePageAdmin,
} = require('../middlewares/auth.middleware');
const Cart = require('../models/Cart');
const Wishlist = require('../models/Wishlist');

/* ------------------------------- Home ----------------------------------- */
router.get('/', homeController.index);

/* ------------------------------ Catalog --------------------------------- */
router.get('/products', optionalAuth, pageController.catalog);
router.get('/products/:slug', optionalAuth, pageController.productDetails);

/* ------------------------------- Admin ---------------------------------- */
/* requirePageAdmin guards access; every page renders inside layouts/admin   */

function adminPage(handler) {
  return [
    requirePageAdmin,
    (_req, _res, next) => next(),
    handler,
  ];
}

router.get('/admin', ...adminPage(pageController.adminDashboard));
router.get('/admin/products', ...adminPage(pageController.adminProductsPage));
router.get('/admin/products/new', ...adminPage(pageController.adminProductFormPage));
router.get('/admin/products/:id/edit', ...adminPage(pageController.adminProductFormPage));
router.get('/admin/categories', ...adminPage((req, res, next) => pageController.taxonomyManagerPage('categories', req, res, next)));
router.get('/admin/brands', ...adminPage((req, res, next) => pageController.taxonomyManagerPage('brands', req, res, next)));
router.get('/admin/inventory', ...adminPage(pageController.adminInventoryPage));
router.get('/admin/coupons', ...adminPage(pageController.adminCouponsPage));
router.get('/admin/reviews', ...adminPage(pageController.adminModerationPage));
router.get('/admin/users', ...adminPage(pageController.adminUsersPage));
router.get('/admin/settings', ...adminPage(pageController.adminSettingsPage));
router.get('/admin/orders', requirePageAdmin, pageController.adminOrdersPage);

/* ------------------------------- Profile ---------------------------------- */
router.get('/profile', requirePageAuth, (req, res) => {
  res.render('profile/index', {
    title: 'My profile',
    stylesheets: ['/css/profile.css'],
    scripts: ['/js/profile.js'],
    user: req.user.toJSON(),
    addresses: req.user.addresses || [],
  });
});

/* Legacy search path kept for compatibility with the spec's page map */
router.get('/search', (req, res) => {
  const params = new URLSearchParams(req.query).toString();
  res.redirect(301, `/products${params ? `?${params}` : ''}`);
});

/* --------------------------- Shopping pages ------------------------------ */

async function cartPage(req, res, next) {
  try {
    const cart = await Cart.findOne({ user: req.user._id })
      .populate({
        path: 'items.product',
        select: 'name slug images effectivePrice price discountPrice stock isActive',
      })
      .lean();

    const items = (cart && cart.items ? cart.items : [])
      .filter((item) => item.product)
      .map((item) => ({
        product: item.product,
        quantity: item.quantity,
        lineTotal: Math.round(item.product.effectivePrice * item.quantity * 100) / 100,
        available: item.product.isActive && item.product.stock > 0,
      }));

    const subtotal = Math.round(
      items.filter((i) => i.available).reduce((sum, i) => sum + i.lineTotal, 0) * 100,
    ) / 100;

    return res.render('cart/index', {
      title: 'Your cart',
      stylesheets: ['/css/cart.css'],
      scripts: ['/js/shopping.js'],
      cart: { items, itemCount: items.reduce((s, i) => s + i.quantity, 0), subtotal },
    });
  } catch (error) {
    return next(error);
  }
}

async function wishlistPage(req, res, next) {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id })
      .populate({
        path: 'products',
        select: 'name slug images effectivePrice price discountPrice stock isActive rating reviewCount brand createdAt',
        populate: { path: 'brand', select: 'name slug' },
      })
      .lean();

    const products = wishlist && wishlist.products ? wishlist.products.filter((p) => p && p.isActive) : [];

    return res.render('wishlist/index', {
      title: 'Your wishlist',
      stylesheets: ['/css/cart.css'],
      scripts: ['/js/shopping.js'],
      products,
    });
  } catch (error) {
    return next(error);
  }
}

/* --------------------------- Shopping pages ------------------------------ */

router.get('/checkout', requirePageAuth, pageController.checkoutPage);
router.get('/orders', requirePageAuth, pageController.ordersPage);
router.get('/orders/:id', requirePageAuth, pageController.orderDetailsPage);

router.get('/cart', requirePageAuth, cartPage);
router.get('/wishlist', requirePageAuth, wishlistPage);

/* --------------------------- Authentication ------------------------------ */

/** Authenticated users have no business on login/register pages */
function redirectIfAuthenticated(view) {
  return [
    optionalAuth,
    (req, res) => {
      if (req.user) return res.redirect('/');
      return res.render(view, {
        title: viewTitle(view),
        stylesheets: ['/css/auth.css'],
        scripts: ['/js/auth.js'],
      });
    },
  ];
}

function viewTitle(view) {
  const name = view.split('/').pop(); // e.g. "login"
  const labels = {
    login: 'Login',
    register: 'Register',
  };
  return labels[name] || name;
}

router.get('/auth/login', ...redirectIfAuthenticated('auth/login'));
router.get('/auth/register', ...redirectIfAuthenticated('auth/register'));

router.get('/auth/forgot-password', (req, res) => {
  res.render('auth/forgot-password', {
    title: 'Forgot password',
    stylesheets: ['/css/auth.css'],
    scripts: ['/js/auth.js'],
  });
});

router.get('/auth/reset-password/:token?', (req, res) => {
  res.render('auth/reset-password', {
    title: 'Reset password',
    resetToken: typeof req.params.token === 'string' ? req.params.token : '',
    stylesheets: ['/css/auth.css'],
    scripts: ['/js/auth.js'],
  });
});

module.exports = router;
