const Cart = require('../models/Cart');
const Wishlist = require('../models/Wishlist');

/**
 * Template locals available in every view.
 * Badge counts are computed only for authenticated users.
 */
async function attachLocals(req, res, next) {
  res.locals.currentUser = req.user || null;
  res.locals.cartCount = 0;
  res.locals.wishlistCount = 0;

  if (req.user) {
    try {
      const [cart, wishlist] = await Promise.all([
        Cart.findOne({ user: req.user._id }).select('items.quantity').lean(),
        Wishlist.findOne({ user: req.user._id }).select('products').lean(),
      ]);
      if (cart) {
        res.locals.cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
      }
      if (wishlist) {
        res.locals.wishlistCount = wishlist.products.length;
      }
    } catch (_error) {
      // Degraded mode: badges stay at zero instead of breaking the page
    }
  }

  next();
}

module.exports = { attachLocals };
