const request = require('supertest');
const app = require('../../src/app');
const Product = require('../../src/models/Product');
const emailService = require('../../src/services/email.service');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearCollections,
} = require('../setup/db');
const { createSessionWithRole } = require('../setup/helpers');
const { seedTaxonomy, seedProducts } = require('../setup/fixtures');

const ADDRESS = {
  fullName: 'Lifecycle Tester',
  phone: '+216 12 345 678',
  street: '9 Test Avenue',
  city: 'Tunis',
  state: '',
  postalCode: '1000',
  country: 'Tunisia',
};

/** Places a COD order for one unit of a product and returns the order JSON */
async function placeOrder(cookie, productId, paymentMethod = 'COD', card = null) {
  await request(app).post('/api/cart').set('Cookie', cookie).send({ productId, quantity: 1 });
  const payload = { shippingAddress: ADDRESS, paymentMethod };
  if (card) payload.card = card;
  const response = await request(app).post('/api/orders').set('Cookie', cookie).send(payload);
  if (response.status !== 201) throw new Error(`placeOrder failed: ${JSON.stringify(response.body)}`);
  return response.body.data.order;
}

/** Advances an order through the given statuses via the admin API */
async function advance(adminCookie, orderId, steps) {
  for (const step of steps) {
     
    const response = await request(app)
      .put(`/api/admin/orders/${orderId}/status`)
      .set('Cookie', adminCookie)
      .send({ status: step.status, trackingNumber: step.trackingNumber || '' });
    if (response.status !== 200) {
      throw new Error(`advance failed at ${step.status}: ${JSON.stringify(response.body)}`);
    }
     
  }
}

describe('Phase 7 - Order lifecycle (admin transitions, tracking, emails)', () => {
  let customerCookie;
  let adminCookie;
  let otherCookie;
  let products;

  beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([Product.syncIndexes()]);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    emailService.sentEmails.length = 0;
    customerCookie = await createSessionWithRole('USER', 'cust@test.io', 'Passw0rdC1');
    adminCookie = await createSessionWithRole('ADMIN', 'boss@test.io', 'Passw0rdA9');
    otherCookie = await createSessionWithRole('USER', 'other@test.io', 'Passw0rdO3');
    const taxonomy = await seedTaxonomy();
    products = await seedProducts(taxonomy);
  });

  const productIdOf = (sku) => products.find((p) => p.sku === sku)._id.toString();

  /* ------------------------------ Authorization ----------------------------- */

  describe('PUT /api/admin/orders/:id/status', () => {
    it('requires authentication (401) and the ADMIN role (403)', async () => {
      const id = productIdOf('CAT-004');
      const order = await placeOrder(customerCookie, id);

      const anonymous = await request(app)
        .put(`/api/admin/orders/${order._id}/status`).send({ status: 'CONFIRMED' });
      expect(anonymous.status).toBe(401);

      const customer = await request(app)
        .put(`/api/admin/orders/${order._id}/status`)
        .set('Cookie', customerCookie)
        .send({ status: 'CONFIRMED' });
      expect(customer.status).toBe(403);
    });

    it('confirms a pending order and emails the customer', async () => {
      const id = productIdOf('CAT-004');
      const order = await placeOrder(customerCookie, id);

      const response = await request(app)
        .put(`/api/admin/orders/${order._id}/status`)
        .set('Cookie', adminCookie)
        .send({ status: 'CONFIRMED', note: 'Stock verified' });

      expect(response.status).toBe(200);
      expect(response.body.data.order.orderStatus).toBe('CONFIRMED');
      expect(response.body.data.order.statusHistory.map((h) => h.status))
        .toEqual(['PENDING', 'CONFIRMED']);

      const emails = emailService.sentEmails.filter((m) => m.subject.includes(order.orderNumber));
      expect(emails.some((m) => /confirmed/i.test(m.subject))).toBe(true);
      expect(emails[0].to).toBe('cust@test.io');
    });

    it('rejects illegal transitions with the allowed list in the message', async () => {
      const id = productIdOf('CAT-004');
      const order = await placeOrder(customerCookie, id);

      const response = await request(app)
        .put(`/api/admin/orders/${order._id}/status`)
        .set('Cookie', adminCookie)
        .send({ status: 'DELIVERED' });

      expect(response.status).toBe(422);
      expect(response.body.message).toMatch(/allowed transitions: confirmed, cancelled/i);
    });

    it('rejects repeating the current status', async () => {
      const id = productIdOf('CAT-004');
      const order = await placeOrder(customerCookie, id);

      const response = await request(app)
        .put(`/api/admin/orders/${order._id}/status`)
        .set('Cookie', adminCookie)
        .send({ status: 'PENDING' });

      expect(response.status).toBe(422);
      expect(response.body.message).toMatch(/already PENDING/i);
    });

    it('rejects unknown statuses with 422', async () => {
      const id = productIdOf('CAT-004');
      const order = await placeOrder(customerCookie, id);

      const response = await request(app)
        .put(`/api/admin/orders/${order._id}/status`)
        .set('Cookie', adminCookie)
        .send({ status: 'TELEPORTED' });

      expect(response.status).toBe(422);
    });
  });

  /* ------------------------------- Full lifecycle ---------------------------- */

  describe('Full happy path', () => {
    it('walks PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED', async () => {
      const id = productIdOf('CAT-001');
      const order = await placeOrder(customerCookie, id);

      await advance(adminCookie, order._id, [
        { status: 'CONFIRMED' },
        { status: 'PROCESSING' },
        { status: 'SHIPPED' },
        { status: 'DELIVERED' },
      ]);

      const detail = await request(app).get(`/api/orders/${order._id}`).set('Cookie', customerCookie);
      const final = detail.body.data.order;

      expect(final.orderStatus).toBe('DELIVERED');
      expect(final.statusHistory.map((h) => h.status))
        .toEqual(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED']);
      expect(final.trackingNumber).toMatch(/^TRK-[A-F0-9]{10}$/); // auto-generated

      const subjects = emailService.sentEmails.map((m) => m.subject).join(' | ');
      expect(subjects).toMatch(/confirmed/i);
      expect(subjects).toMatch(/shipped/i);
      expect(subjects).toMatch(/delivered/i);
    });

    it('honors an explicitly provided tracking number on SHIPPED', async () => {
      const id = productIdOf('CAT-001');
      const order = await placeOrder(customerCookie, id);

      await advance(adminCookie, order._id, [
        { status: 'CONFIRMED' },
        { status: 'PROCESSING' },
        { status: 'SHIPPED', trackingNumber: 'CARRIER-XYZ-001' },
      ]);

      const detail = await request(app).get(`/api/orders/${order._id}`).set('Cookie', customerCookie);
      expect(detail.body.data.order.trackingNumber).toBe('CARRIER-XYZ-001');

      const shippedEmail = emailService.sentEmails.find((m) => /shipped/i.test(m.subject));
      expect(shippedEmail.html).toContain('CARRIER-XYZ-001');
    });

    it('blocks further transitions once delivered (terminal state)', async () => {
      const id = productIdOf('CAT-002'.replace('CAT-002', 'CAT-003')); // speaker
      const order = await placeOrder(customerCookie, id);
      await advance(adminCookie, order._id, [{ status: 'CONFIRMED' }, { status: 'PROCESSING' }, { status: 'SHIPPED' }, { status: 'DELIVERED' }]);

      const response = await request(app)
        .put(`/api/admin/orders/${order._id}/status`)
        .set('Cookie', adminCookie)
        .send({ status: 'CANCELLED' });

      expect(response.status).toBe(422);
      expect(response.body.message).toMatch(/terminal/i);
    });
  });

  /* --------------------------- Admin cancellation ---------------------------- */

  describe('Admin cancellation semantics', () => {
    it('restocks items and refunds PAID orders when cancelled by admin', async () => {
      const id = productIdOf('CAT-003'); // stock 5
      const stockBefore = (await Product.findById(id)).stock;

      const order = await placeOrder(customerCookie, id, 'CARD', {
        number: '4242 4242 4242 4242',
        expiry: '12/28',
        cvc: '123',
      });
      expect((await Product.findById(id)).stock).toBe(stockBefore - 1);

      await advance(adminCookie, order._id, [{ status: 'CONFIRMED' }]);
      const cancelled = await request(app)
        .put(`/api/admin/orders/${order._id}/status`)
        .set('Cookie', adminCookie)
        .send({ status: 'CANCELLED' });

      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.order.paymentStatus).toBe('REFUNDED');

      const restored = await Product.findById(id);
      expect(restored.stock).toBe(stockBefore);
      expect(emailService.sentEmails.some((m) => /cancelled/i.test(m.subject))).toBe(true);
    });

    it('still allows customers to cancel their own PENDING orders', async () => {
      const id = productIdOf('CAT-004');
      const order = await placeOrder(customerCookie, id);

      const cancelled = await request(app)
        .post(`/api/orders/${order._id}/cancel`)
        .set('Cookie', customerCookie);

      expect(cancelled.status).toBe(200);
      // cancellation email is fire-and-forget - give it a beat
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(emailService.sentEmails.some((m) => /cancelled/i.test(m.subject))).toBe(true);
    });
  });

  /* ------------------------------- Admin listing ------------------------------ */

  describe('GET /api/admin/orders', () => {
    it("lists every customer's orders with pagination", async () => {
      const p1 = productIdOf('CAT-004');
      await placeOrder(customerCookie, p1);
      const otherLoginId = productIdOf('CAT-001');
      await placeOrder(otherCookie, otherLoginId);

      const response = await request(app).get('/api/admin/orders').set('Cookie', adminCookie);

      expect(response.status).toBe(200);
      expect(response.body.pagination.totalItems).toBe(2);
      expect(response.body.data.orders[0].user.email).toBeTruthy(); // populated customer
    });

    it('filters by status', async () => {
      const id = productIdOf('CAT-004');
      const order = await placeOrder(customerCookie, id);
      await advance(adminCookie, order._id, [{ status: 'CONFIRMED' }]);

      const shipped = await request(app)
        .get('/api/admin/orders?status=SHIPPED').set('Cookie', adminCookie);
      const confirmed = await request(app)
        .get('/api/admin/orders?status=CONFIRMED').set('Cookie', adminCookie);

      expect(shipped.body.pagination.totalItems).toBe(0);
      expect(confirmed.body.pagination.totalItems).toBe(1);
    });
  });

  /* ---------------------------------- Pages ----------------------------------- */

  describe('Order pages', () => {
    it('renders the timeline with every history entry for the owner', async () => {
      const id = productIdOf('CAT-001');
      const order = await placeOrder(customerCookie, id);
      await advance(adminCookie, order._id, [
        { status: 'CONFIRMED' },
        { status: 'PROCESSING' },
        { status: 'SHIPPED', trackingNumber: 'TRK-VISIBLE01' },
      ]);

      const page = await request(app).get(`/orders/${order._id}`).set('Cookie', customerCookie);

      expect(page.status).toBe(200);
      expect(page.text).toContain('timeline-step done');
      expect(page.text).toContain('Confirmed');
      expect(page.text).toContain('Shipped');
      expect(page.text).toContain('TRK-VISIBLE01');
    });

    it('shows the cancelled banner for cancelled orders', async () => {
      const id = productIdOf('CAT-004');
      const order = await placeOrder(customerCookie, id);
      await request(app).post(`/api/orders/${order._id}/cancel`).set('Cookie', customerCookie);

      const page = await request(app).get(`/orders/${order._id}`).set('Cookie', customerCookie);
      expect(page.text).toContain('This order was cancelled');
    });

    it('redirects non-admins away from /admin/orders', async () => {
      const customerPage = await request(app).get('/admin/orders')
        .set('Cookie', customerCookie).redirects(0);
      expect(customerPage.status).toBe(302);
      expect(customerPage.headers.location).toBe('/');

      const guestPage = await request(app).get('/admin/orders').redirects(0);
      expect(guestPage.status).toBe(302);
      expect(guestPage.headers.location).toContain('/auth/login');
    });

    it('renders the admin orders console for admins', async () => {
      const id = productIdOf('CAT-004');
      const order = await placeOrder(customerCookie, id);

      const page = await request(app).get('/admin/orders').set('Cookie', adminCookie);

      expect(page.status).toBe(200);
      expect(page.text).toContain(order.orderNumber);
      expect(page.text).toContain('cust@test.io');
      expect(page.text).toContain('js-save-status');
    });
  });
});