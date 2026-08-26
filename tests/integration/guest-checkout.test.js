const request = require('supertest');
const app = require('../../src/app');
const Category = require('../../src/models/Category');
const Brand = require('../../src/models/Brand');
const Product = require('../../src/models/Product');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearCollections,
} = require('../setup/db');

describe('Guest Checkout & Order Tracking', () => {
  let product;

  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    const category = await Category.create({ name: 'Gadgets', slug: 'gadgets' });
    const brand = await Brand.create({ name: 'Anker', slug: 'anker' });

    product = await Product.create({
      name: 'Anker PowerBank 20000mAh',
      description: 'High capacity portable fast charger',
      price: 49.99,
      sku: 'ANKER-PB20K',
      category: category._id,
      brand: brand._id,
      stock: 10,
    });
  });

  describe('POST /api/orders (Guest Mode)', () => {
    it('creates an order without authentication and decrements product stock', async () => {
      const orderPayload = {
        customer: {
          email: 'guest.buyer@example.com',
          firstName: 'Alice',
          lastName: 'Guest',
          phone: '+1234567890',
        },
        items: [
          { productId: String(product._id), quantity: 2 },
        ],
        shippingAddress: {
          fullName: 'Alice Guest',
          phone: '+1234567890',
          street: '123 Guest Avenue',
          city: 'Paris',
          postalCode: '75001',
          country: 'France',
        },
        paymentMethod: 'COD',
      };

      const res = await request(app)
        .post('/api/orders')
        .send(orderPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.order.isGuest).toBe(true);
      expect(res.body.data.order.guestEmail).toBe('guest.buyer@example.com');
      expect(res.body.data.order.subtotal).toBe(99.98);
      expect(res.body.data.order.total).toBe(105.97);
      expect(res.body.data.guestToken).toBeDefined();

      // Verify stock decrement
      const reloaded = await Product.findById(product._id);
      expect(reloaded.stock).toBe(8);
    });

    it('rejects guest checkout when requested stock exceeds availability', async () => {
      const orderPayload = {
        customer: {
          email: 'overseller@example.com',
          firstName: 'Bob',
          lastName: 'Buyer',
        },
        items: [
          { productId: String(product._id), quantity: 99 },
        ],
        shippingAddress: {
          fullName: 'Bob Buyer',
          phone: '+1234567890',
          street: '456 Market St',
          city: 'Lyon',
          postalCode: '69001',
          country: 'France',
        },
        paymentMethod: 'COD',
      };

      const res = await request(app)
        .post('/api/orders')
        .send(orderPayload);

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/orders/track & GET /api/orders/:id (Guest Access)', () => {
    it('allows guest to view their order via secure guestToken', async () => {
      const createRes = await request(app)
        .post('/api/orders')
        .send({
          customer: {
            email: 'secure.guest@example.com',
            firstName: 'Clara',
            lastName: 'Guest',
          },
          items: [{ productId: String(product._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Clara Guest',
            phone: '+1234567890',
            street: '789 Riviera Rd',
            city: 'Nice',
            postalCode: '06000',
            country: 'France',
          },
          paymentMethod: 'COD',
        });

      const orderId = createRes.body.data.order._id;
      const token = createRes.body.data.guestToken;

      // Access with valid token
      const resWithToken = await request(app)
        .get(`/api/orders/${orderId}?token=${token}`);

      expect(resWithToken.status).toBe(200);
      expect(resWithToken.body.data.order._id).toBe(orderId);

      // Access with invalid token fails
      const resBadToken = await request(app)
        .get(`/api/orders/${orderId}?token=invalid-token`);

      expect(resBadToken.status).toBe(404);
    });

    it('allows tracking by orderNumber and email', async () => {
      const createRes = await request(app)
        .post('/api/orders')
        .send({
          customer: {
            email: 'tracker@example.com',
            firstName: 'Dan',
            lastName: 'Tracker',
          },
          items: [{ productId: String(product._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Dan Tracker',
            phone: '+1234567890',
            street: '10 Tracking Way',
            city: 'Marseille',
            postalCode: '13001',
            country: 'France',
          },
          paymentMethod: 'COD',
        });

      const orderNumber = createRes.body.data.order.orderNumber;

      const trackRes = await request(app)
        .get(`/api/orders/track?orderNumber=${orderNumber}&email=tracker@example.com`);

      expect(trackRes.status).toBe(200);
      expect(trackRes.body.success).toBe(true);
      expect(trackRes.body.data.order.orderNumber).toBe(orderNumber);
    });
  });
});

