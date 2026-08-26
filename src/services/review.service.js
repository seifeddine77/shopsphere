const mongoose = require('mongoose');
const Review = require('../models/Review');
const Product = require('../models/Product');
const { Order } = require('../models/Order');
const { notFound, forbidden, conflict } = require('../utils/errors');

/** Any order that has not been cancelled proves a purchase */
const REVIEWABLE_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

const round1 = (value) => Math.round(value * 10) / 10;

/** Resolves a product by id or slug - reviews survive product deactivation */
async function resolveProduct(identifier) {
  const isObjectId = mongoose.isValidObjectId(identifier);
  const product = await Product.findOne(
    isObjectId ? { _id: identifier } : { slug: String(identifier).toLowerCase() },
  ).select('_id name slug rating reviewCount');
  if (!product) throw notFound('Product not found');
  return product;
}

/**
 * Recomputes denormalized aggregates on the product from APPROVED reviews.
 * Called after every mutation that can affect the approved set.
 */
async function recomputeProductRating(productId) {
  const [stats] = await Review.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId), isApproved: true } },
    { $group: { _id: '$product', average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  await Product.updateOne(
    { _id: productId },
    {
      rating: stats ? round1(stats.average) : 0,
      reviewCount: stats ? stats.count : 0,
    },
  );
}

/* ------------------------------- Eligibility ------------------------------- */

async function getMyReview(userId, productId) {
  return Review.findOne({ user: userId, product: productId });
}

async function hasVerifiedPurchase(userId, productId) {
  return Order.exists({
    user: userId,
    'items.product': productId,
    orderStatus: { $in: REVIEWABLE_STATUSES },
  });
}

/** Returns {allowed, reason} - reason drives the storefront messaging */
async function checkEligibility(userId, productId) {
  const existing = await getMyReview(userId, productId);
  if (existing) return { allowed: false, reason: 'already_reviewed' };

  const purchased = await hasVerifiedPurchase(userId, productId);
  return purchased
    ? { allowed: true, reason: 'ok' }
    : { allowed: false, reason: 'purchase_required' };
}

/* --------------------------------- Queries --------------------------------- */

async function listApproved(productId, query = {}) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 8, 1), 50);

  const filter = { product: productId, isApproved: true };
  const [reviews, totalItems] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'firstName lastName'),
    Review.countDocuments(filter),
  ]);

  return {
    reviews,
    pagination: {
      currentPage: page,
      totalPages: Math.max(Math.ceil(totalItems / limit), 1),
      totalItems,
      itemsPerPage: limit,
      hasNextPage: page < Math.ceil(totalItems / limit),
      hasPreviousPage: page > 1,
    },
  };
}

/* -------------------------------- Mutations --------------------------------- */

async function createReview(userId, identifier, payload) {
  const product = await resolveProduct(identifier);

  const eligibility = await checkEligibility(userId, product._id);
  if (!eligibility.allowed) {
    if (eligibility.reason === 'already_reviewed') {
      throw conflict('You have already reviewed this product');
    }
    throw forbidden('Only verified buyers can review this product');
  }

  let review;
  try {
    review = await Review.create({ user: userId, product: product._id, ...payload });
  } catch (error) {
    // Race against the unique index (double submit)
    if (error.code === 11000) throw conflict('You have already reviewed this product');
    throw error;
  }

  // Pending reviews do not change the public score, but the recomputation
  // guarantees the aggregates always reflect real database state.
  await recomputeProductRating(product._id);

  return review;
}

async function updateReview(userId, reviewId, payload) {
  const review = await Review.findById(reviewId);
  if (!review) throw notFound('Review not found');
  if (String(review.user) !== String(userId)) {
    throw forbidden('You can only edit your own reviews');
  }

  review.rating = payload.rating;
  review.comment = payload.comment;
  review.isApproved = false; // edits go back to the moderation queue
  await review.save();

  await recomputeProductRating(review.product);
  return review;
}

async function deleteReview(userId, role, reviewId) {
  const review = await Review.findById(reviewId);
  if (!review) throw notFound('Review not found');

  const isOwner = String(review.user) === String(userId);
  if (!isOwner && role !== 'ADMIN') {
    throw forbidden('You can only delete your own reviews');
  }

  await review.deleteOne();
  await recomputeProductRating(review.product);
  return review;
}

/* ------------------------------ Moderation ---------------------------------- */

async function setApproval(reviewId, approved) {
  const review = await Review.findByIdAndUpdate(
    reviewId,
    { isApproved: approved },
    { new: true },
  );
  if (!review) throw notFound('Review not found');

  await recomputeProductRating(review.product);
  return review;
}

async function listForAdmin(filter = {}, query = {}) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);

  if (query.approved === 'true') filter.isApproved = true;
  else if (query.approved === 'false') filter.isApproved = false;

  const [reviews, totalItems] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'firstName lastName email')
      .populate('product', 'name slug'),
    Review.countDocuments(filter),
  ]);

  return {
    reviews,
    pagination: {
      currentPage: page,
      totalPages: Math.max(Math.ceil(totalItems / limit), 1),
      totalItems,
      itemsPerPage: limit,
      hasNextPage: page < Math.ceil(totalItems / limit),
      hasPreviousPage: page > 1,
    },
  };
}

module.exports = {
  resolveProduct,
  checkEligibility,
  getMyReview,
  hasVerifiedPurchase,
  listApproved,
  createReview,
  updateReview,
  deleteReview,
  setApproval,
  listForAdmin,
  recomputeProductRating,
};
