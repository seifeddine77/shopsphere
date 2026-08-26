const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { notFound, unprocessable } = require('../utils/errors');

/** Card-level projection reused everywhere a product is displayed */
const CARD_FIELDS = 'name slug sku images effectivePrice price discountPrice stock isActive rating reviewCount';

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }
  return cart;
}

/**
 * Builds the client-facing summary.
 * Prices ALWAYS come from live product documents - the stored snapshot
 * is ignored for math, so stale or tampered prices are impossible.
 */
function buildSummary(cart, populatedItems) {
  const items = populatedItems.map((item) => {
    const product = item.product;
    const exists = Boolean(product);
    const purchasable = exists && product.isActive && product.stock > 0;
    const unitPrice = exists ? product.effectivePrice : null;

    return {
      product: exists
        ? {
            _id: product._id,
            name: product.name,
            slug: product.slug,
            sku: product.sku,
            images: product.images,
            effectivePrice: product.effectivePrice,
            discountPrice: product.discountPrice,
            stock: product.stock,
            isActive: product.isActive,
          }
        : null,
      quantity: item.quantity,
      snapshotPrice: item.price,
      unitPrice,
      lineTotal: purchasable ? Math.round(unitPrice * item.quantity * 100) / 100 : 0,
      available: purchasable,
      exceedsStock: exists && product.stock < item.quantity,
    };
  });

  const subtotal = Math.round(
    items.filter((i) => i.available).reduce((sum, i) => sum + i.lineTotal, 0) * 100,
  ) / 100;

  return {
    _id: cart._id,
    items,
    distinctItems: items.length,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    subtotal,
    hasUnavailable: items.some((i) => !i.available || i.exceedsStock),
  };
}

async function getCartSummary(userId) {
  const cart = await getOrCreateCart(userId);
  await cart.populate('items.product', CARD_FIELDS);
  return buildSummary(cart, cart.items);
}

/** Adds quantity for a product, enforcing stock and refreshing the snapshot */
async function addToCart(userId, productId, quantity = 1) {
  const product = await Product.findOne({
    _id: productId,
    isActive: true,
  }).select('stock effectivePrice');

  if (!product) throw notFound('Product not found or no longer available');

  const cart = await getOrCreateCart(userId);

  // Fresh stock read + clamped target keeps the cart consistent
  // (order placement in Phase 6 re-validates atomically).
  const existing = cart.items.find((item) => String(item.product) === String(productId));
  const targetQuantity = (existing ? existing.quantity : 0) + quantity;

  if (product.stock < targetQuantity) {
    throw unprocessable(
      product.stock === 0
        ? 'This product is out of stock'
        : `Only ${product.stock} unit(s) left in stock`,
      [{ field: 'quantity', message: `Maximum available: ${product.stock}` }],
    );
  }

  if (existing) {
    existing.quantity = targetQuantity;
    existing.price = product.effectivePrice; // refresh snapshot
  } else {
    cart.items.push({ product: productId, quantity, price: product.effectivePrice });
  }

  await cart.save();
  return getCartSummary(userId);
}

async function updateItemQuantity(userId, productId, quantity) {
  const cart = await getOrCreateCart(userId);
  const item = cart.items.find((entry) => String(entry.product) === String(productId));
  if (!item) throw notFound('This product is not in your cart');

  const product = await Product.findById(productId).select('stock effectivePrice isActive');
  if (!product || !product.isActive) throw notFound('Product not found or no longer available');

  if (product.stock < quantity) {
    throw unprocessable(`Only ${product.stock} unit(s) left in stock`, [
      { field: 'quantity', message: `Maximum available: ${product.stock}` },
    ]);
  }

  item.quantity = quantity;
  item.price = product.effectivePrice;
  await cart.save();
  return getCartSummary(userId);
}

async function removeFromCart(userId, productId) {
  const cart = await Cart.findOneAndUpdate(
    { user: userId },
    { $pull: { items: { product: productId } } },
    { new: true },
  );
  if (!cart) throw notFound('Cart not found');
  return getCartSummary(userId);
}

async function clearCart(userId) {
  await Cart.findOneAndDelete({ user: userId });
  return { items: [], itemCount: 0, distinctItems: 0, subtotal: 0, hasUnavailable: false };
}

module.exports = {
  getCartSummary,
  addToCart,
  updateItemQuantity,
  removeFromCart,
  clearCart,
};
