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

const attributeOptionRule = Joi.object({
  label: Joi.string().trim().required(),
  value: Joi.string().trim().required(),
  colorCode: Joi.string().trim().allow('').default(''),
});

const attributeCreateSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required().messages({
    'any.required': 'Attribute name is required',
  }),
  label: Joi.string().trim().max(100).allow('').default(''),
  type: Joi.string().valid('TEXT', 'NUMBER', 'SELECT', 'COLOR', 'RADIO', 'CHECKBOX').default('SELECT'),
  options: Joi.array().items(attributeOptionRule).default([]),
  categories: Joi.array().items(Joi.string().hex().length(24)).default([]),
  isFilterable: Joi.boolean().default(true),
  isVariant: Joi.boolean().default(true),
  order: Joi.number().integer().default(0),
  isActive: Joi.boolean().default(true),
});

const attributeUpdateSchema = attributeCreateSchema.fork(['name'], (f) => f.optional()).min(1);

module.exports = {
  couponCreateSchema,
  userStatusSchema,
  userRoleSchema,
  attributeCreateSchema,
  attributeUpdateSchema,
};

