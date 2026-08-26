const Joi = require('joi');

const couponCreateSchema = Joi.object({
  code: Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{3,20}$/).required().messages({
    'any.required': 'Coupon code is required',
    'string.pattern.base': 'Code must be 3-20 letters/digits',
  }),
  discountType: Joi.string().valid('PERCENTAGE', 'FIXED').required().messages({
    'any.required': 'Discount type is required',
    'any.only': 'Discount type must be PERCENTAGE or FIXED',
  }),
  discountValue: Joi.number().min(0).max(100000).required().messages({
    'any.required': 'Discount value is required',
    'number.min': 'Discount value cannot be negative',
  }),
  minimumAmount: Joi.number().min(0).default(0),
  maximumDiscount: Joi.number().min(0).allow(null).default(null),
  expirationDate: Joi.date().iso().allow(null).default(null),
  usageLimit: Joi.number().integer().min(0).default(0),
  isActive: Joi.boolean().default(true),
});

const userStatusSchema = Joi.object({
  isActive: Joi.boolean().required().messages({
    'any.required': 'isActive is required',
  }),
});

const userRoleSchema = Joi.object({
  role: Joi.string().valid('USER', 'ADMIN').required().messages({
    'any.required': 'Role is required',
    'any.only': 'Role must be USER or ADMIN',
  }),
});

module.exports = { couponCreateSchema, userStatusSchema, userRoleSchema };
