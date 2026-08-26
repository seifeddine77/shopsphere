const Subscriber = require('../models/Subscriber');
const { sendSuccess } = require('../utils/response');

/**
 * POST /api/newsletter
 * Identical response for new + existing emails (anti-enumeration).
 */
async function subscribe(req, res, next) {
  try {
    const existing = await Subscriber.findOne({ email: req.body.email });
    if (!existing) {
      await Subscriber.create({
        email: req.body.email,
        source: req.body.source || 'footer',
      });
      return sendSuccess(res, {
        status: 201,
        message: 'Welcome aboard! Please check your inbox for a confirmation.',
      });
    }

    return sendSuccess(res, { message: 'You are already on the list - thank you!' });
  } catch (error) {
    return next(error);
  }
}

/** GET /api/admin/newsletter [admin] - subscriber export list */
async function listSubscribers(_req, res, next) {
  try {
    const subscribers = await Subscriber.find().sort({ createdAt: -1 }).select('email source createdAt');
    return sendSuccess(res, {
      data: { subscribers: subscribers.map((s) => s.toJSON()) },
      message: 'Subscribers retrieved',
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { subscribe, listSubscribers };
