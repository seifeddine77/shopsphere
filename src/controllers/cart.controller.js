const cartService = require('../services/cart.service');
const wishlistService = require('../services/wishlist.service');
const { sendSuccess } = require('../utils/response');

/* --------------------------------- Cart ----------------------------------- */

async function getCart(req, res, next) {
  try {
    const cart = await cartService.getCartSummary(req.user._id);
    return sendSuccess(res, { data: { cart }, message: 'Cart retrieved' });
  } catch (error) {
    return next(error);
  }
}

async function addItem(req, res, next) {
  try {
    const cart = await cartService.addToCart(req.user._id, req.body.productId, req.body.quantity);
    return sendSuccess(res, { data: { cart }, message: 'Added to cart' });
  } catch (error) {
    return next(error);
  }
}

async function updateItem(req, res, next) {
  try {
    const cart = await cartService.updateItemQuantity(
      req.user._id,
      req.params.productId,
      req.body.quantity,
    );
    return sendSuccess(res, { data: { cart }, message: 'Quantity updated' });
  } catch (error) {
    return next(error);
  }
}

async function removeItem(req, res, next) {
  try {
    const cart = await cartService.removeFromCart(req.user._id, req.params.productId);
    return sendSuccess(res, { data: { cart }, message: 'Item removed' });
  } catch (error) {
    return next(error);
  }
}

async function clear(req, res, next) {
  try {
    await cartService.clearCart(req.user._id);
    return sendSuccess(res, { message: 'Cart cleared' });
  } catch (error) {
    return next(error);
  }
}

/* ------------------------------- Wishlist --------------------------------- */

async function getWishlist(req, res, next) {
  try {
    const wishlist = await wishlistService.getWishlist(req.user._id);
    return sendSuccess(res, { data: { wishlist }, message: 'Wishlist retrieved' });
  } catch (error) {
    return next(error);
  }
}

async function addWish(req, res, next) {
  try {
    const wishlist = await wishlistService.addToWishlist(req.user._id, req.body.productId);
    return sendSuccess(res, { data: { wishlist }, message: 'Saved to wishlist' });
  } catch (error) {
    return next(error);
  }
}

async function removeWish(req, res, next) {
  try {
    const wishlist = await wishlistService.removeFromWishlist(req.user._id, req.params.productId);
    return sendSuccess(res, { data: { wishlist }, message: 'Removed from wishlist' });
  } catch (error) {
    return next(error);
  }
}

async function moveToCart(req, res, next) {
  try {
    const result = await wishlistService.moveToCart(
      req.user._id,
      req.params.productId,
      req.body.quantity || 1,
    );
    return sendSuccess(res, {
      data: result,
      message: 'Moved to cart',
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clear,
  getWishlist,
  addWish,
  removeWish,
  moveToCart,
};
