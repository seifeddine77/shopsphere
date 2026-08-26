const Joi = require('joi');

const objectIdRule = Joi.string().hex().length(24).required().messages({
  'any.required': 'Product is required',
  'string.hex': 'Invalid product identifier',
  'string.length': 'Invalid product identifier',
});

const quantityRule = Joi.number().integer().min(1).max(99).required().messages({
  'any.required': 'Quantity is required',
  'number.min': 'Quantity must be at least 1',
  'number.max': 'Quantity cannot exceed 99',
  'number.integer': 'Quantity must be a whole number',
});

const addToCartSchema = Joi.object({
  productId: objectIdRule,
  quantity: Joi.number().integer().min(1).max(99).default(1),
});

const updateCartItemSchema = Joi.object({ quantity: quantityRule });

const moveToCartSchema = Joi.object({
  quantity: Joi.number().integer().min(1).max(99).default(1),
});

const productIdParamSchema = Joi.object({ productId: objectIdRule });

module.exports = {
  addToCartSchema,
  updateCartItemSchema,
  moveToCartSchema,
  productIdParamSchema,
};
