const router = require('express').Router();

const adminController = require('../controllers/admin.controller');
const reviewController = require('../controllers/review.controller');
const { protect } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/admin.middleware');
const { validate } = require('../middlewares/validation.middleware');
const { updateOrderStatusSchema } = require('../validators/order.validator');
const {
  couponCreateSchema,
  userStatusSchema,
  userRoleSchema,
} = require('../validators/admin.validator');

// All admin API routes require authentication AND the ADMIN role
router.use(protect, adminOnly);

/* ------------------------------ Dashboard -------------------------------- */
router.get('/dashboard', adminController.dashboard);

/* -------------------------------- Orders --------------------------------- */
router.get('/orders/export', adminController.exportOrders);
router.get('/orders', adminController.listOrders);
router.put('/orders/:id/status', validate(updateOrderStatusSchema), adminController.updateOrderStatus);

/* --------------------------------- Users ---------------------------------- */
router.get('/users', adminController.listUsers);
router.put('/users/:id/status', validate(userStatusSchema), adminController.setUserStatus);
router.put('/users/:id/role', validate(userRoleSchema), adminController.setUserRole);

/* -------------------------------- Coupons --------------------------------- */
router.get('/coupons', adminController.listCoupons);
router.post('/coupons', validate(couponCreateSchema), adminController.createCoupon);
router.delete('/coupons/:id', adminController.deleteCoupon);

/* -------------------------- Review moderation ---------------------------- */
router.get('/reviews', reviewController.adminList);
router.put('/reviews/:id/approve', reviewController.approve);
router.put('/reviews/:id/reject', reviewController.reject);
router.delete('/reviews/:id', reviewController.remove);

/* ------------------------------- Settings --------------------------------- */
const settingsService = require('../services/settings.service');
const { updateSettingsSchema } = require('../validators/user.validator');

router.get('/settings', async (_req, res, next) => {
  try {
    const settings = await settingsService.getSettings();
    return res.status(200).json({ success: true, data: { settings }, message: 'Settings retrieved' });
  } catch (error) { return next(error); }
});

router.put('/settings', validate(updateSettingsSchema), async (req, res, next) => {
  try {
    const settings = await settingsService.updateSettings(req.body);
    return res.status(200).json({ success: true, data: { settings }, message: 'Settings saved' });
  } catch (error) { return next(error); }
});

/* ------------------------------ Attributes -------------------------------- */
const attributeController = require('../controllers/attribute.controller');
const {
  attributeCreateSchema,
  attributeUpdateSchema,
} = require('../validators/admin.validator');

router.get('/attributes', attributeController.list);
router.get('/attributes/:id', attributeController.getById);
router.post('/attributes', validate(attributeCreateSchema), attributeController.create);
router.put('/attributes/:id', validate(attributeUpdateSchema), attributeController.update);
router.delete('/attributes/:id', attributeController.remove);
router.post('/attributes/:id/options', attributeController.addOption);

module.exports = router;

