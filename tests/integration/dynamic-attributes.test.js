const request = require('supertest');
const app = require('../../src/app');
const Category = require('../../src/models/Category');
const Brand = require('../../src/models/Brand');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearCollections,
} = require('../setup/db');
const { createSessionWithRole } = require('../setup/helpers');

describe('Dynamic Attributes & Variants System', () => {
  let adminCookie;
  let category;
  let brand;

  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    adminCookie = await createSessionWithRole('ADMIN', 'admin@example.com', 'AdminPass123!');
    category = await Category.create({ name: 'Laptops', slug: 'laptops' });
    brand = await Brand.create({ name: 'Apple', slug: 'apple' });
  });

  describe('Attribute Management (Admin)', () => {
    it('creates a new dynamic attribute with options', async () => {
      const payload = {
        name: 'Storage Capacity',
        label: 'Stockage',
        type: 'SELECT',
        isFilterable: true,
        isVariant: true,
        options: [
          { label: '256 GB', value: '256GB' },
          { label: '512 GB', value: '512GB' },
        ],
      };

      const res = await request(app)
        .post('/api/admin/attributes')
        .set('Cookie', adminCookie)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.attribute.name).toBe('Storage Capacity');
      expect(res.body.data.attribute.slug).toBe('storage-capacity');
      expect(res.body.data.attribute.options).toHaveLength(2);
    });

    it('rejects duplicate attribute names with 409', async () => {
      await request(app)
        .post('/api/admin/attributes')
        .set('Cookie', adminCookie)
        .send({ name: 'Color', type: 'COLOR' });

      const duplicate = await request(app)
        .post('/api/admin/attributes')
        .set('Cookie', adminCookie)
        .send({ name: 'Color', type: 'COLOR' });

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.success).toBe(false);
    });

    it('adds an option to an existing attribute', async () => {
      const createRes = await request(app)
        .post('/api/admin/attributes')
        .set('Cookie', adminCookie)
        .send({ name: 'RAM', type: 'SELECT' });

      const attrId = createRes.body.data.attribute._id;

      const optionRes = await request(app)
        .post(`/api/admin/attributes/${attrId}/options`)
        .set('Cookie', adminCookie)
        .send({ label: '16 GB', value: '16GB' });

      expect(optionRes.status).toBe(200);
      expect(optionRes.body.data.attribute.options).toHaveLength(1);
      expect(optionRes.body.data.attribute.options[0].value).toBe('16GB');
    });
  });

  describe('Product with Dynamic Attributes & Variants', () => {
    it('creates a product with attributes and multi-variant pricing', async () => {
      const productPayload = {
        name: 'MacBook Pro 16',
        description: 'High performance laptop with M3 Max chip and liquid retina display',
        price: 2499.99,
        sku: 'MBP-16-BASE',
        category: category._id.toString(),
        brand: brand._id.toString(),
        stock: 20,
        attributes: [
          { name: 'Color', values: ['Space Gray', 'Silver'] },
          { name: 'Storage', values: ['512GB', '1TB'] },
        ],
        variants: [
          {
            name: 'Space Gray / 512GB',
            sku: 'MBP-16-SG-512',
            price: 2499.99,
            stock: 12,
            attributes: { Color: 'Space Gray', Storage: '512GB' },
          },
          {
            name: 'Silver / 1TB',
            sku: 'MBP-16-SL-1TB',
            price: 2799.99,
            stock: 8,
            attributes: { Color: 'Silver', Storage: '1TB' },
          },
        ],
      };

      const res = await request(app)
        .post('/api/products')
        .set('Cookie', adminCookie)
        .send(productPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.variants).toHaveLength(2);
      expect(res.body.data.product.variants[0].sku).toBe('MBP-16-SG-512');
      expect(res.body.data.product.variants[1].price).toBe(2799.99);
    });

    it('filters catalog dynamically by product variant attribute', async () => {
      await request(app)
        .post('/api/products')
        .set('Cookie', adminCookie)
        .send({
          name: 'Pro Laptop Space Gray',
          description: 'Top end machine with space gray metallic chassis',
          price: 1999.99,
          sku: 'LAPTOP-SG',
          category: category._id.toString(),
          brand: brand._id.toString(),
          stock: 10,
          variants: [
            {
              name: 'Space Gray Edition',
              sku: 'LAPTOP-SG-VAR',
              price: 1999.99,
              stock: 10,
              attributes: { Color: 'Space Gray' },
            },
          ],
        });

      await request(app)
        .post('/api/products')
        .set('Cookie', adminCookie)
        .send({
          name: 'Pro Laptop Midnight Blue',
          description: 'Top end machine with midnight blue metallic chassis',
          price: 1999.99,
          sku: 'LAPTOP-MB',
          category: category._id.toString(),
          brand: brand._id.toString(),
          stock: 10,
          variants: [
            {
              name: 'Midnight Blue Edition',
              sku: 'LAPTOP-MB-VAR',
              price: 1999.99,
              stock: 10,
              attributes: { Color: 'Midnight Blue' },
            },
          ],
        });

      const filterRes = await request(app).get('/api/products?attr_Color=Space%20Gray');

      expect(filterRes.status).toBe(200);
      expect(filterRes.body.success).toBe(true);
      expect(filterRes.body.data.products).toHaveLength(1);
      expect(filterRes.body.data.products[0].name).toBe('Pro Laptop Space Gray');
    });
  });
});

