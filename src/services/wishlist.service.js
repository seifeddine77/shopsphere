const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const cartService = require('./cart.service');
const { notFound, unprocessable } = require('../utils/errors');

const CARD_FIELDS = 'name slug images effectivePrice price discountPrice stock isActive rating reviewCount';

async function getWishlist(userId) {
  const wishlist = await Wishlist.findOne({ user: userId }).populate('products', CARD_FIELDS);
  return {
    products: wishlist ? wishlist.products.map((p) => p.toJSON()) : [],
  };
}

/** Idempotent: adding an existing product is a no-op, not an error */
async function addToWishlist(userId, productId) {
  const product = await Product.exists({ _id: productId, isActive: true });
  if (!product) throw notFound('Product not found or no longer available');

  await Wishlist.updateOne(
    { user: userId },
    { $addToSet: { products: productId } },
    { upsert: true },
  );

  return getWishlist(userId);
}

async function removeFromWishlist(userId, productId) {
  await Wishlist.updateOne({ user: userId }, { $pull: { products: productId } });
  return getWishlist(userId);
}

/**
 * Moves a product to the cart. The cart operation runs FIRST:
 * if it fails (out of stock...) the product stays wishlisted.
 */
async function moveToCart(userId, productId, quantity = 1) {
  const product = await Product.findOne({ _id: productId, isActive: true }).select('stock');
  if (!product) throw notFound('Product not found or no longer available');
  if (product.stock <= 0) {
    throw unprocessable('This product is out of stock', [
      { field: 'quantity', message: 'Cannot move an out-of-stock product to the cart' },
    ]);
  }

  const cart = await cartService.addToCart(userId, productId, quantity);
  const wishlist = await removeFromWishlist(userId, productId);

  return { cart, wishlist };
}

module.exports = { getWishlist, addToWishlist, removeFromWishlist, moveToCart };
