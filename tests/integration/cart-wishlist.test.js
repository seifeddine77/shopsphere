const request = require('supertest');
const app = require('../../src/app');
const Product = require('../../src/models/Product');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearCollections,
} = require('../setup/db');
const { createSessionWithRole } = require('../setup/helpers');
const { seedTaxonomy, seedProducts } = require('../setup/fixtures');

describe('Phase 5 - Shopping (cart & wishlist)', () => {
  let userACookie; // main shopper
  let userBCookie; // second user (isolation checks)
  let products; // [deluxe(150/stock10), earbuds(stock0), speaker(320/stock5), book]

  beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([Product.syncIndexes()]);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    userACookie = await createSessionWithRole('USER', 'shopper-a@test.io', 'Passw0rdA1');
    userBCookie = await createSessionWithRole('USER', 'shopper-b@test.io', 'Passw0rdB2');
    const taxonomy = await seedTaxonomy();
    products = await seedProducts(taxonomy);
  });

  const productIdOf = (sku) => products.find((p) => p.sku === sku)._id.toString();

  /* --------------------------------- Cart ---------------------------------- */

  describe('Cart API', () => {
    it('rejects anonymous shoppers with 401', async () => {
      const response = await request(app).post('/api/cart').send({ productId: productIdOf('CAT-001') });
      expect(response.status).toBe(401);
    });

    it('adds a product and prices it from the database, not the client', async () => {
      const response = await request(app)
        .post('/api/cart')
        .set('Cookie', userACookie)
        .send({ productId: productIdOf('CAT-001'), quantity: 2, price: 0.01 }); // tampering attempt

      expect(response.status).toBe(200);
      expect(response.body.data.cart.itemCount).toBe(2);
      const item = response.body.data.cart.items[0];
      expect(item.unitPrice).toBe(150); // discounted effective price from DB
      expect(item.lineTotal).toBe(300);
      expect(response.body.data.cart.subtotal).toBe(300);
      expect(JSON.stringify(response.body)).not.toContain('0.01');
    });

    it('increments quantity when adding the same product twice', async () => {
      await request(app).post('/api/cart').set('Cookie', userACookie).send({ productId: productIdOf('CAT-001') });
      const again = await request(app).post('/api/cart').set('Cookie', userACookie).send({ productId: productIdOf('CAT-001') });

      expect(again.body.data.cart.itemCount).toBe(2);
      expect(again.body.data.cart.distinctItems).toBe(1);
    });

    it('computes subtotal across multiple products', async () => {
      await request(app).post('/api/cart').set('Cookie', userACookie).send({ productId: productIdOf('CAT-001'), quantity: 2 });
      const withSpeaker = await request(app).post('/api/cart').set('Cookie', userACookie).send({ productId: productIdOf('CAT-003'), quantity: 2 });

      // 150*2 + 320*2
      expect(withSpeaker.body.data.cart.subtotal).toBe(940);
    });

    it('refuses quantities above available stock', async () => {
      const response = await request(app)
        .post('/api/cart')
        .set('Cookie', userACookie)
        .send({ productId: productIdOf('CAT-003'), quantity: 6 }); // stock is 5

      expect(response.status).toBe(422);
      expect(response.body.message).toMatch(/5 unit\(s\) left/i);
    });

    it('refuses adding more units than remain in stock on repeat adds', async () => {
      await request(app).post('/api/cart').set('Cookie', userACookie).send({ productId: productIdOf('CAT-003'), quantity: 5 });
      const extra = await request(app).post('/api/cart').set('Cookie', userACookie).send({ productId: productIdOf('CAT-003') });

      expect(extra.status).toBe(422);
    });

    it('refuses out-of-stock products', async () => {
      const response = await request(app)
        .post('/api/cart')
        .set('Cookie', userACookie)
        .send({ productId: productIdOf('CAT-002') }); // stock 0

      expect(response.status).toBe(422);
      expect(response.body.message).toMatch(/out of stock/i);
    });

    it('updates a line quantity and recomputes totals', async () => {
      await request(app).post('/api/cart').set('Cookie', userACookie).send({ productId: productIdOf('CAT-001'), quantity: 1 });

      const updated = await request(app)
        .put(`/api/cart/${productIdOf('CAT-001')}`)
        .set('Cookie', userACookie)
        .send({ quantity: 3 });

      expect(updated.status).toBe(200);
      expect(updated.body.data.cart.items[0].lineTotal).toBe(450);
    });

    it('rejects invalid quantities with 422', async () => {
      await request(app).post('/api/cart').set('Cookie', userACookie).send({ productId: productIdOf('CAT-001') });

      for (const badQuantity of [0, -1, 2.5]) {
        const response = await request(app)
          .put(`/api/cart/${productIdOf('CAT-001')}`)
          .set('Cookie', userACookie)
          .send({ quantity: badQuantity });
        expect(response.status).toBe(422);
      }
    });

    it("returns 404 when updating a product that isn't in the cart", async () => {
      const response = await request(app)
        .put(`/api/cart/${productIdOf('CAT-004')}`)
        .set('Cookie', userACookie)
        .send({ quantity: 1 });

      expect(response.status).toBe(404);
    });

    it('removes a single item and clears the cart', async () => {
      await request(app).post('/api/cart').set('Cookie', userACookie).send({ productId: productIdOf('CAT-001') });
      await request(app).post('/api/cart').set('Cookie', userACookie).send({ productId: productIdOf('CAT-003') });

      const removed = await request(app)
        .delete(`/api/cart/${productIdOf('CAT-001')}`)
        .set('Cookie', userACookie);
      expect(removed.body.data.cart.distinctItems).toBe(1);

      await request(app).delete('/api/cart').set('Cookie', userACookie);
      const empty = await request(app).get('/api/cart').set('Cookie', userACookie);
      expect(empty.body.data.cart.itemCount).toBe(0);
    });

    it('keeps carts isolated between users', async () => {
      await request(app).post('/api/cart').set('Cookie', userACookie).send({ productId: productIdOf('CAT-001'), quantity: 2 });

      const otherUser = await request(app).get('/api/cart').set('Cookie', userBCookie);
      expect(otherUser.body.data.cart.itemCount).toBe(0);

      // B cannot manipulate A's line items - they simply do not exist in B's cart
      const forbiddenUpdate = await request(app)
        .put(`/api/cart/${productIdOf('CAT-001')}`)
        .set('Cookie', userBCookie)
        .send({ quantity: 99 });
      expect(forbiddenUpdate.status).toBe(404);
    });
  });

  /* -------------------------------- Wishlist -------------------------------- */

  describe('Wishlist API', () => {
    it('adds products idempotently (no duplicates)', async () => {
      await request(app).post('/api/wishlist').set('Cookie', userACookie).send({ productId: productIdOf('CAT-003') });
      const again = await request(app).post('/api/wishlist').set('Cookie', userACookie).send({ productId: productIdOf('CAT-003') });

      expect(again.status).toBe(200);
      expect(again.body.data.wishlist.products).toHaveLength(1);
      expect(again.body.message).toBe('Saved to wishlist');
    });

    it('lists wishlist products with card data', async () => {
      await request(app).post('/api/wishlist').set('Cookie', userACookie).send({ productId: productIdOf('CAT-001') });

      const list = await request(app).get('/api/wishlist').set('Cookie', userACookie);
      expect(list.body.data.wishlist.products[0].name).toBe('Wireless Headphones Deluxe');
    });

    it('removes a product from the wishlist', async () => {
      await request(app).post('/api/wishlist').set('Cookie', userACookie).send({ productId: productIdOf('CAT-001') });

      const removed = await request(app)
        .delete(`/api/wishlist/${productIdOf('CAT-001')}`)
        .set('Cookie', userACookie);

      expect(removed.body.data.wishlist.products).toHaveLength(0);
    });

    it('moves a product to the cart and out of the wishlist', async () => {
      await request(app).post('/api/wishlist').set('Cookie', userACookie).send({ productId: productIdOf('CAT-003') });

      const moved = await request(app)
        .delete(`/api/wishlist/${productIdOf('CAT-003')}/move-to-cart`)
        .set('Cookie', userACookie)
        .send({ quantity: 2 });

      expect(moved.status).toBe(200);
      expect(moved.body.data.cart.itemCount).toBe(2);
      expect(moved.body.data.wishlist.products).toHaveLength(0);
    });

    it('keeps the product wishlisted when moving fails (out of stock)', async () => {
      await request(app).post('/api/wishlist').set('Cookie', userACookie).send({ productId: productIdOf('CAT-002') }); // stock 0

      const failed = await request(app)
        .delete(`/api/wishlist/${productIdOf('CAT-002')}/move-to-cart`)
        .set('Cookie', userACookie);

      expect(failed.status).toBe(422);

      const list = await request(app).get('/api/wishlist').set('Cookie', userACookie);
      expect(list.body.data.wishlist.products).toHaveLength(1); // still saved
    });
  });

  /* ------------------------------ Shopping pages ----------------------------- */

  describe('Cart & wishlist pages', () => {
    it('redirects guests to login with a return path', async () => {
      const cartPage = await request(app).get('/cart').redirects(0);
      expect(cartPage.status).toBe(302);
      expect(cartPage.headers.location).toBe('/auth/login?redirect=%2Fcart');

      const wishlistPage = await request(app).get('/wishlist').redirects(0);
      expect(wishlistPage.status).toBe(302);
    });

    it('renders the cart page with items and subtotal for the owner', async () => {
      await request(app).post('/api/cart').set('Cookie', userACookie).send({ productId: productIdOf('CAT-001'), quantity: 2 });

      const response = await request(app).get('/cart').set('Cookie', userACookie);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Wireless Headphones Deluxe');
      expect(response.text).toContain('$300.00'); // line total + subtotal
      expect(response.text).toContain('Proceed to checkout');
    });

    it('renders the empty-cart state', async () => {
      const response = await request(app).get('/cart').set('Cookie', userACookie);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Your cart is empty');
    });

    it('renders the wishlist page with move-to-cart actions', async () => {
      await request(app).post('/api/wishlist').set('Cookie', userACookie).send({ productId: productIdOf('CAT-003') });

      const response = await request(app).get('/wishlist').set('Cookie', userACookie);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Premium Speaker');
      expect(response.text).toContain('js-move-to-cart');
    });
  });
});
