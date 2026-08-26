const router = require('express').Router();

const orderController = require('../controllers/order.controller');
const couponController = require('../controllers/coupon.controller');
const { protect } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation.middleware');
const { createOrderSchema, validateCouponSchema } = require('../validators/order.validator');

// Mounted at /api root - protection declared per-route (see shopping.routes note)

router.post('/coupons/validate', protect, validate(validateCouponSchema), couponController.validate);

router.post('/orders', protect, validate(createOrderSchema), orderController.create);
router.get('/orders', protect, orderController.list);
router.get('/orders/:id', protect, orderController.details);
router.post('/orders/:id/cancel', protect, orderController.cancel);

module.exports = router;
