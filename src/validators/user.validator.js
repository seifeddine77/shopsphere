const Joi = require('joi');

/* ------------------------------ Profile ----------------------------------- */

const updateProfileSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(50).required().messages({
    'any.required': 'First name is required',
    'string.min': 'First name must be at least 2 characters',
  }),
  lastName: Joi.string().trim().min(2).max(50).required().messages({
    'any.required': 'Last name is required',
  }),
  phone: Joi.string().trim().allow('')
    .pattern(/^\+?[0-9\s\-().]{6,20}$/)
    .messages({ 'string.pattern.base': 'Please provide a valid phone number' }),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    'any.required': 'Current password is required',
  }),
  newPassword: Joi.string()
    .min(8).max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.min': 'New password must be at least 8 characters long',
      'string.pattern.base': 'New password needs upper & lower case letters and a digit',
      'any.required': 'New password is required',
    }),
  confirmPassword: Joi.valid(Joi.ref('newPassword')).required().messages({
    'any.only': 'Passwords do not match',
    'any.required': 'Password confirmation is required',
  }),
});

/* ------------------------------- Addresses --------------------------------- */

const addressSchema = Joi.object({
  label: Joi.string().trim().max(30).default('Home'),
  fullName: Joi.string().trim().min(2).max(100).required(),
  phone: Joi.string().trim().pattern(/^\+?[0-9\s\-().]{6,20}$/).required(),
  street: Joi.string().trim().min(3).max(200).required(),
  city: Joi.string().trim().min(2).max(80).required(),
  state: Joi.string().trim().max(80).allow('').default(''),
  postalCode: Joi.string().trim().min(2).max(20).required(),
  country: Joi.string().trim().min(2).max(80).required(),
  isDefault: Joi.boolean().default(false),
});

const addAddressSchema = addressSchema;

const addressIdParamsSchema = Joi.object({
  addressId: Joi.string().hex().length(24).required(),
});

/* ------------------------------ Newsletter ---------------------------------- */

const subscribeSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).trim().lowercase()
    .max(254).required()
    .messages({
      'any.required': 'Email is required',
      'string.email': 'Please provide a valid email address',
    }),
  source: Joi.string().valid('footer', 'home', 'checkout').default('footer'),
});

/* ------------------------------- Settings ------------------------------------ */

const updateSettingsSchema = Joi.object({
  shippingFlatRate: Joi.number().min(0).allow(null),
  shippingFreeThreshold: Joi.number().min(0).allow(null),
  lowStockThreshold: Joi.number().integer().min(0).allow(null),
}).min(1);

module.exports = {
  updateProfileSchema,
  changePasswordSchema,
  addAddressSchema,
  addressIdParamsSchema,
  subscribeSchema,
  updateSettingsSchema,
};
