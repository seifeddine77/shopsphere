const express = require('express');

const logger = require('../config/logger');
const config = require('../config/environment');
const gateways = require('../services/gateways');
const emailService = require('../services/email.service');
const { Order } = require('../models/Order');
const Payment = require('../models/Payment');

/**
 * Stripe webhook - mounted BEFORE the JSON body parsers so the raw
 * signature-verified payload reaches the handler untouched.
 *
 * payment_intent.succeeded  -> order PAID (+ CONFIRMED) and customer emailed
 * payment_intent.payment_failed -> order flagged, stays actionable
 */
const router = express.Router();

router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
  let event;

  try {
    const stripeGateway = gateways.getGateway('CARD');
    if (!gateways.isStripeEnabled() || !config.stripeWebhookSecret) {
      return res.status(503).json({ received: false, message: 'Stripe webhooks not configured' });
    }
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ received: false, message: 'Missing signature' });
    }
    event = stripeGateway.constructEvent(req.body, signature);
  } catch (error) {
    logger.warn(`Stripe webhook signature verification failed: ${error.message}`);
    return res.status(400).json({ received: false, message: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        const order = await Order.findOne({ paymentIntentId: intent.id }).populate('user', 'firstName lastName email');

        if (!order) {
          logger.warn(`Stripe webhook: no order for intent ${intent.id}`);
          return res.json({ received: true });
        }
        if (order.paymentStatus === 'PAID') {
          return res.json({ received: true }); // idempotent replays
        }

        order.paymentStatus = 'PAID';
        if (order.orderStatus === 'PENDING') {
          order.orderStatus = 'CONFIRMED';
          order.statusHistory.push({ status: 'CONFIRMED', note: `Payment ${intent.id} confirmed` });
        }
        await order.save();
        await Payment.updateOne({ order: order._id }, { status: 'PAID', transactionId: intent.id });

        logger.info(`Stripe confirmed order ${order.orderNumber}`);
        if (order.user) {
          setImmediate(() => {
            emailService.sendOrderEmail(order.user, order, 'confirmed')
              .catch((emailError) => logger.error(`Order email failed: ${emailError.message}`));
          });
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object;
        await Payment.updateOne(
          { transactionId: intent.id },
          { status: 'FAILED', message: intent.last_payment_error ? intent.last_payment_error.message : 'Declined' },
        );
        logger.warn(`Stripe payment failed for intent ${intent.id}`);
        break;
      }

      default:
        // Unhandled event types are acknowledged silently
        break;
    }

    return res.json({ received: true });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
