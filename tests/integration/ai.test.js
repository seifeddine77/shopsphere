const request = require('supertest');
const app = require('../../src/app');
const { connectTestDatabase, disconnectTestDatabase, clearCollections } = require('../setup/db');
const User = require('../../src/models/User');
const Product = require('../../src/models/Product');
const Category = require('../../src/models/Category');
const Brand = require('../../src/models/Brand');
const Review = require('../../src/models/Review');
const { signAccessToken, AUTH_COOKIE } = require('../../src/utils/jwt');

describe('AI-Native Feature Suites', () => {
  let adminUser;
  let adminCookie;
  let testProduct;

  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();

    adminUser = await User.create({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@ai-test.com',
      password: 'Password123!',
      role: 'ADMIN',
    });
    adminCookie = `${AUTH_COOKIE}=${signAccessToken(adminUser._id)}`;

    const category = await Category.create({ name: 'Audio', slug: 'audio' });
    const brand = await Brand.create({ name: 'SoundPulse', slug: 'soundpulse' });

    testProduct = await Product.create({
      name: 'Wireless ANC Headphones',
      slug: 'wireless-anc-headphones',
      description: 'Active noise cancelling over-ear headphones with 30-hour battery life.',
      price: 99.99,
      stock: 25,
      sku: 'HP-ANC-01',
      category: category._id,
      brand: brand._id,
      rating: 4.8,
      reviewCount: 5,
    });

    await Review.create({
      product: testProduct._id,
      user: adminUser._id,
      rating: 5,
      comment: 'Superb noise cancellation and very comfortable fit during long hours!',
      isApproved: true,
      verifiedPurchase: true,
    });
  });

  describe('POST /api/ai/chat', () => {
    it('returns conversational shopping suggestions with matching products', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Looking for wireless headphones under $150' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBeDefined();
      expect(Array.isArray(res.body.data.products)).toBe(true);
      expect(res.body.data.products.length).toBeGreaterThan(0);
      expect(res.body.data.products[0].name).toContain('Headphones');
    });

    it('handles empty query gracefully with default greeting & prompt chips', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: '' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/ai/reviews/:slug', () => {
    it('generates an AI summary of product reviews with sentiment score', async () => {
      const res = await request(app)
        .get(`/api/ai/reviews/${testProduct.slug}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.sentimentScore).toBeGreaterThanOrEqual(80);
      expect(res.body.data.summary.pros.length).toBeGreaterThan(0);
    });

    it('returns 404 for non-existent product slug', async () => {
      await request(app)
        .get('/api/ai/reviews/non-existent-product-slug')
        .expect(404);
    });
  });

  describe('POST /api/ai/generate-product', () => {
    it('allows admin to generate product copy and marketing description', async () => {
      const res = await request(app)
        .post('/api/ai/generate-product')
        .set('Cookie', adminCookie)
        .send({ name: 'Smart Fitness Tracker', categoryName: 'Sports', keywords: 'fitness, waterproof, tracker' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.copy.suggestedTitle).toContain('Smart Fitness Tracker');
      expect(res.body.data.copy.description.length).toBeGreaterThan(50);
      expect(res.body.data.copy.tags.length).toBeGreaterThan(0);
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app)
        .post('/api/ai/generate-product')
        .send({ name: 'Smart Tracker' })
        .expect(401);
    });
  });

  describe('POST /api/reviews/:id/helpful', () => {
    it('increments helpful votes on a review', async () => {
      const review = await Review.findOne({ product: testProduct._id });
      const res = await request(app)
        .post(`/api/reviews/${review._id}/helpful`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.helpfulVotes).toBe(1);
    });
  });

  describe('POST /api/products/:id/stock-alert', () => {
    it('subscribes user email to out-of-stock product alerts', async () => {
      const res = await request(app)
        .post(`/api/products/${testProduct._id}/stock-alert`)
        .send({ email: 'subscriber@test.com' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.subscribed).toBe(true);
      expect(res.body.data.email).toBe('subscriber@test.com');
    });

    it('rejects invalid email formats', async () => {
      await request(app)
        .post(`/api/products/${testProduct._id}/stock-alert`)
        .send({ email: 'invalid-email' })
        .expect(400);
    });
  });
});


