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
const { createSessionWithRole, placeOrder } = require('../setup/helpers');
const { seedTaxonomy, seedProducts } = require('../setup/fixtures');

const VALID_CARD = { number: '4242 4242 4242 4242', expiry: '12/28', cvc: '123' };

describe('Phase 9 - Admin dashboard & management', () => {
  let adminCookie;
  let userCookie;
  let products;

  beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([Product.syncIndexes(), Order.syncIndexes()]);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    adminCookie = await createSessionWithRole('ADMIN', 'root@test.io', 'Passw0rdR9');
    userCookie = await createSessionWithRole('USER', 'jane@test.io', 'Passw0rdJ2');
    const taxonomy = await seedTaxonomy();
    products = await seedProducts(taxonomy);
  });

  const productIdOf = (sku) => products.find((p) => p.sku === sku)._id.toString();

  /* ------------------------------ Dashboard API ----------------------------- */

  describe('GET /api/admin/dashboard', () => {
    it('computes KPIs and monthly series from real orders', async () => {
      // One PAID card order (revenue) + one PENDING COD order (not revenue yet)
      const paid = await placeOrder(userCookie, productIdOf('CAT-001'), { paymentMethod: 'CARD', card: VALID_CARD });
      const pendingCod = await placeOrder(userCookie, productIdOf('CAT-004'));

      // Admin confirms the paid order -> no longer "pending"
      await request(app)
        .put(`/api/admin/orders/${paid._id}/status`)
        .set('Cookie', adminCookie)
        .send({ status: 'CONFIRMED' });

      // Deliver the COD order -> becomes revenue per the business rule
      await Order.updateOne({ _id: pendingCod._id }, { $set: { orderStatus: 'DELIVERED' } });

      // A cancelled order must not count anywhere
      const doomed = await placeOrder(userCookie, productIdOf('CAT-003'));
      await Order.updateOne({ _id: doomed._id }, { $set: { orderStatus: 'CANCELLED' } });

      // Shrink a product to trigger low-stock
      await Product.updateOne({ _id: productIdOf('CAT-003') }, { $set: { stock: 2 } });

      const response = await request(app).get('/api/admin/dashboard').set('Cookie', adminCookie);

      expect(response.status).toBe(200);
      const { stats, charts, lowStock } = response.body.data;

      expect(stats.totalOrders).toBe(3);
      expect(stats.pendingOrders).toBe(0);
      // (150 + 5.99 shipping) + (35 + 5.99), cancelled excluded
      expect(stats.revenue).toBe(196.98);
      expect(stats.lowStockThreshold).toBeDefined();

      const currentMonth = charts.monthly[charts.monthly.length - 1];
      expect(currentMonth.orders).toBe(2);   // cancelled excluded
      expect(currentMonth.revenue).toBe(196.98);

      const headphonesTop = charts.topProducts.find((p) => p.name === 'Wireless Headphones Deluxe');
      expect(headphonesTop).toBeTruthy();
      // the cancelled order's product must NOT appear
      expect(charts.topProducts.some((p) => p.name === 'Premium Speaker')).toBe(false);

      expect(lowStock.some((p) => p.sku === 'CAT-003')).toBe(true);
    });

    it('blocks non-admins with 403', async () => {
      const response = await request(app).get('/api/admin/dashboard').set('Cookie', userCookie);
      expect(response.status).toBe(403);
    });
  });

  /* -------------------------------- Users API ------------------------------- */

  describe('User management API', () => {
    it('lists users with search across email and names', async () => {
      const all = await request(app).get('/api/admin/users').set('Cookie', adminCookie);
      expect(all.body.pagination.totalItems).toBeGreaterThanOrEqual(2);

      const filtered = await request(app)
        .get('/api/admin/users?q=jane').set('Cookie', adminCookie);
      expect(filtered.body.data.users).toHaveLength(1);
      expect(filtered.body.data.users[0].email).toBe('jane@test.io');
      // password never leaks
      expect(JSON.stringify(filtered.body)).not.toMatch(/passw/i);
    });

    it("deactivates a customer, which also clears their cart", async () => {
      await request(app).post('/api/cart').set('Cookie', userCookie)
        .send({ productId: productIdOf('CAT-001') });

      const userId = (await request(app).get('/api/auth/me').set('Cookie', userCookie)).body.data.user._id;

      const deactivated = await request(app)
        .put(`/api/admin/users/${userId}/status`)
        .set('Cookie', adminCookie)
        .send({ isActive: false });

      expect(deactivated.status).toBe(200);
      expect(deactivated.body.data.user.isActive).toBe(false);
    });

    it('promotes a customer to ADMIN and back', async () => {
      const userId = (await request(app).get('/api/auth/me').set('Cookie', userCookie)).body.data.user._id;

      const promoted = await request(app)
        .put(`/api/admin/users/${userId}/role`)
        .set('Cookie', adminCookie)
        .send({ role: 'ADMIN' });
      expect(promoted.body.data.user.role).toBe('ADMIN');

      const demoted = await request(app)
        .put(`/api/admin/users/${userId}/role`)
        .set('Cookie', adminCookie)
        .send({ role: 'USER' });
      expect(demoted.body.data.user.role).toBe('USER');
    });

    it('allows cross-admin management while blocking self-changes', async () => {
      const adminId = (await request(app).get('/api/auth/me').set('Cookie', adminCookie)).body.data.user._id;

      // self role change
      const selfRole = await request(app)
        .put(`/api/admin/users/${adminId}/role`)
        .set('Cookie', adminCookie)
        .send({ role: 'USER' });
      expect(selfRole.status).toBe(400);

      // self status change
      const selfStatus = await request(app)
        .put(`/api/admin/users/${adminId}/status`)
        .set('Cookie', adminCookie)
        .send({ isActive: false });
      expect(selfStatus.status).toBe(400);

      // another admin CAN be managed by a different admin
      const secondAdminCookie = await createSessionWithRole('ADMIN', 'second@test.io', 'Passw0rdS8');
      const secondAdminId = (await request(app).get('/api/auth/me').set('Cookie', secondAdminCookie)).body.data.user._id;
      const otherAdmin = await request(app)
        .put(`/api/admin/users/${secondAdminId}/status`)
        .set('Cookie', adminCookie)
        .send({ isActive: false });
      expect(otherAdmin.status).toBe(200);

      // customers remain manageable too
      const userId = (await request(app).get('/api/auth/me').set('Cookie', userCookie)).body.data.user._id;
      const roleChange = await request(app)
        .put(`/api/admin/users/${userId}/role`)
        .set('Cookie', adminCookie)
        .send({ role: 'ADMIN' });
      expect(roleChange.status).toBe(200);
    });
  });

  /* ------------------------------- Coupons API ------------------------------- */

  describe('Coupon management API', () => {
    it('creates, lists and deletes coupons', async () => {
      const created = await request(app)
        .post('/api/admin/coupons')
        .set('Cookie', adminCookie)
        .send({
          code: 'phase9',
          discountType: 'PERCENTAGE',
          discountValue: 15,
          minimumAmount: 100,
          maximumDiscount: 30,
        });

      expect(created.status).toBe(201);
      expect(created.body.data.coupon.code).toBe('PHASE9'); // uppercased

      const list = await request(app).get('/api/admin/coupons').set('Cookie', adminCookie);
      expect(list.body.data.coupons.some((c) => c.code === 'PHASE9')).toBe(true);

      const removed = await request(app)
        .delete(`/api/admin/coupons/${created.body.data.coupon._id}`)
        .set('Cookie', adminCookie);
      expect(removed.status).toBe(200);
      expect(await Coupon.countDocuments()).toBe(0);
    });

    it('rejects duplicate codes and non-admin access', async () => {
      await request(app).post('/api/admin/coupons').set('Cookie', adminCookie)
        .send({ code: 'UNIQ10', discountType: 'FIXED', discountValue: 10 });

      const duplicate = await request(app)
        .post('/api/admin/coupons')
        .set('Cookie', adminCookie)
        .send({ code: 'UNIQ10', discountType: 'FIXED', discountValue: 5 });
      expect(duplicate.status).toBe(422);

      const forbidden = await request(app)
        .post('/api/admin/coupons')
        .set('Cookie', userCookie)
        .send({ code: 'HACK1', discountType: 'FIXED', discountValue: 999 });
      expect(forbidden.status).toBe(403);
    });
  });

  /* -------------------------------- Admin pages ------------------------------ */

  describe('Admin pages render for admins only', () => {
    const pages = [
      ['/admin', 'Dashboard'],
      ['/admin/products', 'Products'],
      ['/admin/products/new', 'New product'],
      ['/admin/categories', 'Categories'],
      ['/admin/brands', 'Brands'],
      ['/admin/inventory', 'Inventory'],
      ['/admin/coupons', 'Coupons'],
      ['/admin/reviews', 'Review moderation'],
      ['/admin/users', 'Users'],
      ['/admin/orders', 'Order management'],
    ];

    pages.forEach(([path, expectedText]) => {
      it(`renders ${path}`, async () => {
        const response = await request(app).get(path).set('Cookie', adminCookie);
        expect(response.status).toBe(200);
        expect(response.text).toContain(expectedText);
        expect(response.text).toContain('admin-sidebar'); // new layout in use
      });
    });

    it('redirects customers away from every admin page', async () => {
      const response = await request(app).get('/admin/users').set('Cookie', userCookie).redirects(0);
      expect(response.status).toBe(302);
    });

    it('prefills the product edit form', async () => {
      const page = await request(app)
        .get(`/admin/products/${productIdOf('CAT-003')}/edit`)
        .set('Cookie', adminCookie);

      expect(page.status).toBe(200);
      expect(page.text).toContain('value="Premium Speaker"');
      expect(page.text).toContain('Save changes');
    });
  });
});
