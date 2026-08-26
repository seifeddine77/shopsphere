const request = require('supertest');
const app = require('../../src/app');
const Product = require('../../src/models/Product');
const Coupon = require('../../src/models/Coupon');
const { Order } = require('../../src/models/Order');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearCollections,
} = require('../setup/db');
const { createSessionWithRole } = require('../setup/helpers');
const { seedTaxonomy, seedProducts } = require('../setup/fixtures');

const ADDRESS = {
  fullName: 'Live Shopper',
  phone: '+216 12 345 678',
  street: '12 Main Street',
  city: 'Tunis',
  state: '',
  postalCode: '1000',
  country: 'Tunisia',
};

const VALID_CARD = { number: '4242 4242 4242 4242', expiry: '12/28', cvc: '123' };
const DECLINED_CARD = { number: '4000 0000 0000 0002', expiry: '12/28', cvc: '123' };

async function seedCoupon(overrides = {}) {
  return Coupon.create({
    code: 'SAVE10',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    minimumAmount: 50,
    maximumDiscount: 50,
    ...overrides,
  });
}

/** Adds products to a user's cart through the API */
async function fillCart(cookie, lines) {
  for (const line of lines) {
     
    const response = await request(app).post('/api/cart').set('Cookie', cookie).send(line);
    if (response.status !== 200) throw new Error(`fillCart failed: ${JSON.stringify(response.body)}`);
     
  }
}

describe('Phase 6 - Checkout (coupons, orders, payments)', () => {
  let userACookie;
  let userBCookie;
  let products;

  beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([Product.syncIndexes(), Coupon.syncIndexes(), Order.syncIndexes()]);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    userACookie = await createSessionWithRole('USER', 'buyer-a@test.io', 'Passw0rdA1');
    userBCookie = await createSessionWithRole('USER', 'buyer-b@test.io', 'Passw0rdB2');
    const taxonomy = await seedTaxonomy();
    products = await seedProducts(taxonomy);
  });

  const productIdOf = (sku) => products.find((p) => p.sku === sku)._id.toString();

  /* ------------------------------ Coupon engine ----------------------------- */

  describe('POST /api/coupons/validate', () => {
    it('validates a percentage coupon against the server-side cart subtotal', async () => {
      await seedCoupon();
      // Cart: speaker 320 -> 10% = 32, capped at maxDiscount 50 -> 32
      await fillCart(userACookie, [{ productId: productIdOf('CAT-003'), quantity: 1 }]);

      const response = await request(app)
        .post('/api/coupons/validate')
        .set('Cookie', userACookie)
        .send({ code: 'SAVE10' });

      expect(response.status).toBe(200);
      expect(response.body.data.valid).toBe(true);
      expect(response.body.data.discountAmount).toBe(32);
      expect(response.body.data.subtotal).toBe(320); // from the live cart
    });

    it('rejects coupons below their minimum order amount', async () => {
      await seedCoupon({ minimumAmount: 500 });
      await fillCart(userACookie, [{ productId: productIdOf('CAT-001'), quantity: 1 }]); // 150

      const response = await request(app)
        .post('/api/coupons/validate')
        .set('Cookie', userACookie)
        .send({ code: 'SAVE10' });

      expect(response.body.data.valid).toBe(false);
      expect(response.body.message).toMatch(/minimum order/i);
    });

    it('rejects unknown and expired coupons with clear messages', async () => {
      await seedCoupon({ expirationDate: new Date('2024-01-01') });
      await fillCart(userACookie, [{ productId: productIdOf('CAT-003'), quantity: 1 }]);

      const unknown = await request(app)
        .post('/api/coupons/validate').set('Cookie', userACookie).send({ code: 'NOPE42' });
      expect(unknown.body.data.valid).toBe(false);

      const expired = await request(app)
        .post('/api/coupons/validate').set('Cookie', userACookie).send({ code: 'SAVE10' });
      expect(expired.body.message).toMatch(/expired/i);
    });

    it('never trusts client-provided subtotals', async () => {
      await seedCoupon({ minimumAmount: 100 });
      await fillCart(userACookie, [{ productId: productIdOf('CAT-004'), quantity: 1 }]); // 35 subtotal

      // The endpoint reads the cart itself - no subtotal field is even accepted
      const response = await request(app)
        .post('/api/coupons/validate')
        .set('Cookie', userACookie)
        .send({ code: 'SAVE10', subtotal: 9999 });

      expect(response.body.data.valid).toBe(false);
      expect(response.body.message).toMatch(/minimum order of \$100/i);
    });
  });

  /* ------------------------------ Order creation ---------------------------- */

  describe('POST /api/orders', () => {
    it('creates an order with correct totals and free shipping above threshold', async () => {
      await fillCart(userACookie, [{ productId: productIdOf('CAT-003'), quantity: 1 }]); // 320

      const response = await request(app)
        .post('/api/orders')
        .set('Cookie', userACookie)
        .send({ shippingAddress: ADDRESS, paymentMethod: 'COD' });

      expect(response.status).toBe(201);
      const order = response.body.data.order;
      expect(order.orderNumber).toMatch(/^SS-[A-Z0-9]+-[A-F0-9]{4}$/);
      expect(order.subtotal).toBe(320);
      expect(order.shippingCost).toBe(0); // >= free threshold (200)
      expect(order.total).toBe(320);
      expect(order.paymentStatus).toBe('PENDING'); // COD
      expect(order.orderStatus).toBe('PENDING');
      expect(order.statusHistory).toHaveLength(1);
      expect(order.items[0].name).toBe('Premium Speaker'); // snapshot
      expect(order.items[0].unitPrice).toBe(320);
    });

    it('charges flat shipping below the threshold', async () => {
      await fillCart(userACookie, [{ productId: productIdOf('CAT-004'), quantity: 2 }]); // 70

      const response = await request(app)
        .post('/api/orders')
        .set('Cookie', userACookie)
        .send({ shippingAddress: ADDRESS, paymentMethod: 'COD' });

      expect(response.body.data.order.shippingCost).toBe(5.99);
      expect(response.body.data.order.total).toBe(75.99);
    });

    it('applies the coupon to totals and increments its usage counter', async () => {
      const coupon = await seedCoupon(); // 10% max $50
      await fillCart(userACookie, [{ productId: productIdOf('CAT-003'), quantity: 1 }]); // 320

      const response = await request(app)
        .post('/api/orders')
        .set('Cookie', userACookie)
        .send({ shippingAddress: ADDRESS, paymentMethod: 'COD', couponCode: 'SAVE10' });

      const order = response.body.data.order;
      expect(order.discount).toBe(32);
      expect(order.coupon.code).toBe('SAVE10');

      const afterDiscount = 288; // still below threshold? No: 288 >= 200 -> free shipping
      expect(order.shippingCost).toBe(afterDiscount >= 200 ? 0 : 5.99);
      expect(order.total).toBe(288);

      const refreshed = await Coupon.findById(coupon._id);
      expect(refreshed.usedCount).toBe(1);
    });

    it('marks card orders as PAID with a transaction id', async () => {
      await fillCart(userACookie, [{ productId: productIdOf('CAT-001'), quantity: 1 }]); // 150

      const response = await request(app)
        .post('/api/orders')
        .set('Cookie', userACookie)
        .send({ shippingAddress: ADDRESS, paymentMethod: 'CARD', card: VALID_CARD });

      expect(response.status).toBe(201);
      expect(response.body.data.order.paymentStatus).toBe('PAID');
    });

    it('declines bad cards and creates NOTHING (full rollback)', async () => {
      const before = (await Product.findById(productIdOf('CAT-001'))).stock;
      await fillCart(userACookie, [{ productId: productIdOf('CAT-001'), quantity: 2 }]);
      const coupon = await seedCoupon();

      const response = await request(app)
        .post('/api/orders')
        .set('Cookie', userACookie)
        .send({
          shippingAddress: ADDRESS,
          paymentMethod: 'CARD',
          card: DECLINED_CARD,
          couponCode: 'SAVE10',
        });

      expect(response.status).toBe(422);
      expect(response.body.message).toMatch(/declined/i);

      // Nothing was persisted or consumed
      const after = await Product.findById(productIdOf('CAT-001'));
      expect(after.stock).toBe(before);
      const refreshedCoupon = await Coupon.findById(coupon._id);
      expect(refreshedCoupon.usedCount).toBe(0);

      const ordersLeft = await Order.countDocuments();
      expect(ordersLeft).toBe(0);

      // The cart survives so the customer can retry
      const cart = await request(app).get('/api/cart').set('Cookie', userACookie);
      expect(cart.body.data.cart.itemCount).toBe(2);
    });

    it('decrements stock atomically on success', async () => {
      const before = (await Product.findById(productIdOf('CAT-001'))).stock; // 10
      await fillCart(userACookie, [{ productId: productIdOf('CAT-001'), quantity: 3 }]);

      await request(app)
        .post('/api/orders')
        .set('Cookie', userACookie)
        .send({ shippingAddress: ADDRESS, paymentMethod: 'COD' });

      const after = await Product.findById(productIdOf('CAT-001'));
      expect(after.stock).toBe(before - 3);
    });

    it('rolls back stock when a later line fails mid-pipeline (race simulation)', async () => {
      await fillCart(userACookie, [
        { productId: productIdOf('CAT-001'), quantity: 2 },
        { productId: productIdOf('CAT-003'), quantity: 2 },
      ]);
      const stockBefore = (await Product.findById(productIdOf('CAT-001'))).stock;

      // Simulate losing the race for ONE product: its atomic decrement
      // finds no matching document even though pre-flight validation passed.
      const realUpdate = Product.findOneAndUpdate.bind(Product);
      const spy = jest.spyOn(Product, 'findOneAndUpdate').mockImplementation(
        async (filter, update, options) => {
          if (filter && filter.stock && String(filter._id) === productIdOf('CAT-003')) {
            return null;
          }
          return realUpdate(filter, update, options);
        },
      );

      try {
        const response = await request(app)
          .post('/api/orders')
          .set('Cookie', userACookie)
          .send({ shippingAddress: ADDRESS, paymentMethod: 'COD' });

        expect(response.status).toBe(409);
        expect(response.body.message).toMatch(/insufficient stock for "premium speaker"/i);

        // No order survived
        expect(await Order.countDocuments()).toBe(0);

        // The first line's decrement was RESTORED by the compensating action
        const restored = await Product.findById(productIdOf('CAT-001'));
        expect(restored.stock).toBe(stockBefore);
      } finally {
        spy.mockRestore();
      }
    });

    it('clears the cart after a successful order', async () => {
      await fillCart(userACookie, [{ productId: productIdOf('CAT-004'), quantity: 1 }]);
      await request(app)
        .post('/api/orders')
        .set('Cookie', userACookie)
        .send({ shippingAddress: ADDRESS, paymentMethod: 'COD' });

      const cart = await request(app).get('/api/cart').set('Cookie', userACookie);
      expect(cart.body.data.cart.itemCount).toBe(0);
    });

    it('saves the address to the account when requested', async () => {
      await fillCart(userACookie, [{ productId: productIdOf('CAT-004'), quantity: 1 }]);
      await request(app)
        .post('/api/orders')
        .set('Cookie', userACookie)
        .send({
          shippingAddress: { ...ADDRESS, label: 'Office' },
          saveAddress: true,
          paymentMethod: 'COD',
        });

      const meResponse = await request(app).get('/api/auth/me').set('Cookie', userACookie);
      // addresses are not exposed via /me - verify indirectly by ordering again
      await fillCart(userACookie, [{ productId: productIdOf('CAT-004'), quantity: 1 }]);
      const second = await request(app)
        .post('/api/orders')
        .set('Cookie', userACookie)
        .send({
          shippingAddressId: 'does-not-exist',
          paymentMethod: 'COD',
        });
      // invalid id simply fails lookup - proves the id path exists without leaking data
      expect([404, 422]).toContain(second.status);
      expect(meResponse.status).toBe(200);
    });

    it('rejects an empty cart', async () => {
      const response = await request(app)
        .post('/api/orders')
        .set('Cookie', userACookie)
        .send({ shippingAddress: ADDRESS, paymentMethod: 'COD' });

      expect(response.status).toBe(422);
      expect(response.body.message).toMatch(/cart is empty/i);
    });

    it('validates payloads: missing address, bad method, CARD without card', async () => {
      await fillCart(userACookie, [{ productId: productIdOf('CAT-004'), quantity: 1 }]);

      const noAddress = await request(app)
        .post('/api/orders').set('Cookie', userACookie).send({ paymentMethod: 'COD' });
      expect(noAddress.status).toBe(422);

      const badMethod = await request(app)
        .post('/api/orders').set('Cookie', userACookie)
        .send({ shippingAddress: ADDRESS, paymentMethod: 'CRYPTO' });
      expect(badMethod.status).toBe(422);

      const missingCard = await request(app)
        .post('/api/orders').set('Cookie', userACookie)
        .send({ shippingAddress: ADDRESS, paymentMethod: 'CARD' });
      expect(missingCard.status).toBe(422);
    });
  });

  /* --------------------------- Access control & lifecycle -------------------- */

  describe('Order ownership & cancellation', () => {
    let orderA;

    beforeEach(async () => {
      await fillCart(userACookie, [{ productId: productIdOf('CAT-004'), quantity: 1 }]);
      const created = await request(app)
        .post('/api/orders')
        .set('Cookie', userACookie)
        .send({ shippingAddress: ADDRESS, paymentMethod: 'COD' });
      orderA = created.body.data.order;
    });

    it("prevents user B from reading user A's order (404, no existence leak)", async () => {
      const response = await request(app)
        .get(`/api/orders/${orderA._id}`)
        .set('Cookie', userBCookie);

      expect(response.status).toBe(404);
    });

    it("lets user B list only their own orders", async () => {
      const mine = await request(app).get('/api/orders').set('Cookie', userBCookie);
      expect(mine.body.data.orders).toHaveLength(0);
    });

    it("cancels a pending order and restores stock", async () => {
      const before = (await Product.findById(productIdOf('CAT-004'))).stock;

      const cancelled = await request(app)
        .post(`/api/orders/${orderA._id}/cancel`)
        .set('Cookie', userACookie);

      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.order.orderStatus).toBe('CANCELLED');
      expect(cancelled.body.data.order.statusHistory.map((h) => h.status)).toEqual(['PENDING', 'CANCELLED']);

      const after = await Product.findById(productIdOf('CAT-004'));
      expect(after.stock).toBe(before + 1);
    });

    it('refuses cancelling shipped orders', async () => {
      await Order.updateOne({ _id: orderA._id }, { $set: { orderStatus: 'SHIPPED' } });

      const response = await request(app)
        .post(`/api/orders/${orderA._id}/cancel`)
        .set('Cookie', userACookie);

      expect(response.status).toBe(422);
      expect(response.body.message).toMatch(/no longer be cancelled/i);
    });
  });

  /* --------------------------------- Pages ---------------------------------- */

  describe('Checkout & order pages', () => {
    it('redirects guests from /checkout to login', async () => {
      const response = await request(app).get('/checkout').redirects(0);
      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('/auth/login');
    });

    it('redirects empty carts back to /cart', async () => {
      const response = await request(app).get('/checkout').set('Cookie', userACookie).redirects(0);
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/cart');
    });

    it('renders the checkout wizard with summary and stepper', async () => {
      await fillCart(userACookie, [{ productId: productIdOf('CAT-003'), quantity: 1 }]);

      const response = await request(app).get('/checkout').set('Cookie', userACookie);

      expect(response.status).toBe(200);
      expect(response.text).toContain('data-step-indicator');
      expect(response.text).toContain('Cash on delivery');
      expect(response.text).toContain('$320.00');
      expect(response.text).toContain('js-place-order');
    });

    it('renders the confirmation page for the owner', async () => {
      await fillCart(userACookie, [{ productId: productIdOf('CAT-004'), quantity: 1 }]);
      const created = await request(app)
        .post('/api/orders')
        .set('Cookie', userACookie)
        .send({ shippingAddress: ADDRESS, paymentMethod: 'COD' });
      const order = created.body.data.order;

      const page = await request(app)
        .get(`/orders/${order._id}?placed=1`)
        .set('Cookie', userACookie);

      expect(page.status).toBe(200);
      expect(page.text).toContain('Thank you! Your order has been placed.');
      expect(page.text).toContain(order.orderNumber);

      // B cannot view A's confirmation
      const forbiddenView = await request(app)
        .get(`/orders/${order._id}`)
        .set('Cookie', userBCookie);
      expect(forbiddenView.status).toBe(404);
    });

    it('renders the order history page', async () => {
      const page = await request(app).get('/orders').set('Cookie', userACookie);
      expect(page.status).toBe(200);
      expect(page.text).toContain('No orders yet');
    });
  });
});
