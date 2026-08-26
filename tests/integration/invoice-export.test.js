const request = require('supertest');
const app = require('../../src/app');
const { connectTestDatabase, disconnectTestDatabase, clearCollections } = require('../setup/db');
const User = require('../../src/models/User');
const { Order } = require('../../src/models/Order');
const Product = require('../../src/models/Product');
const Category = require('../../src/models/Category');
const Brand = require('../../src/models/Brand');
const { signAccessToken, AUTH_COOKIE } = require('../../src/utils/jwt');

describe('Invoice & Admin Export Features', () => {
  let customerUser;
  let adminUser;
  let customerCookie;
  let adminCookie;
  let testOrder;

  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();

    customerUser = await User.create({
      firstName: 'Customer',
      lastName: 'One',
      email: 'customer@test.com',
      password: 'Password123!',
      role: 'USER',
    });
    customerCookie = `${AUTH_COOKIE}=${signAccessToken(customerUser._id)}`;

    adminUser = await User.create({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@test.com',
      password: 'Password123!',
      role: 'ADMIN',
    });
    adminCookie = `${AUTH_COOKIE}=${signAccessToken(adminUser._id)}`;

    const category = await Category.create({ name: 'Tech', slug: 'tech' });
    const brand = await Brand.create({ name: 'BrandX', slug: 'brandx' });

    const product = await Product.create({
      name: 'Wireless Keyboard',
      slug: 'wireless-keyboard',
      description: 'A premium wireless mechanical keyboard.',
      price: 80,
      stock: 15,
      sku: 'WK-001',
      category: category._id,
      brand: brand._id,
    });

    testOrder = await Order.create({
      user: customerUser._id,
      orderNumber: 'ORD-TEST-999',
      items: [{
        product: product._id,
        name: 'Wireless Keyboard',
        slug: 'wireless-keyboard',
        price: 80,
        unitPrice: 80,
        lineTotal: 80,
        quantity: 1,
        sku: 'WK-001',
      }],
      shippingAddress: {
        fullName: 'Customer One',
        street: '123 Main St',
        city: 'Metropolis',
        postalCode: '12345',
        country: 'US',
        phone: '555-0199',
      },
      subtotal: 80,
      shippingCost: 0,
      total: 80,
      paymentMethod: 'CARD',
      paymentStatus: 'PAID',
      orderStatus: 'CONFIRMED',
    });
  });

  describe('GET /api/orders/:id/invoice', () => {
    it('generates and streams a valid PDF invoice for the order owner', async () => {
      const res = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Cookie', customerCookie)
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('invoice-ORD-TEST-999.pdf');
      // PDF documents begin with the magic bytes %PDF-
      expect(res.body.toString('latin1').startsWith('%PDF-') || res.text.startsWith('%PDF-')).toBe(true);
    });

    it('rejects access to invoice for other unprivileged users', async () => {
      const otherUser = await User.create({
        firstName: 'Other',
        lastName: 'User',
        email: 'other@test.com',
        password: 'Password123!',
        role: 'USER',
      });
      const otherCookie = `${AUTH_COOKIE}=${signAccessToken(otherUser._id)}`;

      await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Cookie', otherCookie)
        .expect(404);
    });
  });

  describe('GET /api/admin/orders/export', () => {
    it('exports orders as CSV for admin users', async () => {
      const res = await request(app)
        .get('/api/admin/orders/export')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Order Number,Date,Customer Name,Customer Email');
      expect(res.text).toContain('ORD-TEST-999');
      expect(res.text).toContain('customer@test.com');
    });

    it('rejects CSV export for non-admin users with 403', async () => {
      await request(app)
        .get('/api/admin/orders/export')
        .set('Cookie', customerCookie)
        .expect(403);
    });
  });
});

