const router = require('express').Router();

const orderController = require('../controllers/order.controller');
const couponController = require('../controllers/coupon.controller');
const { protect, optionalAuth } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation.middleware');
const { createOrderSchema, validateCouponSchema } = require('../validators/order.validator');

// Mounted at /api root - protection declared per-route (see shopping.routes note)

router.post('/coupons/validate', optionalAuth, validate(validateCouponSchema), couponController.validate);

router.post('/orders', optionalAuth, validate(createOrderSchema), orderController.create);
router.get('/orders/track', orderController.track);
router.get('/orders', protect, orderController.list);
router.get('/orders/:id', optionalAuth, orderController.details);
router.get('/orders/:id/invoice', optionalAuth, orderController.downloadInvoice);
router.post('/orders/:id/cancel', protect, orderController.cancel);

module.exports = router;
