const request = require('supertest');
const app = require('../../src/app');
const Product = require('../../src/models/Product');
const Subscriber = require('../../src/models/Subscriber');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearCollections,
} = require('../setup/db');
const { createSessionWithRole, placeOrder } = require('../setup/helpers');
const { seedTaxonomy, seedProducts } = require('../setup/fixtures');

function pngBuffer(sizeBytes = 500) {
  // Minimal valid PNG header + padding
  const header = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  ]);
  return Buffer.concat([header, Buffer.alloc(Math.max(0, sizeBytes - header.length), 7)]);
}

describe('Phase 10 - Advanced features', () => {
  let adminCookie;
  let userCookie;
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
    adminCookie = await createSessionWithRole('ADMIN', 'chief@test.io', 'Passw0rdC9');
    userCookie = await createSessionWithRole('USER', 'member@test.io', 'Passw0rdM3');
    const taxonomy = await seedTaxonomy();
    products = await seedProducts(taxonomy);
  });

  /* -------------------------------- Uploads --------------------------------- */

  describe('POST /api/uploads/image [admin]', () => {
    it('accepts a PNG for admins and returns its public URL', async () => {
      const response = await request(app)
        .post('/api/uploads/image')
        .set('Cookie', adminCookie)
        .field('unused', '1')
        .attach('image', pngBuffer(800), { filename: 'photo.png', contentType: 'image/png' });

      expect(response.status).toBe(201);
      expect(response.body.data.url).toMatch(/^\/uploads\/products\/\d+-[a-f0-9]+\.png$/);
    });

    it('blocks customers (403) and guests (401)', async () => {
      const forbiddenResponse = await request(app)
        .post('/api/uploads/image')
        .set('Cookie', userCookie)
        .attach('image', pngBuffer(), { filename: 'x.png', contentType: 'image/png' });
      expect(forbiddenResponse.status).toBe(403);

      const anonymousResponse = await request(app)
        .post('/api/uploads/image')
        .attach('image', pngBuffer(), { filename: 'x.png', contentType: 'image/png' });
      expect(anonymousResponse.status).toBe(401);
    });

    it('rejects disallowed file types with 422', async () => {
      const response = await request(app)
        .post('/api/uploads/image')
        .set('Cookie', adminCookie)
        .attach('image', Buffer.from('not an image at all'), {
          filename: 'evil.txt',
          contentType: 'text/plain',
        });

      expect(response.status).toBe(422);
      expect(response.body.message).toMatch(/jpeg|png|webp/i);
    });
  });

  /* --------------------------------- Profile -------------------------------- */

  describe('Profile APIs', () => {
    it('updates personal information', async () => {
      const response = await request(app)
        .put('/api/users/me')
        .set('Cookie', userCookie)
        .send({ firstName: 'Janet', lastName: 'Doe-Updated', phone: '+216 99 888 777' });

      expect(response.status).toBe(200);
      expect(response.body.data.user.firstName).toBe('Janet');
      expect(response.body.data.user).not.toHaveProperty('password');
    });

    it('changes the password only when the current one is correct', async () => {
      const wrongCurrent = await request(app)
        .put('/api/users/me/password')
        .set('Cookie', userCookie)
        .send({
          currentPassword: 'WrongOld123',
          newPassword: 'NewStrong77',
          confirmPassword: 'NewStrong77',
        });
      expect(wrongCurrent.status).toBe(401);

      const ok = await request(app)
        .put('/api/users/me/password')
        .set('Cookie', userCookie)
        .send({
          currentPassword: 'Passw0rdM3',
          newPassword: 'NewStrong77',
          confirmPassword: 'NewStrong77',
        });
      expect(ok.status).toBe(200);

      // Old password rejected, new one accepted
      const oldLogin = await request(app)
        .post('/api/auth/login').send({ email: 'member@test.io', password: 'Passw0rdM3' });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app)
        .post('/api/auth/login').send({ email: 'member@test.io', password: 'NewStrong77' });
      expect(newLogin.status).toBe(200);
    });

    it('manages addresses with default promotion logic', async () => {
      const added = await request(app)
        .post('/api/users/me/addresses')
        .set('Cookie', userCookie)
        .send({
          label: 'Home', fullName: 'Jane Doe', phone: '+216 12 345 678',
          street: '5 Test Road', city: 'Tunis', postalCode: '1000', country: 'Tunisia',
        });

      expect(added.status).toBe(201);
      expect(added.body.data.address.isDefault).toBe(true); // first address auto-default

      const second = await request(app)
        .post('/api/users/me/addresses')
        .set('Cookie', userCookie)
        .send({
          label: 'Office', fullName: 'Jane Doe', phone: '+216 12 345 678',
          street: '99 Work Blvd', city: 'Ariana', postalCode: '2080', country: 'Tunisia',
        });
      expect(second.body.data.address.isDefault).toBe(false);

      // Delete the default -> the remaining address is promoted
      const removed = await request(app)
        .delete(`/api/users/me/addresses/${added.body.data.address._id}`)
        .set('Cookie', userCookie);
      expect(removed.status).toBe(200);
      expect(removed.body.data.addresses).toHaveLength(1);
      expect(removed.body.data.addresses[0].isDefault).toBe(true);
    });

    it('renders the profile page for the owner and redirects guests', async () => {
      const guest = await request(app).get('/profile').redirects(0);
      expect(guest.status).toBe(302);

      const owner = await request(app).get('/profile').set('Cookie', userCookie);
      expect(owner.status).toBe(200);
      expect(owner.text).toContain('Change password');
      expect(owner.text).toContain('member@test.io');
    });
  });

  /* -------------------------------- Newsletter ------------------------------- */

  describe('Newsletter', () => {
    it('subscribes new emails and answers identically for duplicates', async () => {
      const first = await request(app)
        .post('/api/newsletter').send({ email: 'Fan@Example.COM', source: 'home' });
      expect(first.status).toBe(201);

      const duplicate = await request(app)
        .post('/api/newsletter').send({ email: 'fan@example.com' });
      expect(duplicate.status).toBe(200);
      expect(await Subscriber.countDocuments()).toBe(1);
      expect((await Subscriber.findOne()).email).toBe('fan@example.com'); // normalized
    });

    it('rejects invalid emails with 422', async () => {
      const response = await request(app)
        .post('/api/newsletter').send({ email: 'not-an-email' });
      expect(response.status).toBe(422);
    });
  });

  /* -------------------------------- Settings --------------------------------- */

  describe('Store settings', () => {
    it('exposes defaults before any customization', async () => {
      const response = await request(app)
        .get('/api/admin/settings').set('Cookie', adminCookie);

      expect(response.status).toBe(200);
      expect(response.body.data.settings.shippingFreeThreshold).toBeGreaterThan(0);
    });

    it("applies saved settings to real order shipping calculations", async () => {
      // Lower the free-shipping threshold so a 35$ book order ships FREE
      const updated = await request(app)
        .put('/api/admin/settings')
        .set('Cookie', adminCookie)
        .send({ shippingFlatRate: 2.5, shippingFreeThreshold: 30, lowStockThreshold: 8 });

      expect(updated.status).toBe(200);
      expect(updated.body.data.settings.shippingFreeThreshold).toBe(30);

      const productId = products.find((p) => p.sku === 'CAT-004')._id.toString(); // $35
      const order = await placeOrder(userCookie, productId);

      expect(order.shippingCost).toBe(0);   // 35 >= new threshold 30
      expect(order.total).toBe(35);
    });

    it('blocks non-admins from reading or writing settings', async () => {
      const read = await request(app).get('/api/admin/settings').set('Cookie', userCookie);
      const write = await request(app)
        .put('/api/admin/settings').set('Cookie', userCookie)
        .send({ shippingFlatRate: 999 });

      expect(read.status).toBe(403);
      expect(write.status).toBe(403);
    });

    it('renders the settings page for admins', async () => {
      const response = await request(app).get('/admin/settings').set('Cookie', adminCookie);
      expect(response.status).toBe(200);
      expect(response.text).toContain('Free shipping threshold');
    });
  });

  /* ------------------------------ Recommendations ---------------------------- */

  describe('Related product recommendations', () => {
    it('fills empty slots with same-brand then popular products', async () => {
      // CAT-004 (book) is the ONLY item in its category - related must fall
      // back to other brands/products instead of returning nothing.
      const slug = products.find((p) => p.sku === 'CAT-004').slug;
      const response = await request(app).get(`/api/products/${slug}`);

      const related = response.body.data.relatedProducts;
      expect(related.length).toBeGreaterThan(0);
      related.forEach((item) => {
        expect(item.slug).not.toBe(slug);
      });
    });
  });
});
