const orderService = require('../services/order.service');
const { sendSuccess } = require('../utils/response');

/**
 * POST /api/orders - run the full checkout pipeline
 */
async function create(req, res, next) {
  try {
    const userId = req.user ? req.user._id : null;
    const order = await orderService.createOrder(userId, req.body);
    return sendSuccess(res, {
      status: 201,
      data: {
        order: order.toJSON(),
        guestToken: order.guestToken || undefined,
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
 * GET /api/orders/:id - one order (owner, guest token, or admin only)
 */
async function details(req, res, next) {
  try {
    const guestToken = req.query.token || req.headers['x-guest-token'];
    const order = await orderService.getOrderForUser(req.params.id, req.user, guestToken);
    return sendSuccess(res, { data: { order: order.toJSON() }, message: 'Order retrieved' });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/orders/track?orderNumber=...&email=...
 */
async function track(req, res, next) {
  try {
    const { orderNumber, email } = req.query;
    if (!orderNumber || !email) {
      return res.status(400).json({ success: false, message: 'Order number and email are required' });
    }
    const order = await orderService.getGuestOrderByNumber(orderNumber, email);
    return sendSuccess(res, { data: { order: order.toJSON() }, message: 'Order retrieved' });
  } catch (error) {
    return next(error);
  }
}

const invoiceService = require('../services/invoice.service');

/**
 * GET /api/orders/:id/invoice - stream PDF invoice
 */
async function downloadInvoice(req, res, next) {
  try {
    const guestToken = req.query.token || req.headers['x-guest-token'];
    const order = await orderService.getOrderForUser(req.params.id, req.user, guestToken);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${order.orderNumber}.pdf"`);
    
    invoiceService.generateInvoicePDF(order, res);
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

module.exports = { create, list, details, track, downloadInvoice, cancel };
