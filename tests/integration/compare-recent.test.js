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

describe('Product Comparison & Discovery Features', () => {
  let p1;
  let p2;

  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    const category = await Category.create({ name: 'Audio', slug: 'audio' });
    const brand = await Brand.create({ name: 'Sony', slug: 'sony' });

    p1 = await Product.create({
      name: 'Sony WH-1000XM5',
      description: 'Flagship noise cancelling headphones with LDAC and 30h battery',
      price: 399.99,
      sku: 'SONY-XM5',
      category: category._id,
      brand: brand._id,
      stock: 15,
      specifications: { 'Battery Life': '30 Hours', 'Weight': '250g' },
    });

    p2 = await Product.create({
      name: 'Sony WH-1000XM4',
      description: 'Previous gen high quality headphones with great ANC',
      price: 299.99,
      sku: 'SONY-XM4',
      category: category._id,
      brand: brand._id,
      stock: 25,
      specifications: { 'Battery Life': '30 Hours', 'Weight': '254g' },
    });
  });

  describe('GET /api/products/compare', () => {
    it('returns structured comparison matrix with unique specification keys', async () => {
      const res = await request(app).get(`/api/products/compare?ids=${p1.slug},${p2.slug}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.products).toHaveLength(2);
      expect(res.body.data.specKeys).toContain('Battery Life');
      expect(res.body.data.specKeys).toContain('Weight');
    });

    it('handles empty or non-existent identifiers gracefully', async () => {
      const res = await request(app).get('/api/products/compare?ids=non-existent-1,non-existent-2');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.products).toHaveLength(0);
    });
  });

  describe('GET /compare (HTML Page)', () => {
    it('renders the comparison page table successfully', async () => {
      const res = await request(app).get(`/compare?ids=${p1.slug},${p2.slug}`);

      expect(res.status).toBe(200);
      expect(res.text).toContain('Compare Products');
      expect(res.text).toContain('Sony WH-1000XM5');
      expect(res.text).toContain('Sony WH-1000XM4');
      expect(res.text).toContain('Battery Life');
    });

    it('renders the empty state when no products are selected', async () => {
      const res = await request(app).get('/compare');

      expect(res.status).toBe(200);
      expect(res.text).toContain('No products selected for comparison');
    });
  });
});

