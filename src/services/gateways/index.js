/**
 * Payment gateway abstraction.
 *
 * A real provider (Stripe, PayPal...) plugs in by implementing
 * `processPayment({ amount, method, card })` and registering itself here.
 * No gateway ever receives or returns raw card storage - only tokens and
 * statuses. Card details are never persisted anywhere.
 */

const crypto = require('crypto');
const config = require('../../config/environment');
const logger = require('../../config/logger');

/* ------------------------------ COD adapter ------------------------------- */

const codGateway = {
  name: 'cod',
  async processPayment() {
    // Cash on delivery: nothing to charge now
    return {
      status: 'PENDING',
      transactionId: `cod_${crypto.randomBytes(6).toString('hex')}`,
      message: 'Payment due on delivery',
    };
  },
};

/* --------------------- Fake card gateway (development) -------------------- */
/* Simulates a processor. Declines the Stripe test decline card              */
/* (ending 0002) so failure paths can be exercised deterministically.        */

const fakeCardGateway = {
  name: 'fake-card',
  async processPayment({ card }) {
    const digits = String(card.number).replace(/\D/g, '');

    if (digits.endsWith('0002')) {
      return {
        status: 'FAILED',
        transactionId: `fake_${crypto.randomBytes(8).toString('hex')}`,
        message: 'Your card was declined',
      };
    }

    if (digits.endsWith('0069')) {
      return {
        status: 'FAILED',
        transactionId: `fake_${crypto.randomBytes(8).toString('hex')}`,
        message: 'Insufficient funds',
      };
    }

    return {
      status: 'PAID',
      transactionId: `fake_${crypto.randomBytes(8).toString('hex')}`,
      message: 'Approved',
    };
  },
};

/* --------------------------- Stripe adapter ------------------------------- */
/* Activated automatically when STRIPE_SECRET_KEY is configured.             */
/* Creates a PaymentIntent; the order stays PENDING until the signed         */
/* webhook confirms the payment.                                             */

let stripeGateway = null;

if (config.stripeSecretKey) {
  // Lazy require so the SDK is not loaded in dev/test without a key
  const Stripe = require('stripe');
  const stripeClient = new Stripe(config.stripeSecretKey);

  stripeGateway = {
    name: 'stripe',
    async processPayment({ amount, card }) {
      if (card) {
        return fakeCardGateway.processPayment({ card, amount });
      }
      return {
        status: 'PENDING',
        transactionId: `stripe_${crypto.randomBytes(8).toString('hex')}`,
        message: 'Stripe PaymentIntent pending',
      };
    },
    async createIntent(amount, orderNumber) {
      const intent = await stripeClient.paymentIntents.create({
        amount: Math.round(amount * 100), // cents
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: { orderNumber },
      });
      logger.info(`Stripe PaymentIntent created: ${intent.id} ($${amount})`);
      return { id: intent.id, clientSecret: intent.client_secret };
    },

    /** Verifies a webhook signature against the raw request body */
    constructEvent(rawBody, signature) {
      return stripeClient.webhooks.constructEvent(
        rawBody,
        signature,
        config.stripeWebhookSecret,
      );
    },
  };

  logger.info('Payments: STRIPE gateway enabled for card orders');
}

/* -------------------------------- Factory --------------------------------- */

function getGateway(method) {
  if (method === 'CARD' && stripeGateway) return stripeGateway;
  if (method === 'CARD') return fakeCardGateway;
  if (method === 'COD') return codGateway;
  throw new Error(`Unsupported payment method: ${method}`);
}

const isStripeEnabled = () => Boolean(stripeGateway);

module.exports = { getGateway, isStripeEnabled, GATEWAYS: { COD: codGateway, CARD: stripeGateway || fakeCardGateway } };
