const crypto = require('crypto');
const logger = require('../config/logger');
const cartService = require('./cart.service');
const couponService = require('./coupon.service');
const shippingService = require('./shipping.service');
const paymentService = require('./payment.service');
const emailService = require('./email.service');
const gateways = require('./gateways');
const Product = require('../models/Product');
const { Order } = require('../models/Order');
const Payment = require('../models/Payment');
const Cart = require('../models/Cart');
const User = require('../models/User');
const { unprocessable, conflict, notFound } = require('../utils/errors');

/**
 * Legal order status transitions (admin-driven lifecycle).
 * Cancellation is only possible before the order ships.
 */
const TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** Emails fired when an order ENTERS each status ('placed' fires at creation) */
const STATUS_EMAIL_EVENTS = {
  PENDING: null,
  CONFIRMED: 'confirmed',
  PROCESSING: null,
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

const round2 = (value) => Math.round(value * 100) / 100;

/** Human-friendly unique order number: SS-<base36 time>-<random> */
function generateOrderNumber() {
  const time = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `SS-${time}-${random}`;
}

async function restockItems(items) {
  for (const item of items) {
    await Product.updateOne(
      { _id: item.product },
      { $inc: { stock: item.quantity } },
    );
  }
}

/**
 * THE checkout pipeline.
 *
 * Guarantees:
 *  - totals are recomputed server-side from live product data
 *  - stock is decremented ATOMICALLY per line (no overselling)
 *  - any failure rolls everything back: stock restored, coupon released,
 *    no orphan order/payment rows
 */
async function createOrder(userId, payload) {
  const decremented = []; // [{productId, quantity}] for rollback
  let consumedCouponCode = null;
  let paymentResult = null;
  const orderNumber = generateOrderNumber(); // fixed early for payment metadata

  try {
    /* 1. Load and validate the cart ------------------------------------ */
    let cart;
    if (userId) {
      cart = await cartService.getCartSummary(userId);
    } else {
      if (!payload.items || !payload.items.length) {
        throw unprocessable('Your cart is empty');
      }
      const productIds = payload.items.map((i) => i.productId);
      const products = await Product.find({ _id: { $in: productIds } });
      const productMap = new Map(products.map((p) => [String(p._id), p]));

      const items = payload.items.map((i) => {
        const p = productMap.get(String(i.productId));
        if (!p) throw unprocessable('A requested product was not found');
        const unitPrice = p.effectivePrice != null ? p.effectivePrice : p.price;
        return {
          product: p,
          quantity: i.quantity,
          unitPrice,
          lineTotal: round2(unitPrice * i.quantity),
          available: p.isActive && p.stock >= i.quantity,
          exceedsStock: p.stock < i.quantity,
        };
      });

      const subtotal = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));
      cart = { items, subtotal, hasUnavailable: items.some((i) => !i.available) };
    }

    if (!cart.items.length) throw unprocessable('Your cart is empty');

    const problems = cart.items
      .filter((item) => !item.available || item.exceedsStock)
      .map((item) => ({
        field: 'items',
        message: item.product
          ? `${item.product.name}: only ${item.product.stock} in stock`
          : 'An item is no longer available',
      }));
    if (problems.length || cart.hasUnavailable) {
      throw unprocessable('Some items in your cart are unavailable', problems);
    }

    /* 2. Resolve the shipping address ----------------------------------- */
    let address = payload.shippingAddress;

    if (payload.shippingAddressId && userId) {
      const user = await User.findById(userId).select('addresses');
      const saved = (user.addresses || []).id(payload.shippingAddressId);
      if (!saved) throw notFound('Selected address not found');
      address = saved.toObject();
    }
    if (payload.saveAddress && payload.shippingAddress && userId) {
      await User.updateOne(
        { _id: userId },
        [
          {
            $set: {
              addresses: {
                $concatArrays: [
                  { $map: { input: '$addresses', as: 'a', in: { $mergeObjects: ['$$a', { isDefault: false }] } } },
                  [{
                    label: payload.shippingAddress.label || 'Home',
                    fullName: payload.shippingAddress.fullName,
                    phone: payload.shippingAddress.phone,
                    street: payload.shippingAddress.street,
                    city: payload.shippingAddress.city,
                    state: payload.shippingAddress.state || '',
                    postalCode: payload.shippingAddress.postalCode,
                    country: payload.shippingAddress.country,
                    isDefault: true,
                  }],
                ],
              },
            },
          },
        ],
      );
    }

    /* 3. Server-side pricing -------------------------------------------- */
    const subtotal = round2(cart.subtotal);

    let discount = 0;
    if (payload.couponCode) {
      const validation = await couponService.validateCoupon(payload.couponCode, subtotal);
      const consumed = await couponService.consumeCoupon(validation.code);
      if (!consumed) throw unprocessable('This coupon has reached its usage limit');
      consumedCouponCode = validation.code;
      discount = validation.discountAmount;
    }

    const shippingCost = await shippingService.calculateShipping(round2(subtotal - discount));
    const total = round2(subtotal - discount + shippingCost);

    /* 4. Payment --------------------------------------------------------- */
    let paymentIntent = null;

    if (payload.paymentMethod === 'CARD' && gateways.isStripeEnabled()) {
      // Real Stripe: create a PaymentIntent; the webhook finalizes the order
      try {
        paymentIntent = await gateways
          .getGateway('CARD')
          .createIntent(total, orderNumber);
      } catch (intentError) {
        logger.error(`Stripe intent creation failed: ${intentError.message}`);
        throw unprocessable('The payment processor rejected the request. Please try again.', [
          { field: 'paymentMethod', message: 'Payment initialization failed' },
        ]);
      }
      paymentResult = {
        status: 'PENDING',
        transactionId: paymentIntent.id,
        message: 'Awaiting card confirmation',
        provider: 'stripe',
      };
    } else {
      paymentResult = await paymentService.processPayment({
        method: payload.paymentMethod,
        amount: total,
        card: payload.card,
      });
      if (paymentResult.status === 'FAILED') {
        throw unprocessable(paymentResult.message || 'Payment failed', [
          { field: 'paymentMethod', message: paymentResult.message || 'Declined' },
        ]);
      }
    }
    const paidNow = paymentResult.status === 'PAID';

    /* 5. Atomic stock decrement (oversell-proof) ------------------------ */
    for (const item of cart.items) {
      const updated = await Product.findOneAndUpdate(
        { _id: item.product._id, isActive: true, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
        { new: true },
      );
      if (!updated) {
        throw conflict(`Insufficient stock for "${item.product.name}"`);
      }
      decremented.push({ productId: item.product._id, quantity: item.quantity });
    }

    const isGuest = !userId;
    const guestToken = isGuest ? crypto.randomBytes(20).toString('hex') : '';
    const guestEmail = (payload.customer && payload.customer.email) || (payload.shippingAddress && payload.shippingAddress.email) || '';
    const guestName = payload.customer ? `${payload.customer.firstName} ${payload.customer.lastName}`.trim() : (payload.shippingAddress ? payload.shippingAddress.fullName : '');
    const guestPhone = (payload.customer && payload.customer.phone) || (payload.shippingAddress && payload.shippingAddress.phone) || '';

    /* 6. Persist order + payment ----------------------------------------- */
    const order = await Order.create({
      orderNumber,
      user: userId || undefined,
      isGuest,
      guestEmail,
      guestName,
      guestPhone,
      guestToken,
      items: cart.items.map((item) => ({
        product: item.product._id,
        name: item.product.name,
        slug: item.product.slug,
        image: (item.product.images && item.product.images[0]) || '',
        sku: item.product.sku,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
      })),
      shippingAddress: address,
      paymentMethod: payload.paymentMethod,
      paymentStatus: paidNow ? 'PAID' : 'PENDING',
      orderStatus: 'PENDING',
      statusHistory: [{ status: 'PENDING', note: isGuest ? 'Guest order placed' : 'Order placed' }],
      subtotal,
      shippingCost,
      discount,
      total,
      coupon: discount > 0
        ? { code: consumedCouponCode, discountAmount: discount }
        : { code: null, discountAmount: 0 },
      ...(paymentIntent ? { paymentIntentId: paymentIntent.id } : {}),
    });

    await Payment.create({
      order: order._id,
      method: payload.paymentMethod,
      provider: paymentResult.provider || 'internal',
      status: paymentResult.status,
      amount: total,
      transactionId: paymentResult.transactionId,
      message: paymentResult.message,
    });

    /* 7. Empty the cart + notify ----------------------------------------- */
    if (userId) {
      await Cart.findOneAndDelete({ user: userId });
    }

    logger.info(`Order created: ${order.orderNumber} (${total}) by ${isGuest ? `guest ${guestEmail}` : `user ${userId}`}`);

    // Stripe path: hand back the client secret so the frontend can confirm
    // the PaymentIntent (transient - never persisted).
    if (paymentIntent) {
      order.paymentClientSecret = paymentIntent.clientSecret;
    }

    setImmediate(() => {
      if (userId) {
        User.findById(userId)
          .select('firstName lastName email')
          .then((buyer) => {
            if (buyer) return emailService.sendOrderEmail(buyer, order, 'placed');
            return null;
          })
          .catch((emailError) => logger.error(`Order confirmation email failed: ${emailError.message}`));
      } else if (guestEmail) {
        const guestBuyer = {
          firstName: (payload.customer && payload.customer.firstName) || 'Valued',
          lastName: (payload.customer && payload.customer.lastName) || 'Customer',
          email: guestEmail,
        };
        emailService.sendOrderEmail(guestBuyer, order, 'placed')
          .catch((emailError) => logger.error(`Guest confirmation email failed: ${emailError.message}`));
      }
    });

    return order;
  } catch (error) {
    /* -------- Compensating actions: leave the system consistent -------- */
    for (const entry of decremented) {
      await Product.updateOne(
        { _id: entry.productId },
        { $inc: { stock: entry.quantity } },
      );
    }
    if (consumedCouponCode) {
      await couponService.releaseCoupon(consumedCouponCode);
    }
    if (!(error.status && error.status < 500)) {
      logger.error(`Order creation failed for user ${userId}: ${error.message}`);
    }
    throw error;
  }
}

/* ------------------------------- Queries ---------------------------------- */

/**
 * Generic paginated order listing.
 * filter examples: { user: id } for a customer, { orderStatus: 'SHIPPED' }
 * for the admin console.
 */
async function listOrders(filter = {}, query = {}) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 10, 1), 50);
  const totalPages = Math.max(1, Math.ceil(await Order.countDocuments(filter) / limit));

  const [orders, totalItems] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'firstName lastName email')
      .select('orderNumber items user paymentMethod paymentStatus orderStatus trackingNumber total createdAt'),
    Order.countDocuments(filter),
  ]);

  return {
    orders,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

async function getUserOrders(userId, query = {}) {
  return listOrders({ user: userId }, query);
}

/** Ownership enforced by returning 404 for other users' orders (no leaks) */
async function getOrderForUser(orderId, requestingUser, guestToken = null) {
  const order = await Order.findById(orderId).populate('user', 'firstName lastName email');
  if (!order) throw notFound('Order not found');

  if (order.isGuest) {
    if (guestToken && order.guestToken === guestToken) return order;
    if (requestingUser && requestingUser.role === 'ADMIN') return order;
    throw notFound('Order not found');
  }

  if (!requestingUser) {
    throw notFound('Order not found');
  }

  const isOwner = order.user && String(order.user._id) === String(requestingUser._id);
  if (!isOwner && requestingUser.role !== 'ADMIN') {
    throw notFound('Order not found'); // deliberately not 403 - hides existence
  }
  return order;
}

async function getGuestOrderByNumber(orderNumber, email) {
  const order = await Order.findOne({
    orderNumber: orderNumber.trim().toUpperCase(),
    $or: [
      { guestEmail: email.trim().toLowerCase() },
      { 'shippingAddress.email': email.trim().toLowerCase() },
    ],
  });
  if (!order) throw notFound('Order not found');
  return order;
}

async function cancelOrder(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw notFound('Order not found');

  if (!['PENDING', 'CONFIRMED'].includes(order.orderStatus)) {
    throw unprocessable(`This order can no longer be cancelled (status: ${order.orderStatus})`);
  }

  await restockItems(order.items);

  order.orderStatus = 'CANCELLED';
  order.paymentStatus = order.paymentStatus === 'PAID' ? 'REFUNDED' : order.paymentStatus;
  order.statusHistory.push({ status: 'CANCELLED', note: 'Cancelled by customer' });
  await order.save();

  logger.info(`Order cancelled by customer: ${order.orderNumber}`);
  setImmediate(() => {
    User.findById(userId).select('firstName lastName email')
      .then((buyer) => (buyer ? emailService.sendOrderEmail(buyer, order, 'cancelled') : null))
      .catch((emailError) => logger.error(`Cancellation email failed: ${emailError.message}`));
  });

  return order;
}

/* -------------------------- Admin lifecycle ------------------------------- */

function generateTrackingNumber() {
  return `TRK-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

/**
 * Applies an admin-driven status transition with state-machine validation.
 * Cancellations restock and refund; SHIPPED assigns a tracking number;
 * each meaningful transition notifies the customer.
 */
async function updateOrderStatus(orderId, payload) {
  const targetStatus = payload.status;

  if (!Object.prototype.hasOwnProperty.call(TRANSITIONS, targetStatus)) {
    throw unprocessable(`Unknown order status "${targetStatus}"`);
  }

  const order = await Order.findById(orderId).populate('user', 'firstName lastName email');
  if (!order) throw notFound('Order not found');

  const current = order.orderStatus;
  if (current === targetStatus) {
    throw unprocessable(`This order is already ${current}`);
  }

  const allowed = TRANSITIONS[current];
  if (!allowed.includes(targetStatus)) {
    throw unprocessable(
      `Cannot move an order from ${current} to ${targetStatus}. Allowed transitions: ${
        allowed.length ? allowed.join(', ') : 'none (terminal status)'
      }`,
    );
  }

  let note = payload.note || '';

  if (targetStatus === 'CANCELLED') {
    await restockItems(order.items);
    if (order.paymentStatus === 'PAID') {
      order.paymentStatus = 'REFUNDED';
    }
    note = note || 'Cancelled by administrator';
  }

  if (targetStatus === 'SHIPPED') {
    order.trackingNumber = payload.trackingNumber || generateTrackingNumber();
  }

  order.orderStatus = targetStatus;
  order.statusHistory.push({ status: targetStatus, note });
  await order.save();

  logger.info(`Order ${order.orderNumber}: ${current} -> ${targetStatus}`);

  const emailEvent = STATUS_EMAIL_EVENTS[targetStatus];
  if (emailEvent) {
    const buyer = order.user || {
      firstName: order.guestName || 'Valued Customer',
      lastName: '',
      email: order.guestEmail,
    };
    if (buyer.email) {
      setImmediate(() => {
        emailService.sendOrderEmail(buyer, order, emailEvent)
          .catch((emailError) => logger.error(`Order email failed: ${emailError.message}`));
      });
    }
  }

  return order.populate([
    { path: 'user', select: 'firstName lastName email' },
  ]);
}

/**
 * Reorders all available items from a previous order into the user's active cart.
 */
async function reorder(orderId, userId) {
  const order = await getOrderForUser(orderId, userId);
  if (!order) throw notFound('Order not found');

  let addedCount = 0;
  for (const item of order.items) {
    const product = await Product.findById(item.product);
    if (product && product.isActive && product.stock > 0) {
      const qtyToAdd = Math.min(item.quantity, product.stock);
      await cartService.addToCart(userId, product._id, qtyToAdd);
      addedCount++;
    }
  }

  if (addedCount === 0) {
    throw unprocessable('The items in this order are currently out of stock');
  }

  return { reorderedCount: addedCount };
}

module.exports = {
  createOrder,
  getUserOrders,
  listOrders,
  getOrderForUser,
  getGuestOrderByNumber,
  cancelOrder,
  updateOrderStatus,
  reorder,
  TRANSITIONS,
};
