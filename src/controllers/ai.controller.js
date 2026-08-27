const aiService = require('../services/ai.service');
const { sendSuccess } = require('../utils/response');

/**
 * POST /api/ai/chat - Shopping Advisor conversational assistant
 */
async function chat(req, res, next) {
  try {
    const { message, history, lang } = req.body || {};
    const effectiveLang = lang || req.lang || req.query.lang || (req.cookies && req.cookies.lang) || 'en';
    const response = await aiService.chatAdvisor(message, history, effectiveLang);
    return sendSuccess(res, {
      message: 'AI recommendation generated',
      data: response,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/ai/reviews/:slug - AI Review Summary
 */
async function reviewSummary(req, res, next) {
  try {
    const effectiveLang = req.lang || req.query.lang || (req.cookies && req.cookies.lang) || 'en';
    const summary = await aiService.summarizeReviews(req.params.slug, effectiveLang);
    return sendSuccess(res, {
      message: 'Review summary generated',
      data: { summary },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/ai/generate-product - AI Product Copywriting for Admin
 */
async function generateProduct(req, res, next) {
  try {
    const effectiveLang = req.body?.lang || req.lang || req.query.lang || 'en';
    const copy = await aiService.generateProductCopy({ ...req.body, lang: effectiveLang });
    return sendSuccess(res, {
      message: 'Product copy generated',
      data: { copy },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/ai/admin-copilot - Admin Executive Intelligence Assistant
 */
async function adminCopilot(req, res, next) {
  try {
    const { prompt, lang } = req.body || {};
    const effectiveLang = lang || req.lang || req.query.lang || (req.cookies && req.cookies.lang) || 'en';
    const result = await aiService.adminCopilot(prompt, effectiveLang);
    return sendSuccess(res, {
      message: 'Admin insights generated',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  chat,
  reviewSummary,
  generateProduct,
  adminCopilot,
};

