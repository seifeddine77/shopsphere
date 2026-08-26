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
const { createSessionWithRole } = require('../setup/helpers');
const { seedTaxonomy, seedProducts } = require('../setup/fixtures');

function productOverrides(overrides = {}) {
  return {
    name: 'Wireless Headphones',
    description: 'Over-ear wireless headphones with noise cancellation',
    price: 199.99,
    sku: `TEST-${Math.floor(Math.random() * 100000)}`,
    ...overrides,
  };
}

/* ------------------------------- Test suite ------------------------------- */

describe('Phase 3 - Product catalog API', () => {
  let adminCookie;
  let userCookie;
  let taxonomy;
  let products;

  beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([Product.syncIndexes(), Category.syncIndexes(), Brand.syncIndexes()]);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();

    adminCookie = await createSessionWithRole('ADMIN', 'admin@test.io', 'AdminPass123');
    userCookie = await createSessionWithRole('USER', 'user@test.io', 'UserPass123');

    taxonomy = await seedTaxonomy();
    products = await seedProducts(taxonomy);
  });

  /* -------------------------------- Listing ------------------------------- */

  describe('GET /api/products', () => {
    it('lists active products with full pagination metadata', async () => {
      const response = await request(app).get('/api/products?limit=2&page=1');

      expect(response.status).toBe(200);
      expect(response.body.data.products).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        currentPage: 1,
        totalPages: 2,
        totalItems: 4,
        itemsPerPage: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      });
    });

    it('serves the second page correctly', async () => {
      const page1 = await request(app).get('/api/products?limit=2&page=1');
      const page2 = await request(app).get('/api/products?limit=2&page=2');

      expect(page2.body.data.products).toHaveLength(2);
      expect(page2.body.pagination.hasPreviousPage).toBe(true);

      const names1 = page1.body.data.products.map((p) => p.slug);
      const names2 = page2.body.data.products.map((p) => p.slug);
      expect(names1.some((slug) => names2.includes(slug))).toBe(false);
    });

    it('filters by category slug', async () => {
      const response = await request(app)
        .get(`/api/products?category=${taxonomy.otherCategory.slug}`);

      expect(response.body.data.products).toHaveLength(1);
      expect(response.body.data.products[0].name).toBe('Clean Code Guide');
    });

    it('filters by brand slug', async () => {
      const response = await request(app)
        .get(`/api/products?brand=${taxonomy.brand.slug}`);

      expect(response.body.data.products).toHaveLength(3);
    });

    it('filters by price range using the effective (discounted) price', async () => {
      const response = await request(app).get('/api/products?minPrice=140&maxPrice=160');

      // Deluxe headphones cost 150 after discount
      expect(response.body.data.products).toHaveLength(1);
      expect(response.body.data.products[0].sku).toBe('CAT-001');
      expect(response.body.data.products[0].effectivePrice).toBe(150);
    });

    it('filters in-stock products only', async () => {
      const response = await request(app).get('/api/products?inStock=true');

      expect(response.body.data.products).toHaveLength(3);
      response.body.data.products.forEach((product) => {
        expect(product.stock).toBeGreaterThan(0);
      });
    });

    it('filters featured products', async () => {
      const response = await request(app).get('/api/products?isFeatured=true');

      expect(response.body.data.products.map((p) => p.sku)).toEqual(['CAT-001']);
    });

    it('keeps effectivePrice equal to price when no discount is set (regression)', async () => {
      const response = await request(app).get('/api/products?inStock=true');

      response.body.data.products.forEach((product) => {
        if (product.discountPrice == null) {
          expect(product.effectivePrice).toBe(product.price);
        }
      });
    });

    it('sorts by effective price ascending', async () => {
      const response = await request(app).get('/api/products?sort=price_asc');

      const prices = response.body.data.products.map((p) => p.effectivePrice);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    });

    it('sorts by best rating', async () => {
      const response = await request(app).get('/api/products?sort=best_rating');

      const ratings = response.body.data.products.map((p) => p.rating);
      expect(ratings[0]).toBeGreaterThanOrEqual(ratings[ratings.length - 1]);
    });

    it('rejects unknown sort keys gracefully (falls back to newest)', async () => {
      const response = await request(app).get('/api/products?sort=hack');

      expect(response.status).toBe(200);
    });

    it('returns an empty list for a non-existent category filter', async () => {
      const response = await request(app).get('/api/products?category=nope');

      expect(response.status).toBe(200);
      expect(response.body.data.products).toHaveLength(0);
      expect(response.body.pagination.totalItems).toBe(0);
    });
  });

  /* -------------------------------- Search -------------------------------- */

  describe('Search & suggestions', () => {
    it('finds products by keyword through the text index', async () => {
      const response = await request(app).get('/api/products?q=headphones');

      expect(response.body.data.products.length).toBeGreaterThan(0);
      expect(
        response.body.data.products.some((p) => /headphones/i.test(p.name)),
      ).toBe(true);
    });

    it('returns suggestions for a name prefix', async () => {
      const response = await request(app).get('/api/products/suggest?q=prem');

      expect(response.status).toBe(200);
      expect(response.body.data.suggestions.length).toBeGreaterThan(0);
      expect(response.body.data.suggestions[0].name).toMatch(/^Prem/i);
    });

    it('returns an empty suggestion list for empty queries', async () => {
      const response = await request(app).get('/api/products/suggest?q=');

      expect(response.body.data.suggestions).toEqual([]);
    });
  });

  /* ------------------------------ Product detail ---------------------------- */

  describe('GET /api/products/:identifier', () => {
    it('retrieves a product by slug with populated category and brand', async () => {
      const slug = products[0].slug;
      const response = await request(app).get(`/api/products/${slug}`);

      expect(response.status).toBe(200);
      expect(response.body.data.product.name).toBe(products[0].name);
      expect(response.body.data.product.category.name).toBe('Electronics');
      expect(response.body.data.product.brand.name).toBe('TechNova');
    });

    it('includes related products from the same category', async () => {
      const slug = products[0].slug;
      const response = await request(app).get(`/api/products/${slug}`);

      expect(response.body.data.relatedProducts.length).toBeGreaterThan(0);
      response.body.data.relatedProducts.forEach((related) => {
        expect(related.slug).not.toBe(slug);
      });
    });

    it('returns 404 for unknown slugs', async () => {
      const response = await request(app).get('/api/products/does-not-exist');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  /* ---------------------------- Admin CRUD + RBAC --------------------------- */

  describe('Product management [admin]', () => {
    let refs;

    beforeEach(async () => {
      refs = await seedTaxonomy(); // fresh categories for CRUD tests
    });

    it('creates a product as admin (201)', async () => {
      const payload = {
        name: 'Test Mechanical Keyboard',
        description: 'Hot-swappable switches with RGB lighting',
        price: 129.99,
        discountPrice: 99.99,
        category: refs.category._id.toString(),
        brand: refs.brand._id.toString(),
        stock: 15,
        sku: 'KB-TEST-01',
        specifications: { layout: 'TKL' },
      };

      const response = await request(app)
        .post('/api/products')
        .set('Cookie', adminCookie)
        .send(payload);

      expect(response.status).toBe(201);
      expect(response.body.data.product.effectivePrice).toBe(99.99);
      expect(response.body.data.product.slug).toContain('test-mechanical-keyboard');
    });

    it('blocks anonymous creation (401) and non-admin users (403)', async () => {
      const anonymous = await request(app).post('/api/products').send({});
      expect(anonymous.status).toBe(401);

      const forbidden = await request(app)
        .post('/api/products')
        .set('Cookie', userCookie)
        .send({ name: 'x' });
      expect(forbidden.status).toBe(403);
    });

    it('rejects duplicate SKUs with 409', async () => {
      const payload = productOverrides({
        sku: 'DUP-001',
        category: refs.category._id.toString(),
        brand: refs.brand._id.toString(),
      });
      await request(app).post('/api/products').set('Cookie', adminCookie).send(payload);

      const duplicate = await request(app)
        .post('/api/products')
        .set('Cookie', adminCookie)
        .send(productOverrides({
          sku: 'DUP-001',
          name: 'Another Product',
          category: refs.category._id.toString(),
          brand: refs.brand._id.toString(),
        }));

      expect(duplicate.status).toBe(409);
    });

    it('rejects negative prices and negative stock with 422', async () => {
      const negativePrice = await request(app)
        .post('/api/products')
        .set('Cookie', adminCookie)
        .send(productOverrides({
          price: -10,
          category: refs.category._id.toString(),
          brand: refs.brand._id.toString(),
        }));
      expect(negativePrice.status).toBe(422);

      const negativeStock = await request(app)
        .post('/api/products')
        .set('Cookie', adminCookie)
        .send(productOverrides({
          sku: 'NEG-STOCK-1',
          stock: -5,
          category: refs.category._id.toString(),
          brand: refs.brand._id.toString(),
        }));
      expect(negativeStock.status).toBe(422);
    });

    it('rejects discount prices higher than regular price', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Cookie', adminCookie)
        .send(productOverrides({
          price: 50,
          discountPrice: 60,
          sku: 'DISC-ERR-1',
          category: refs.category._id.toString(),
          brand: refs.brand._id.toString(),
        }));

      expect(response.status).toBe(500); // mongoose hook error surfaces as 500
      expect(response.body.success).toBe(false);
    });

    it('updates a product and regenerates its slug when renamed', async () => {
      const created = await request(app)
        .post('/api/products')
        .set('Cookie', adminCookie)
        .send(productOverrides({
          sku: 'UPD-001',
          category: refs.category._id.toString(),
          brand: refs.brand._id.toString(),
        }));

      const updated = await request(app)
        .put(`/api/products/${created.body.data.product._id}`)
        .set('Cookie', adminCookie)
        .send({ name: 'Renamed Gadget Pro', price: 249 });

      expect(updated.status).toBe(200);
      expect(updated.body.data.product.price).toBe(249);
      expect(updated.body.data.product.slug).toContain('renamed-gadget-pro');
    });

    it('returns 400 for malformed identifiers', async () => {
      const response = await request(app)
        .put('/api/products/not-a-valid-id')
        .set('Cookie', adminCookie)
        .send({ price: 10 });

      expect(response.status).toBe(400);
    });

    it('deletes a product; it then disappears from the catalog', async () => {
      const created = await request(app)
        .post('/api/products')
        .set('Cookie', adminCookie)
        .send(productOverrides({
          sku: 'DEL-001',
          category: refs.category._id.toString(),
          brand: refs.brand._id.toString(),
        }));

      const removed = await request(app)
        .delete(`/api/products/${created.body.data.product._id}`)
        .set('Cookie', adminCookie);
      expect(removed.status).toBe(200);

      const fetch = await request(app).get(`/api/products/${created.body.data.product.slug}`);
      expect(fetch.status).toBe(404);
    });
  });

  /* ------------------------- Categories & brands API ------------------------ */

  describe('Categories & brands endpoints', () => {
    it('exposes public read access', async () => {
      const categories = await request(app).get('/api/categories');
      const brands = await request(app).get('/api/brands');

      expect(categories.status).toBe(200);
      expect(categories.body.data.categories.length).toBeGreaterThan(0);
      expect(brands.body.data.brands.length).toBeGreaterThan(0);
    });

    it('restricts writes to admins', async () => {
      const asUser = await request(app)
        .post('/api/categories')
        .set('Cookie', userCookie)
        .send({ name: 'Hacked Category' });
      expect(asUser.status).toBe(403);

      const asAdmin = await request(app)
        .post('/api/categories')
        .set('Cookie', adminCookie)
        .send({ name: 'Toys & Games' });
      expect(asAdmin.status).toBe(201);
      expect(asAdmin.body.data.category.slug).toBe('toys-games'); // accent/space safe slug
    });

    it('generates unique slugs for duplicate names', async () => {
      await request(app).post('/api/brands').set('Cookie', adminCookie).send({ name: 'Acme' });
      const second = await request(app)
        .post('/api/brands')
        .set('Cookie', adminCookie)
        .send({ name: 'Acme' });

      expect(second.status).toBe(201);
      expect(second.body.data.brand.slug).toBe('acme-1');
    });

    it("prevents deleting a category that still has products (409)", async () => {
      const response = await request(app)
        .delete(`/api/categories/${taxonomy.category._id}`)
        .set('Cookie', adminCookie);

      expect(response.status).toBe(409);
    });

    it('updates a category', async () => {
      const created = await request(app)
        .post('/api/brands')
        .set('Cookie', adminCookie)
        .send({ name: 'OldBrand' });

      const updated = await request(app)
        .put(`/api/brands/${created.body.data.brand._id}`)
        .set('Cookie', adminCookie)
        .send({ name: 'NewBrand', isActive: false });

      expect(updated.status).toBe(200);
      expect(updated.body.data.brand.name).toBe('NewBrand');
      expect(updated.body.data.brand.isActive).toBe(false);
    });
  });

  /* ------------------------------ Admin visibility -------------------------- */

  describe('Inactive content visibility', () => {
    it('hides inactive products from the public but shows them to admins', async () => {
      const deactivated = products[2];
      deactivated.isActive = false;
      await deactivated.save();

      const anonymous = await request(app).get(`/api/products/${deactivated.slug}`);
      expect(anonymous.status).toBe(404);

      const adminView = await request(app)
        .get(`/api/products/${deactivated.slug}`)
        .set('Cookie', adminCookie);
      expect(adminView.status).toBe(200);
    });

    it('hides inactive categories from public listings unless requested by an admin', async () => {
      const inactive = await Category.create({ name: 'Hidden Lane', isActive: false });

      const anonymousList = await request(app).get('/api/categories');
      expect(anonymousList.body.data.categories.some((c) => c.name === 'Hidden Lane')).toBe(false);

      const adminList = await request(app).get('/api/categories?includeInactive=true')
        .set('Cookie', adminCookie);
      expect(adminList.body.data.categories.some((c) => String(c._id) === String(inactive._id))).toBe(true);
    });
  });
});
