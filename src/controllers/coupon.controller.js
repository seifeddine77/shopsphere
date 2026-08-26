const couponService = require('../services/coupon.service');
const cartService = require('../services/cart.service');
const { sendSuccess } = require('../utils/response');

/**
 * POST /api/coupons/validate
 * The subtotal is ALWAYS taken from the caller's live server-side cart -
 * a client-provided amount is never trusted.
 */
async function validate(req, res, next) {
  try {
    const cart = await cartService.getCartSummary(req.user._id);
    if (!cart.items.length) {
      return sendSuccess(res, { message: 'Your cart is empty', data: { valid: false } });
    }

    try {
      const coupon = await couponService.validateCoupon(req.body.code, cart.subtotal);
      return sendSuccess(res, {
        data: { valid: true, ...coupon, subtotal: cart.subtotal },
        message: `Coupon ${coupon.code} applied: -$${coupon.discountAmount.toFixed(2)}`,
      });
    } catch (error) {
      return sendSuccess(res, {
        data: { valid: false, code: req.body.code },
        message: error.message,
      });
    }
  } catch (error) {
    return next(error);
  }
}

module.exports = { validate };
