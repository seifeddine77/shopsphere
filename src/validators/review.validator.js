const Joi = require('joi');

const ratingRule = Joi.number().integer().min(1).max(5).required().messages({
  'any.required': 'Please choose a rating',
  'number.min': 'Rating must be between 1 and 5',
  'number.max': 'Rating must be between 1 and 5',
  'number.integer': 'Rating must be a whole number',
});

const commentRule = Joi.string().trim().min(10).max(2000).required().messages({
  'any.required': 'Please write a short comment',
  'string.empty': 'Please write a short comment',
  'string.min': 'Comment must be at least 10 characters',
  'string.max': 'Comment cannot exceed 2000 characters',
});

const createReviewSchema = Joi.object({
  rating: ratingRule,
  comment: commentRule,
});

const updateReviewSchema = Joi.object({
  rating: ratingRule,
  comment: commentRule,
});

module.exports = { createReviewSchema, updateReviewSchema };
