const request = require('supertest');
const app = require('../src/app');

describe('Phase 1 - Foundation smoke tests', () => {
  describe('GET /health', () => {
    it('returns a success envelope with service metadata', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('ok');
      expect(response.body.data).toHaveProperty('uptimeSeconds');
      expect(response.body.data.database).toHaveProperty('state');
    });
  });

  describe('GET /', () => {
    it('renders the home page inside the main layout', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.text).toContain('<!DOCTYPE html>');
      expect(response.text).toContain('ShopSphere');
      expect(response.text).toContain('Discover products');
    });
  });

  describe('404 handling', () => {
    it('returns a JSON envelope for unknown API routes', async () => {
      const response = await request(app).get('/api/does-not-exist');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/not found/i);
      expect(Array.isArray(response.body.errors)).toBe(true);
    });

    it('renders the HTML error page for unknown pages', async () => {
      const response = await request(app).get('/this-page-does-not-exist');

      expect(response.status).toBe(404);
      expect(response.text).toContain('404');
      expect(response.text).toContain('Page not found');
    });
  });
});
