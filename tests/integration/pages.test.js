const request = require('supertest');
const app = require('../../src/app');
const Product = require('../../src/models/Product');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearCollections,
} = require('../setup/db');
const { seedTaxonomy, seedProducts } = require('../setup/fixtures');

describe('Phase 4 - Storefront pages', () => {
  let taxonomy;
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
    taxonomy = await seedTaxonomy();
    products = await seedProducts(taxonomy);
  });

  /* --------------------------------- Home --------------------------------- */

  describe('GET /', () => {
    it('renders featured and latest products from the database', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      // Featured section contains the seeded featured product
      expect(response.text).toContain('Wireless Headphones Deluxe');
      // Latest section contains a recently added product
      expect(response.text).toContain('Premium Speaker');
      // Category chips render
      expect(response.text).toContain('/products?category=electronics');
    });
  });

  /* ------------------------------- Catalog --------------------------------- */

  describe('GET /products', () => {
    it('renders the product grid with cards and prices', async () => {
      const response = await request(app).get('/products');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Wireless Headphones Deluxe');
      expect(response.text).toContain('$150.00'); // discounted effective price
      expect(response.text).toContain('<s class="price-old">$200.00</s>');
      expect(response.text).toContain('4 products found');
    });

    it('renders pagination links when results exceed one page', async () => {
      const response = await request(app).get('/products?limit=2');

      expect(response.status).toBe(200);
      expect(response.text).toContain('page=2');
      // Active page marker must be emitted unescaped (accessibility)
      expect(response.text).toMatch(/<li class="page-item active"\s*aria-current="page">/);
    });

    it('applies search and shows the term in the heading', async () => {
      const response = await request(app).get('/products?q=headphones');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Results for');
      expect(response.text).toContain('Headphones');
      expect(response.text).not.toContain('Clean Code Guide');
    });

    it('shows the empty state when nothing matches', async () => {
      const response = await request(app).get('/products?q=zzzznothing');

      expect(response.status).toBe(200);
      expect(response.text).toContain('No products match your criteria');
    });

    it('marks the selected category filter as checked', async () => {
      const response = await request(app)
        .get(`/products?category=${taxonomy.otherCategory.slug}`);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Clean Code Guide');
      expect(response.text).not.toContain('Premium Speaker');
    });

    it('keeps filters in pagination links (base query preserved)', async () => {
      const response = await request(app)
        .get(`/products?category=${taxonomy.category.slug}&sort=price_asc&limit=2`);

      expect(response.text).toMatch(/category=electronics&amp;sort=price_asc&amp;limit=2&amp;page=2/);
    });
  });

  /* ---------------------------- Product details ----------------------------- */

  describe('GET /products/:slug', () => {
    it('renders full detail with gallery, price block and specs', async () => {
      const slug = products[0].slug;
      const response = await request(app).get(`/products/${slug}`);

      expect(response.status).toBe(200);
      expect(response.text).toContain('<h1 class="h2 fw-bold">Wireless Headphones Deluxe</h1>');
      expect(response.text).toContain('-25%'); // discount badge
      expect(response.text).toContain('Low stock - only 10 left');
      expect(response.text).toContain('qty-stepper');
      expect(response.text).toContain('You may also like'); // related products
    });

    it('disables purchase for out-of-stock products', async () => {
      const slug = products[1].slug; // Budget Earbuds, stock 0
      const response = await request(app).get(`/products/${slug}`);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Out of stock');
      expect(response.text).toContain('aria-disabled="true"');
    });

    it('renders an HTML 404 page for unknown slugs', async () => {
      const response = await request(app).get('/products/no-such-product');

      expect(response.status).toBe(404);
      expect(response.text).toContain('404');
    });

    it('hides inactive products from customers', async () => {
      const hidden = products[2];
      hidden.isActive = false;
      await hidden.save();

      const response = await request(app).get(`/products/${hidden.slug}`);
      expect(response.status).toBe(404);
    });
  });

  /* ------------------------------- Search path ------------------------------ */

  describe('GET /search (legacy)', () => {
    it('redirects to the catalog preserving the query', async () => {
      const response = await request(app).get('/search?q=headphones').redirects(0);

      expect(response.status).toBe(301);
      expect(response.headers.location).toBe('/products?q=headphones');
    });
  });
});
