const orderService = require('../services/order.service');
const { sendSuccess } = require('../utils/response');

/**
 * POST /api/orders - run the full checkout pipeline
 */
async function create(req, res, next) {
  try {
    const order = await orderService.createOrder(req.user._id, req.body);
    return sendSuccess(res, {
      status: 201,
      data: {
        order: order.toJSON(),
        // Present only when the Stripe gateway processed the order and the
        // frontend must confirm the PaymentIntent client-side.
        paymentClientSecret: order.paymentClientSecret || null,
      },
      message: `Order ${order.orderNumber} placed successfully`,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/orders - current user's orders (paginated)
 */
async function list(req, res, next) {
  try {
    const { orders, pagination } = await orderService.getUserOrders(req.user._id, req.query);
    return sendSuccess(res, {
      data: { orders: orders.map((order) => order.toJSON()) },
      message: 'Orders retrieved',
      pagination,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/orders/:id - one order (owner or admin only)
 */
async function details(req, res, next) {
  try {
    const order = await orderService.getOrderForUser(req.params.id, req.user);
    return sendSuccess(res, { data: { order: order.toJSON() }, message: 'Order retrieved' });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/orders/:id/cancel - customer cancellation before shipping
 */
async function cancel(req, res, next) {
  try {
    const order = await orderService.cancelOrder(req.user._id, req.params.id);
    return sendSuccess(res, { data: { order: order.toJSON() }, message: 'Order cancelled' });
  } catch (error) {
    return next(error);
  }
}

module.exports = { create, list, details, cancel };
