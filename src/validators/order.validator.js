const Joi = require('joi');

/* ------------------------------ Shipping ---------------------------------- */

const shippingAddressSchema = Joi.object({
  label: Joi.string().trim().max(30).default('Home'),
  fullName: Joi.string().trim().min(2).max(100).required().messages({
    'any.required': 'Full name is required',
    'string.empty': 'Full name is required',
  }),
  phone: Joi.string().trim().pattern(/^\+?[0-9\s\-().]{6,20}$/).required().messages({
    'any.required': 'Phone number is required',
    'string.pattern.base': 'Please provide a valid phone number',
  }),
  street: Joi.string().trim().min(3).max(200).required().messages({
    'any.required': 'Street address is required',
  }),
  city: Joi.string().trim().min(2).max(80).required().messages({
    'any.required': 'City is required',
  }),
  state: Joi.string().trim().max(80).allow('').default(''),
  postalCode: Joi.string().trim().min(2).max(20).required().messages({
    'any.required': 'Postal code is required',
  }),
  country: Joi.string().trim().min(2).max(80).required().messages({
    'any.required': 'Country is required',
  }),
});

// In-memory only: validated for format, never stored anywhere
const cardSchema = Joi.object({
  number: Joi.string().replace(/\s+/g, '').pattern(/^\d{12,19}$/).required()
    .messages({ 'string.pattern.base': 'Card number must be 12-19 digits' }),
  expiry: Joi.string().pattern(/^(0[1-9]|1[0-2])\/\d{2}$/).required()
    .messages({ 'string.pattern.base': 'Expiry must use MM/YY format' }),
  cvc: Joi.string().replace(/\s+/g, '').pattern(/^\d{3,4}$/).required()
    .messages({ 'string.pattern.base': 'CVC must be 3-4 digits' }),
});

const customerSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required().messages({
    'any.required': 'Email is required for guest checkout',
    'string.email': 'Please provide a valid email address',
  }),
  firstName: Joi.string().trim().min(2).max(50).required().messages({
    'any.required': 'First name is required',
  }),
  lastName: Joi.string().trim().min(2).max(50).required().messages({
    'any.required': 'Last name is required',
  }),
  phone: Joi.string().trim().pattern(/^\+?[0-9\s\-().]{6,20}$/).optional().allow(''),
});

const guestItemSchema = Joi.object({
  productId: Joi.string().hex().length(24).required(),
  quantity: Joi.number().integer().min(1).max(99).required(),
  variantId: Joi.string().allow(null, '').optional(),
});

const createOrderSchema = Joi.object({
  customer: customerSchema.optional(),
  items: Joi.array().items(guestItemSchema).min(1).optional(),
  shippingAddressId: Joi.string().hex().length(24),
  shippingAddress: shippingAddressSchema,
  saveAddress: Joi.boolean().default(false),
  paymentMethod: Joi.string().valid('COD', 'CARD').required().messages({
    'any.required': 'Please choose a payment method',
    'any.only': 'Unsupported payment method',
  }),
  couponCode: Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{3,20}$/)
    .allow(null, '')
    .default(null),
  card: Joi.when('paymentMethod', {
    is: 'CARD',
    then: cardSchema.required().messages({ 'any.required': 'Card details are required' }),
    otherwise: Joi.forbidden(),
  }),
})
  .xor('shippingAddressId', 'shippingAddress')
  .messages({ 'object.missing': 'Please provide a shipping address' });

const validateCouponSchema = Joi.object({
  code: Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{3,20}$/).required()
    .messages({
      'any.required': 'Coupon code is required',
      'string.pattern.base': 'Invalid coupon code format',
    }),
});

/* ------------------------- Admin status transitions ------------------------ */

const updateOrderStatusSchema = Joi.object({
  status: Joi.string().valid('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')
    .required()
    .messages({
      'any.required': 'Target status is required',
      'any.only': 'Unknown order status',
    }),
  note: Joi.string().trim().max(200).allow('').default(''),
  trackingNumber: Joi.string().trim().max(40).allow('').default(''),
});

module.exports = {
  createOrderSchema,
  validateCouponSchema,
  updateOrderStatusSchema,
};
