const Joi = require('joi');

const passwordRule = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  .messages({
    'string.min': 'Password must be at least 8 characters long',
    'string.max': 'Password must not exceed 128 characters',
    'string.pattern.base':
      'Password must contain at least one lowercase letter, one uppercase letter and one digit',
    'any.required': 'Password is required',
    'string.empty': 'Password is required',
  });

const emailRule = Joi.string()
  .email({ tlds: { allow: false } })
  .lowercase()
  .trim()
  .max(254)
  .required()
  .messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
    'string.empty': 'Email is required',
  });

const registerSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(50).required().messages({
    'string.min': 'First name must be at least 2 characters',
    'string.max': 'First name must not exceed 50 characters',
    'any.required': 'First name is required',
    'string.empty': 'First name is required',
  }),
  lastName: Joi.string().trim().min(2).max(50).required().messages({
    'string.min': 'Last name must be at least 2 characters',
    'string.max': 'Last name must not exceed 50 characters',
    'any.required': 'Last name is required',
    'string.empty': 'Last name is required',
  }),
  email: emailRule,
  password: passwordRule,
  confirmPassword: Joi.valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only': 'Passwords do not match',
      'any.required': 'Password confirmation is required',
      'string.empty': 'Password confirmation is required',
    }),
  phone: Joi.string()
    .allow('')
    .pattern(/^\+?[0-9\s\-().]{6,20}$/)
    .messages({
      'string.pattern.base': 'Please provide a valid phone number',
    }),
});

const loginSchema = Joi.object({
  email: emailRule,
  password: Joi.string().required().messages({
    'any.required': 'Password is required',
    'string.empty': 'Password is required',
  }),
});

const forgotPasswordSchema = Joi.object({ email: emailRule });

const resetPasswordSchema = Joi.object({
  token: Joi.string().hex().length(64).required().messages({
    'string.hex': 'Invalid reset token format',
    'string.length': 'Invalid reset token format',
    'any.required': 'Reset token is required',
    'string.empty': 'Reset token is required',
  }),
  password: passwordRule,
  confirmPassword: Joi.valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only': 'Passwords do not match',
      'any.required': 'Password confirmation is required',
      'string.empty': 'Password confirmation is required',
    }),
});

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
