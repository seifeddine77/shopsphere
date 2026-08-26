const router = require('express').Router();

const userController = require('../controllers/user.controller');
const { protect } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation.middleware');
const {
  updateProfileSchema,
  changePasswordSchema,
  addAddressSchema,
  addressIdParamsSchema,
} = require('../validators/user.validator');

// Mounted at /api root - protection declared per-route (see shopping.routes note).

router.get('/users/me', protect, userController.me);
router.put('/users/me', protect, validate(updateProfileSchema), userController.updateProfile);
router.put('/users/me/password', protect, validate(changePasswordSchema), userController.changePassword);
router.post('/users/me/addresses', protect, validate(addAddressSchema), userController.addAddress);
router.delete(
  '/users/me/addresses/:addressId',
  protect,
  validate(addressIdParamsSchema, 'params'),
  userController.removeAddress,
);

module.exports = router;
