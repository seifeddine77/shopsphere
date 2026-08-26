/**
 * Stripe gateway & webhook tests.
 * Uses an isolated module registry with STRIPE_* env vars so the real
 * adapter activates; webhook signatures are computed locally - no network.
 */

const request = require('supertest');
const crypto = require('crypto');

function signPayload(secret, payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return { timestamp, signature };
}

describe('Stripe integration', () => {
  let app;
  let gateways;
  const WEBHOOK_SECRET = 'whsec_test_1234567890';

  beforeAll(async () => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

    gateways = require('../../src/services/gateways');
    app = require('../../src/app');

    const { connectTestDatabase } = require('../setup/db');
    await connectTestDatabase();
  });

  afterAll(async () => {
    const { disconnectTestDatabase } = require('../setup/db');
    await disconnectTestDatabase();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it('activates the stripe gateway when a secret key is present', () => {
    expect(gateways.isStripeEnabled()).toBe(true);
    expect(gateways.getGateway('CARD').name).toBe('stripe');
    expect(gateways.getGateway('COD').name).toBe('cod');
  });

  it('accepts correctly signed webhook events', async () => {
    const payload = JSON.stringify({
      id: 'evt_test_1',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_missing_1' } },
    });
    const { timestamp, signature } = signPayload(WEBHOOK_SECRET, payload);

    const response = await request(app)
      .post('/api/payments/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', `t=${timestamp},v1=${signature}`)
      .send(payload);

    // Unknown intent id -> acknowledged without side effects
    expect(response.status).toBe(200);
    expect(response.body.received).toBe(true);
  });

  it('rejects webhooks with an invalid signature (400)', async () => {
    const payload = JSON.stringify({ type: 'payment_intent.succeeded', data: { object: {} } });
    const { timestamp, signature } = signPayload('whsec_wrong_secret', payload);

    const response = await request(app)
      .post('/api/payments/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', `t=${timestamp},v1=${signature}`)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/signature/i);
  });

  it('finalizes the matching order when payment_intent.succeeded arrives', async () => {
    const { Order } = require('../../src/models/Order');
    await Promise.all([Order.syncIndexes()]);
    const { seedTaxonomy, seedProducts } = require('../setup/fixtures');
    const taxonomy = await seedTaxonomy();
    await seedProducts(taxonomy);

    const created = await Order.create({
      orderNumber: 'SS-WEBHOOK-TEST',
      user: (await require('../../src/models/User').create({
        firstName: 'Web',
        lastName: 'Hook',
        email: `hook-${Date.now()}@test.io`,
        password: 'Passw0rdWH',
      }))._id,
      items: [{
        product: taxonomy.category._id, // reference shape only
        name: 'Whatever',
        slug: 'whatever',
        sku: 'WH-1',
        unitPrice: 10,
        quantity: 1,
        lineTotal: 10,
      }],
      shippingAddress: {
        fullName: 'W H', phone: '+216 12 345', street: '1 Way',
        city: 'Tunis', postalCode: '1000', country: 'Tunisia',
      },
      paymentMethod: 'CARD',
      paymentStatus: 'PENDING',
      statusHistory: [{ status: 'PENDING', note: 'Order placed' }],
      subtotal: 10,
      shippingCost: 5.99,
      discount: 0,
      total: 15.99,
      paymentIntentId: 'pi_success_123',
    });

    const payload = JSON.stringify({
      id: 'evt_test_2',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_success_123' } },
    });
    const { timestamp, signature } = signPayload(WEBHOOK_SECRET, payload);

    const response = await request(app)
      .post('/api/payments/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', `t=${timestamp},v1=${signature}`)
      .send(payload);

    expect(response.status).toBe(200);

    const finalized = await Order.findById(created._id);
    expect(finalized.paymentStatus).toBe('PAID');
    expect(finalized.orderStatus).toBe('CONFIRMED');
    expect(finalized.statusHistory.map((h) => h.status)).toEqual(['PENDING', 'CONFIRMED']);

    // Idempotent replay must not duplicate history
    await request(app)
      .post('/api/payments/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', `t=${timestamp},v1=${signature}`)
      .send(payload);

    const replayed = await Order.findById(created._id);
    expect(replayed.statusHistory).toHaveLength(2);
  });
});
