const productService = require('../services/product.service');
const categoryService = require('../services/category.service');
const brandService = require('../services/brand.service');
const cartService = require('../services/cart.service');
const orderService = require('../services/order.service');
const reviewService = require('../services/review.service');
const dashboardService = require('../services/dashboard.service');
const userService = require('../services/user.service');
const couponService = require('../services/coupon.service');
const settingsService = require('../services/settings.service');
const User = require('../models/User');
const Product = require('../models/Product');
const { ORDER_STATUSES } = require('../models/Order');
const config = require('../config/environment');
const { isDatabaseConnected } = require('../config/database');
const { notFound } = require('../utils/errors');

/**
 * Storefront page controllers.
 * They only gather data through services and render templates -
 * all business logic lives in the service layer.
 */

/** Builds a querystring without the `page` param, for pagination links */
function baseQueryFrom(query) {
  return Object.entries(query)
    .filter(([key, value]) => key !== 'page' && value !== '' && value != null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * GET /products - catalog page (search, filters, sort, pagination)
 */
async function catalog(req, res, next) {
  try {
    if (!isDatabaseConnected()) {
      // Degraded mode: render the shell with an empty result set
      return res.render('products/index', {
        title: 'Shop',
        description: 'Browse the full ShopSphere catalog',
        stylesheets: ['/css/product.css'],
        scripts: ['/js/catalog.js'],
        products: [],
        pagination: { currentPage: 1, totalPages: 1, totalItems: 0, itemsPerPage: 12, hasNextPage: false, hasPreviousPage: false },
        categories: [],
        brands: [],
        current: req.query,
        baseQuery: baseQueryFrom(req.query),
      });
    }

    const { products, pagination } = await productService.listProducts(req.query);
    const [categories, brands] = await Promise.all([
      categoryService.listCategories(),
      brandService.listBrands(),
    ]);

    res.render('products/index', {
      title: req.query.q ? `Search: ${req.query.q}` : 'Shop',
      description: 'Browse the full ShopSphere catalog',
      stylesheets: ['/css/product.css'],
      scripts: ['/js/catalog.js'],
      products: products.map((product) => product.toJSON()),
      pagination,
      categories: categories.map((category) => category.toJSON()),
      brands: brands.map((brand) => brand.toJSON()),
      current: req.query,
      baseQuery: baseQueryFrom(req.query),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /products/:slug - product detail page
 */
async function productDetails(req, res, next) {
  try {
    const product = await productService.getProduct(req.params.slug);
    const related = await productService.getRelatedProducts(product, 4);

    // Reviews: approved list + the visitor's own review state
    const { reviews } = await reviewService.listApproved(product._id, { limit: '6' });
    let myReview = null;
    let eligibility = { allowed: false, reason: 'guest' };
    if (req.user) {
      [myReview, eligibility] = await Promise.all([
        reviewService.getMyReview(req.user._id, product._id),
        reviewService.checkEligibility(req.user._id, product._id),
      ]);
    }

    return res.render('products/details', {
      title: product.name,
      description: String(product.description).slice(0, 155),
      stylesheets: ['/css/product.css'],
      scripts: ['/js/product.js'],
      product: product.toJSON(),
      related: related.map((item) => item.toJSON()),
      reviews: reviews.map((review) => review.toJSON()),
      reviewTotal: reviews.length,
      myReview: myReview ? myReview.toJSON() : null,
      eligibility,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /checkout - 3-step wizard (address -> payment -> review).
 * Empty carts are bounced back to the cart page.
 */
async function checkoutPage(req, res, next) {
  try {
    const cart = await cartService.getCartSummary(req.user._id);
    if (!cart.items.length) return res.redirect('/cart');

    const [user, settings] = await Promise.all([
      User.findById(req.user._id).select('addresses'),
      settingsService.getSettings(),
    ]);

    return res.render('checkout/index', {
      title: 'Checkout',
      description: 'Secure checkout',
      stylesheets: ['/css/cart.css'],
      scripts: ['/js/checkout.js'],
      cart,
      addresses: user.addresses || [],
      shipping: {
        flatRate: settings.shippingFlatRate,
        freeThreshold: settings.shippingFreeThreshold,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /orders - order history list
 */
async function ordersPage(req, res, next) {
  try {
    const { orders, pagination } = await orderService.getUserOrders(req.user._id, req.query);
    return res.render('orders/index', {
      title: 'My orders',
      stylesheets: [],
      scripts: [],
      orders: orders.map((order) => order.toJSON()),
      pagination,
      baseQuery: '',
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /orders/:id - detail / confirmation page (owner only)
 */
async function orderDetailsPage(req, res, next) {
  try {
    const order = await orderService.getOrderForUser(req.params.id, req.user);
    return res.render('orders/details', {
      title: `Order ${order.orderNumber}`,
      stylesheets: ['/css/cart.css'],
      scripts: ['/js/shopping.js'],
      order: order.toJSON(),
      justPlaced: req.query.placed === '1',
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /admin/orders - order lifecycle console.
 */
async function adminOrdersPage(req, res, next) {
  try {
    const filter = req.query.status ? { orderStatus: req.query.status } : {};
    const { orders, pagination } = await orderService.listOrders(filter, req.query);

    return adminRender(req, res, 'admin/orders', {
      title: 'Order management',
      activeNav: 'orders',
      orders: orders.map((order) => order.toJSON()),
      pagination,
      baseQuery: baseQueryFrom({ ...req.query }),
      statuses: ORDER_STATUSES,
      transitions: orderService.TRANSITIONS,
      currentStatus: req.query.status || '',
    });
  } catch (error) {
    return next(error);
  }
}

/* ==========================================================================
 *                          ADMIN PAGES (Phase 9)
 * ========================================================================== */

/** Shared render context for every admin page */
function adminRender(req, res, view, data) {
  return res.render(view, {
    layout: 'layouts/admin',
    currentUser: req.user,
    ...data,
  });
}

/** GET /admin - KPIs + charts + top products + low stock */
async function adminDashboard(req, res, next) {
  try {
    const overview = await dashboardService.getOverview();
    return adminRender(req, res, 'admin/dashboard', {
      title: 'Dashboard',
      activeNav: 'dashboard',
      scripts: ['/js/admin-dashboard.js'],
      ...overview,
    });
  } catch (error) {
    return next(error);
  }
}

/** GET /admin/products - searchable product table with quick actions */
async function adminProductsPage(req, res, next) {
  try {
    const query = { ...req.query };
    if (!query.q && !query.includeInactive) query.includeInactive = 'true';
    const { products, pagination } = await productService.listProducts(query, { includeInactive: true });

    return adminRender(req, res, 'admin/products', {
      title: 'Products',
      activeNav: 'products',
      stylesheets: [],
      scripts: [],
      products: products.map((product) => product.toJSON()),
      pagination,
      baseQuery: baseQueryFrom(req.query),
      currentQ: req.query.q || '',
    });
  } catch (error) {
    return next(error);
  }
}

/** GET /admin/products/new & /admin/products/:id/edit - shared form */
async function adminProductFormPage(req, res, next) {
  try {
    const [categories, brands] = await Promise.all([
      categoryService.listCategories({ includeInactive: true }),
      brandService.listBrands({ includeInactive: true }),
    ]);

    let product = null;
    if (req.params.id) {
      const doc = await Product.findById(req.params.id);
      if (!doc) throw notFound('Product not found');
      product = doc.toJSON();
    }

    return adminRender(req, res, 'admin/product-form', {
      title: product ? `Edit: ${product.name}` : 'New product',
      activeNav: 'products',
      categories: categories.map((category) => category.toJSON()),
      brands: brands.map((brand) => brand.toJSON()),
      product,
    });
  } catch (error) {
    return next(error);
  }
}

/** Shared renderer for the categories & brands managers */
async function taxonomyManagerPage(kind, req, res, next) {
  try {
    const list = kind === 'categories'
      ? await categoryService.listCategories({ includeInactive: true })
      : await brandService.listBrands({ includeInactive: true });

    return adminRender(req, res, 'admin/taxonomy', {
      title: kind === 'categories' ? 'Categories' : 'Brands',
      activeNav: kind,
      kind,
      items: list.map((item) => item.toJSON()),
    });
  } catch (error) {
    return next(error);
  }
}

/** GET /admin/inventory - low stock + out of stock with quick adjustments */
async function adminInventoryPage(req, res, next) {
  try {
    const settings = await settingsService.getSettings();
    const [lowStock, outOfStock] = await Promise.all([
      Product.find({ isActive: true, stock: { $gt: 0, $lte: settings.lowStockThreshold } })
        .sort({ stock: 1 }).populate('category', 'name'),
      Product.find({ isActive: true, stock: 0 })
        .sort({ name: 1 }).populate('category', 'name'),
    ]);

    return adminRender(req, res, 'admin/inventory', {
      title: 'Inventory',
      activeNav: 'inventory',
      lowStock: lowStock.map((p) => p.toJSON()),
      outOfStock: outOfStock.map((p) => p.toJSON()),
      threshold: settings.lowStockThreshold,
    });
  } catch (error) {
    return next(error);
  }
}

/** GET /admin/settings */
async function adminSettingsPage(req, res, next) {
  try {
    const settings = await settingsService.getSettings();
    return adminRender(req, res, 'admin/settings', {
      title: 'Store settings',
      activeNav: 'settings',
      settings,
      envDefaults: config.shipping,
    });
  } catch (error) {
    return next(error);
  }
}

/** GET /admin/coupons */
async function adminCouponsPage(req, res, next) {
  try {
    const coupons = await couponService.listCoupons({ includeInactive: true });
    return adminRender(req, res, 'admin/coupons', {
      title: 'Coupons',
      activeNav: 'coupons',
      coupons: coupons.map((coupon) => coupon.toJSON()),
    });
  } catch (error) {
    return next(error);
  }
}

/** GET /admin/reviews - moderation console */
async function adminModerationPage(req, res, next) {
  try {
    const filter = req.query.approved === undefined ? {} : { isApproved: req.query.approved === 'true' };
    const { reviews, pagination } = await reviewService.listForAdmin(filter, req.query);

    return adminRender(req, res, 'admin/moderation', {
      title: 'Review moderation',
      activeNav: 'reviews',
      reviews: reviews.map((review) => review.toJSON()),
      pagination,
      baseQuery: baseQueryFrom(req.query),
      currentFilter: typeof req.query.approved === 'string' ? req.query.approved : '',
    });
  } catch (error) {
    return next(error);
  }
}

/** GET /admin/users */
async function adminUsersPage(req, res, next) {
  try {
    const { users, pagination } = await userService.listUsers(req.query);

    return adminRender(req, res, 'admin/users', {
      title: 'Users',
      activeNav: 'users',
      users: users.map((user) => user.toJSON()),
      pagination,
      baseQuery: baseQueryFrom(req.query),
      currentQ: req.query.q || '',
      currentUserId: String(req.user._id),
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /compare?ids=slug1,slug2
 */
async function comparePage(req, res, next) {
  try {
    const rawIds = req.query.ids ? String(req.query.ids).split(',').map((s) => s.trim()).filter(Boolean) : [];
    const comparison = await productService.compareProducts(rawIds);

    return res.render('products/compare', {
      title: 'Compare Products',
      description: 'Side-by-side product comparison',
      stylesheets: ['/css/product.css'],
      scripts: ['/js/catalog.js'],
      products: comparison.products,
      specKeys: comparison.specKeys,
      attributeKeys: comparison.attributeKeys,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  catalog,
  productDetails,
  comparePage,
  checkoutPage,
  ordersPage,
  orderDetailsPage,
  adminOrdersPage,
  adminDashboard,
  adminProductsPage,
  adminProductFormPage,
  adminInventoryPage,
  adminCouponsPage,
  adminModerationPage,
  adminUsersPage,
  adminSettingsPage,
  taxonomyManagerPage,
};
