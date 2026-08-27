const Joi = require('joi');

/* ------------------------------- Products -------------------------------- */

const imageRule = Joi.string()
  .trim()
  .max(300)
  .pattern(/^\/[^\s]*$|^https?:\/\/\S+$/)
  .messages({
    'string.pattern.base': 'Image must be a local path starting with / or an http(s) URL',
  });

const PRODUCT_REQUIRED_FIELDS = ['name', 'description', 'price', 'category', 'brand', 'sku'];

const productCreateSchema = Joi.object({
  name: Joi.string().trim().min(2).max(150).required().messages({
    'any.required': 'Product name is required',
    'string.empty': 'Product name is required',
    'string.min': 'Product name must be at least 2 characters',
  }),
  description: Joi.string().trim().min(10).max(5000).required().messages({
    'any.required': 'Description is required',
    'string.empty': 'Description is required',
    'string.min': 'Description must be at least 10 characters',
  }),
  price: Joi.number().min(0).max(10000000).precision(2).required().messages({
    'any.required': 'Price is required',
    'number.min': 'Price cannot be negative',
    'number.base': 'Price must be a number',
  }),
  discountPrice: Joi.number().min(0).max(10000000).precision(2).allow(null).optional(),
  images: Joi.array().items(imageRule).max(20).default([]),
  category: Joi.string().hex().length(24).required().messages({
    'any.required': 'Category is required',
    'string.hex': 'Invalid category identifier',
    'string.length': 'Invalid category identifier',
  }),
  brand: Joi.string().hex().length(24).required().messages({
    'any.required': 'Brand is required',
    'string.hex': 'Invalid brand identifier',
    'string.length': 'Invalid brand identifier',
  }),
  stock: Joi.number().integer().min(0).max(1000000).default(0).messages({
    'number.min': 'Stock cannot be negative',
    'number.integer': 'Stock must be a whole number',
  }),
  sku: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z0-9][A-Z0-9-]{2,49}$/)
    .required()
    .messages({
      'any.required': 'SKU is required',
      'string.pattern.base': 'SKU must be 3-50 characters (letters, digits, dashes)',
    }),
  specifications: Joi.object()
    .pattern(Joi.string(), Joi.string().allow(''))
    .default({}),
  variants: Joi.array().items(
    Joi.object({
      _id: Joi.string().hex().length(24).optional(),
      sku: Joi.string().trim().uppercase().allow('').optional(),
      name: Joi.string().trim().min(1).max(100).required(),
      price: Joi.number().min(0).max(10000000).precision(2).required(),
      discountPrice: Joi.number().min(0).max(10000000).precision(2).allow(null).optional(),
      stock: Joi.number().integer().min(0).max(1000000).default(0),
      images: Joi.array().items(imageRule).max(10).default([]),
      attributes: Joi.object().pattern(Joi.string(), Joi.string().allow('')).default({}),
      isActive: Joi.boolean().default(true),
    }),
  ).default([]),
  attributes: Joi.array().items(
    Joi.object({
      name: Joi.string().trim().required(),
      label: Joi.string().trim().allow('').default(''),
      values: Joi.array().items(Joi.string().trim().required()).min(1).required(),
    }),
  ).default([]),
  isFeatured: Joi.boolean().default(false),
  isActive: Joi.boolean().default(true),
});

// Partial version for PUT - every field optional, but at least one required
const productUpdateSchema = productCreateSchema.fork(PRODUCT_REQUIRED_FIELDS, (field) => field.optional()).min(1);

/* ------------------------------ Categories -------------------------------- */

const categoryCreateSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required().messages({
    'any.required': 'Category name is required',
    'string.empty': 'Category name is required',
  }),
  description: Joi.string().trim().max(1000).allow('').default(''),
  image: imageRule.allow('').default(''),
  parent: Joi.string().hex().length(24).allow(null, '').optional(),
  order: Joi.number().integer().min(0).default(0),
  isActive: Joi.boolean().default(true),
});

const categoryUpdateSchema = categoryCreateSchema.fork(['name'], (field) => field.optional()).min(1);

/* -------------------------------- Brands ---------------------------------- */

const brandCreateSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required().messages({
    'any.required': 'Brand name is required',
    'string.empty': 'Brand name is required',
  }),
  description: Joi.string().trim().max(1000).allow('').default(''),
  logo: imageRule.allow('').default(''),
  isActive: Joi.boolean().default(true),
});

const brandUpdateSchema = brandCreateSchema.fork(['name'], (field) => field.optional()).min(1);

module.exports = {
  productCreateSchema,
  productUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  brandCreateSchema,
  brandUpdateSchema,
};
