const request = require('supertest');
const app = require('../../src/app');
const Product = require('../../src/models/Product');
const Review = require('../../src/models/Review');
const emailService = require('../../src/services/email.service');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearCollections,
} = require('../setup/db');
const { createSessionWithRole, placeOrder } = require('../setup/helpers');
const { seedTaxonomy, seedProducts } = require('../setup/fixtures');

const VALID_CARD = { number: '4242 4242 4242 4242', expiry: '12/28', cvc: '123' };

describe('Phase 8 - Reviews (verified purchases + moderation)', () => {
  let buyerACookie;
  let buyerBCookie;
  let adminCookie;
  let products;

  beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([Product.syncIndexes(), Review.syncIndexes()]);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    emailService.sentEmails.length = 0;
    buyerACookie = await createSessionWithRole('USER', 'buyer-a@test.io', 'Passw0rdA1');
    buyerBCookie = await createSessionWithRole('USER', 'buyer-b@test.io', 'Passw0rdB2');
    adminCookie = await createSessionWithRole('ADMIN', 'mods@test.io', 'Passw0rdM7');
    const taxonomy = await seedTaxonomy();
    products = await seedProducts(taxonomy);
  });

  const productIdOf = (sku) => products.find((p) => p.sku === sku)._id.toString();

  /* ------------------------------ Eligibility ------------------------------- */

  describe('Verified-purchase rule', () => {
    it('blocks users who never bought the product (403)', async () => {
      const response = await request(app)
        .post(`/api/products/${productIdOf('CAT-001')}/reviews`)
        .set('Cookie', buyerACookie)
        .send({ rating: 5, comment: 'Amazing headphones, would buy again!' });

      expect(response.status).toBe(403);
      expect(response.body.message).toMatch(/verified buyers/i);
    });

    it('lets a verified buyer create a review that starts unapproved', async () => {
      const productId = productIdOf('CAT-001');
      await placeOrder(buyerACookie, productId);

      const response = await request(app)
        .post(`/api/products/${productId}/reviews`)
        .set('Cookie', buyerACookie)
        .send({ rating: 4, comment: 'Great sound quality and comfy padding.' });

      expect(response.status).toBe(201);
      expect(response.body.data.review.isApproved).toBe(false); // moderation queue
      expect(response.body.message).toMatch(/awaiting approval/i);
    });

    it('does not grant review rights for cancelled orders', async () => {
      const productId = productIdOf('CAT-003');
      const order = await placeOrder(buyerACookie, productId);
      await request(app).post(`/api/orders/${order._id}/cancel`).set('Cookie', buyerACookie);

      const response = await request(app)
        .post(`/api/products/${productId}/reviews`)
        .set('Cookie', buyerACookie)
        .send({ rating: 1, comment: 'Cancelled but trying to review anyway.' });

      expect(response.status).toBe(403);
    });

    it('enforces one review per user per product (409 on duplicate)', async () => {
      const productId = productIdOf('CAT-003');
      await placeOrder(buyerACookie, productId, { paymentMethod: 'CARD', card: VALID_CARD });

      await request(app)
        .post(`/api/products/${productId}/reviews`)
        .set('Cookie', buyerACookie)
        .send({ rating: 5, comment: 'Fantastic speaker, super clear sound!' });

      const duplicate = await request(app)
        .post(`/api/products/${productId}/reviews`)
        .set('Cookie', buyerACookie)
        .send({ rating: 2, comment: 'Trying to post a second review here.' });

      expect(duplicate.status).toBe(409);
    });

    it('validates payloads: bad ratings, short comments, anonymous calls', async () => {
      const productId = productIdOf('CAT-003');
      await placeOrder(buyerACookie, productId);

      for (const badRating of [0, 6, 3.5]) {
        const response = await request(app)
          .post(`/api/products/${productId}/reviews`)
          .set('Cookie', buyerACookie)
          .send({ rating: badRating, comment: 'Valid enough comment here.' });
        expect(response.status).toBe(422);
      }

      const shortComment = await request(app)
        .post(`/api/products/${productId}/reviews`)
        .set('Cookie', buyerACookie)
        .send({ rating: 5, comment: 'short' });
      expect(shortComment.status).toBe(422);

      const anonymous = await request(app)
        .post(`/api/products/${productId}/reviews`)
        .send({ rating: 5, comment: 'Anonymous reviews should fail.' });
      expect(anonymous.status).toBe(401);
    });
  });

  /* -------------------------- Moderation & aggregation ----------------------- */

  describe('Moderation queue & rating aggregation', () => {
    let productId;

    beforeEach(async () => {
      productId = productIdOf('CAT-001');
      await placeOrder(buyerACookie, productId);
      await placeOrder(buyerBCookie, productId, { paymentMethod: 'CARD', card: VALID_CARD });

      // A gives 4 stars, B gives 5 - both land in the queue
      await request(app)
        .post(`/api/products/${productId}/reviews`).set('Cookie', buyerACookie)
        .send({ rating: 4, comment: 'Very good value for the price paid.' });
      await request(app)
        .post(`/api/products/${productId}/reviews`).set('Cookie', buyerBCookie)
        .send({ rating: 5, comment: 'Excellent headphones, battery lasts forever.' });
    });

    it('hides unapproved reviews from the public list and the product page', async () => {
      const apiList = await request(app).get(`/api/products/${productId}/reviews`);
      expect(apiList.body.pagination.totalItems).toBe(0);

      const slug = products.find((p) => p.sku === 'CAT-001').slug;
      const page = await request(app).get(`/products/${slug}`);
      expect(page.text).not.toContain('battery lasts forever');

      // Aggregates unaffected while pending
      const detail = await request(app).get(`/api/products/${productId}`);
      expect(detail.body.data.product.reviewCount).toBe(0);
      expect(detail.body.data.product.rating).toBe(0);
    });

    it('exposes the pending queue to admins only', async () => {
      const asAdmin = await request(app)
        .get('/api/admin/reviews?approved=false').set('Cookie', adminCookie);
      expect(asAdmin.status).toBe(200);
      expect(asAdmin.body.pagination.totalItems).toBe(2);

      const asCustomer = await request(app)
        .get('/api/admin/reviews').set('Cookie', buyerACookie);
      expect(asCustomer.status).toBe(403);
    });

    it('approving updates aggregates visible on the product API and page', async () => {
      const pending = await request(app)
        .get('/api/admin/reviews?approved=false').set('Cookie', adminCookie);

      for (const review of pending.body.data.reviews) {
         
        await request(app)
          .put(`/api/admin/reviews/${review._id}/approve`)
          .set('Cookie', adminCookie);
         
      }

      const detail = await request(app).get(`/api/products/${productId}`);
      expect(detail.body.data.product.reviewCount).toBe(2);
      expect(detail.body.data.product.rating).toBe(4.5); // (4+5)/2

      const page = await request(app)
        .get(`/products/${products.find((p) => p.sku === 'CAT-001').slug}`);
      expect(page.text).toContain('battery lasts forever');
      expect(page.text).toContain('review-item');
    });

    it('rejecting keeps only approved contributions in aggregates', async () => {
      const pending = await request(app)
        .get('/api/admin/reviews?approved=false').set('Cookie', adminCookie);

      await request(app)
        .put(`/api/admin/reviews/${pending.body.data.reviews[0]._id}/approve`)
        .set('Cookie', adminCookie);
      await request(app)
        .put(`/api/admin/reviews/${pending.body.data.reviews[1]._id}/reject`)
        .set('Cookie', adminCookie);

      const detail = await request(app).get(`/api/products/${productId}`);
      expect(detail.body.data.product.reviewCount).toBe(1);
      expect([4, 5]).toContain(detail.body.data.product.rating);
    });
  });

  /* ----------------------------- Owner management ---------------------------- */

  describe('Editing & deleting own reviews', () => {
    let reviewId;
    let productId;

    beforeEach(async () => {
      productId = productIdOf('CAT-001');
      await placeOrder(buyerACookie, productId);
      await request(app)
        .post(`/api/products/${productId}/reviews`)
        .set('Cookie', buyerACookie)
        .send({ rating: 4, comment: 'Initial impression was quite positive.' });
      const mine = await Review.findOne();
      reviewId = mine._id.toString();
    });

    it("prevents editing someone else's review (403)", async () => {
      const response = await request(app)
        .put(`/api/reviews/${reviewId}`)
        .set('Cookie', buyerBCookie)
        .send({ rating: 1, comment: 'Hijacked review attempt here!!' });

      expect(response.status).toBe(403);
    });

    it('returns edited reviews to the moderation queue', async () => {
      await request(app).put(`/api/admin/reviews/${reviewId}/approve`).set('Cookie', adminCookie);
      expect((await Review.findById(reviewId)).isApproved).toBe(true);

      const updated = await request(app)
        .put(`/api/reviews/${reviewId}`)
        .set('Cookie', buyerACookie)
        .send({ rating: 2, comment: 'Downgraded after longer usage period.' });

      expect(updated.status).toBe(200);
      const refreshed = await Review.findById(reviewId);
      expect(refreshed.rating).toBe(2);
      expect(refreshed.isApproved).toBe(false); // re-moderation

      const productDetail = await request(app).get(`/api/products/${productId}`);
      expect(productDetail.body.data.product.reviewCount).toBe(0);
    });

    it('allows owners to delete; others are blocked; admins can delete any', async () => {
      const otherAttempt = await request(app)
        .delete(`/api/reviews/${reviewId}`)
        .set('Cookie', buyerBCookie);
      expect(otherAttempt.status).toBe(403);

      const ownerDelete = await request(app)
        .delete(`/api/reviews/${reviewId}`)
        .set('Cookie', buyerACookie);
      expect(ownerDelete.status).toBe(200);
      expect(await Review.countDocuments()).toBe(0);

      // Admin path on a fresh review
      const speakerId = productIdOf('CAT-003');
      await placeOrder(buyerACookie, speakerId);
      await request(app)
        .post(`/api/products/${speakerId}/reviews`)
        .set('Cookie', buyerACookie)
        .send({ rating: 5, comment: 'Admin will remove this one shortly.' });

      const anyReview = await Review.findOne();
      const adminDelete = await request(app)
        .delete(`/api/admin/reviews/${anyReview._id}`)
        .set('Cookie', adminCookie);
      expect(adminDelete.status).toBe(200);
      expect(await Review.countDocuments()).toBe(0);
    });
  });

  /* ---------------------------------- Page ------------------------------------ */

  describe('Product page integration', () => {
    it('shows eligibility messaging per visitor state', async () => {
      const slug = products.find((p) => p.sku === 'CAT-001').slug;

      // Guest -> login prompt
      const guestPage = await request(app).get(`/products/${slug}`);
      expect(guestPage.text).toContain('Log in');

      // Logged-in non-buyer -> verified-buyers note, no form
      const browserPage = await request(app).get(`/products/${slug}`).set('Cookie', buyerACookie);
      expect(browserPage.text).toContain('Only verified buyers can review');
      expect(browserPage.text).not.toContain('id="review-form"');

      // Buyer -> form present
      await placeOrder(buyerACookie, productIdOf('CAT-001'));
      const buyerPage = await request(app).get(`/products/${slug}`).set('Cookie', buyerACookie);
      expect(buyerPage.text).toContain('id="review-form"');
      expect(buyerPage.text).toContain('star-input');
    });

    it('flags the own-review state with management actions', async () => {
      const slug = products.find((p) => p.sku === 'CAT-003').slug;
      await placeOrder(buyerACookie, productIdOf('CAT-003'));
      await request(app)
        .post(`/api/products/${productIdOf('CAT-003')}/reviews`)
        .set('Cookie', buyerACookie)
        .send({ rating: 5, comment: 'My own pending review text here.' });

      const page = await request(app).get(`/products/${slug}`).set('Cookie', buyerACookie);

      expect(page.text).toContain('Your review is awaiting approval');
      expect(page.text).toContain('js-review-edit');
      expect(page.text).toContain('js-review-delete');
    });
  });
});
