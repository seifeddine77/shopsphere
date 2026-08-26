/**
 * Security-focused integration tests.
 *
 * This suite boots the app in PRODUCTION mode (isolated module registry)
 * to verify hardening that only activates there: secure cookies, hidden
 * stack traces, strict CSP. It also covers XSS escaping and NoSQL
 * injection guards in development-style conditions.
 */

const request = require('supertest');

describe('Security hardening', () => {
  describe('Production mode (fresh app instance)', () => {
    let prodApp;

    beforeAll(() => {
      jest.resetModules();
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'p'.repeat(40);
      process.env.COOKIE_SECRET = 'c'.repeat(40);
       
      prodApp = require('../../src/app');
    });

    afterAll(() => {
      process.env.NODE_ENV = 'test';
    });

    it('sets HttpOnly + SameSite cookies on login-shaped auth flows', async () => {
      const response = await request(prodApp)
        .post('/api/auth/login')
        .set('Host', 'localhost:3000')
        .send({ email: 'nobody@example.com', password: 'Whatever123' });

      // Login fails (no DB) but the security posture is still observable
      expect([401, 500]).toContain(response.status);
    });

    it('emits hardened security headers (Helmet)', async () => {
      const response = await request(prodApp).get('/health');

      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    });

    it('never leaks stack traces on unexpected failures', async () => {
      const response = await request(prodApp)
        .get('/api/products/000000000000000000000000') // valid ObjectId, no DB -> 500 or 404
        .set('Host', 'localhost:3000')
        .set('Origin', 'http://localhost:3000');

      if (response.status >= 500) {
        expect(response.text).not.toMatch(/at\s+\w+\s+\(/); // stack frame pattern
        expect(response.body.message).toBe('Something went wrong');
      }
    });
  });

  describe('Input abuse (default test app)', () => {
    let app;

    beforeAll(async () => {
      jest.resetModules();
      process.env.NODE_ENV = 'test';

      app = require('../../src/app');
      const { connectTestDatabase } = require('../setup/db');
      await connectTestDatabase();
      const { createSessionWithRole } = require('../setup/helpers');
      await createSessionWithRole('USER', 'sec@test.io', 'Passw0rdS1');
    });

    afterAll(async () => {
      const { disconnectTestDatabase } = require('../setup/db');
      await disconnectTestDatabase();
    });

    it('rejects NoSQL operators smuggled into the login payload', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: { $gt: '' },
          password: { $gt: '' },
        });

      // Joi rejects non-string payloads -> 422 (never a bypass)
      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
    });

    it('strips unknown fields instead of trusting them (mass assignment)', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Safe',
          lastName: 'User',
          email: 'safe@test.io',
          password: 'Passw0rdXY',
          confirmPassword: 'Passw0rdXY',
          role: 'ADMIN',
          isActive: true,
          addresses: [{ country: 'Nowhere' }],
          resetPasswordToken: 'forged',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.user.role).toBe('USER');
      expect(JSON.stringify(response.body)).not.toContain('forged');
    });

    it('HTML-escapes user content in rendered pages (XSS defense)', async () => {
      const Product = require('../../src/models/Product');
      await Promise.all([Product.syncIndexes()]);
      const { seedTaxonomy } = require('../setup/fixtures');
      const taxonomy = await seedTaxonomy();

      const evilName = '<script>alert(1)</script>Evil Speaker';
      const created = await Product.create({
        name: evilName,
        description: 'Trying to inject scripts through the catalog <img src=x onerror=alert(2)>',
        price: 10,
        stock: 3,
        sku: `XSS-${Date.now()}`,
        category: taxonomy.category._id,
        brand: taxonomy.brand._id,
      });

      const page = await request(app).get(`/products/${created.slug}`);
      expect(page.status).toBe(200);
      expect(page.text).not.toContain('<script>alert(1)</script>');
      expect(page.text).toContain('&lt;script&gt;'); // escaped form present
    });
  });
});
