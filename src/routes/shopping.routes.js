const router = require('express').Router();

const shoppingController = require('../controllers/cart.controller');
const { protect } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation.middleware');
const {
  addToCartSchema,
  updateCartItemSchema,
  productIdParamSchema,
  moveToCartSchema,
} = require('../validators/cart.validator');

// NOTE: this router is mounted at /api root, so protection is declared
// per-route (a router-level router.use(protect) would guard ALL API paths).

/* --------------------------------- Cart ----------------------------------- */

router.get('/cart', protect, shoppingController.getCart);
router.post('/cart', protect, validate(addToCartSchema), shoppingController.addItem);
router.put('/cart/:productId', protect, validate(productIdParamSchema, 'params'), validate(updateCartItemSchema), shoppingController.updateItem);
router.delete('/cart/:productId', protect, validate(productIdParamSchema, 'params'), shoppingController.removeItem);
router.delete('/cart', protect, shoppingController.clear);

/* -------------------------------- Wishlist -------------------------------- */

router.get('/wishlist', protect, shoppingController.getWishlist);
router.post('/wishlist', protect, validate(addToCartSchema), shoppingController.addWish);
router.delete(
  '/wishlist/:productId/move-to-cart',
  protect,
  validate(productIdParamSchema, 'params'),
  validate(moveToCartSchema),
  shoppingController.moveToCart,
);
router.delete('/wishlist/:productId', protect, validate(productIdParamSchema, 'params'), shoppingController.removeWish);

module.exports = router;
