const reviewService = require('../services/review.service');
const { sendSuccess } = require('../utils/response');

/**
 * GET /api/products/:identifier/reviews - approved, paginated
 */
async function listForProduct(req, res, next) {
  try {
    const product = await reviewService.resolveProduct(req.params.identifier);
    const { reviews, pagination } = await reviewService.listApproved(product._id, req.query);

    return sendSuccess(res, {
      data: { reviews: reviews.map((review) => review.toJSON()) },
      message: 'Reviews retrieved',
      pagination,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/products/:identifier/reviews - verified buyers only
 */
async function create(req, res, next) {
  try {
    const review = await reviewService.createReview(req.user._id, req.params.identifier, req.body);
    return sendSuccess(res, {
      status: 201,
      data: { review: review.toJSON() },
      message: 'Thank you! Your review was submitted and is awaiting approval.',
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PUT /api/reviews/:id - owner only; sends the review back to moderation
 */
async function update(req, res, next) {
  try {
    const review = await reviewService.updateReview(req.user._id, req.params.id, req.body);
    return sendSuccess(res, {
      data: { review: review.toJSON() },
      message: 'Review updated - it will be re-checked before appearing again.',
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * DELETE /api/reviews/:id - owner or admin
 */
async function remove(req, res, next) {
  try {
    await reviewService.deleteReview(req.user._id, req.user.role, req.params.id);
    return sendSuccess(res, { message: 'Review deleted' });
  } catch (error) {
    return next(error);
  }
}

/* ------------------------------ Admin moderation ---------------------------- */

async function adminList(req, res, next) {
  try {
    const { reviews, pagination } = await reviewService.listForAdmin({}, req.query);
    return sendSuccess(res, {
      data: { reviews: reviews.map((review) => review.toJSON()) },
      message: 'Reviews retrieved',
      pagination,
    });
  } catch (error) {
    return next(error);
  }
}

async function approve(req, res, next) {
  try {
    const review = await reviewService.setApproval(req.params.id, true);
    return sendSuccess(res, { data: { review: review.toJSON() }, message: 'Review approved' });
  } catch (error) {
    return next(error);
  }
}

async function reject(req, res, next) {
  try {
    const review = await reviewService.setApproval(req.params.id, false);
    return sendSuccess(res, { data: { review: review.toJSON() }, message: 'Review rejected' });
  } catch (error) {
    return next(error);
  }
}

async function voteHelpful(req, res, next) {
  try {
    const review = await reviewService.voteHelpful(req.params.id);
    return sendSuccess(res, {
      data: { helpfulVotes: review.helpfulVotes },
      message: 'Thank you for your feedback!',
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listForProduct,
  create,
  update,
  remove,
  adminList,
  approve,
  reject,
  voteHelpful,
};

