/**
 * Shared test helpers: user/session factories used by multiple suites.
 */
const request = require('supertest');

const app = require('../../src/app');

/** Extract the session cookie from a response */
function sessionCookie(response) {
  const raw = response.headers['set-cookie'] || [];
  return raw.map((cookie) => cookie.split(';')[0]).join('; ');
}

/** Registers a USER account and returns { cookie, user } */
async function registerUser(payload) {
  const response = await request(app).post('/api/auth/register').send(payload);
  if (response.status !== 201) {
    throw new Error(`registerUser failed: ${JSON.stringify(response.body)}`);
  }
  return { cookie: sessionCookie(response), user: response.body.data.user };
}

/** Logs in an existing account, returns the session cookie string */
async function loginCookie(email, password) {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  if (response.status !== 200) {
    throw new Error(`loginCookie failed: ${JSON.stringify(response.body)}`);
  }
  return sessionCookie(response);
}

/**
 * Creates a user account with the given role directly in the database
 * (roles are never settable through the API - that is the point of RBAC)
 * then returns its session cookie.
 */
async function createSessionWithRole(role, email, password) {
  const User = require('../../src/models/User');
  const [firstName] = email.split('@');
  await User.create({
    firstName: firstName.slice(0, 20),
    lastName: 'Tester',
    email,
    password,
    role,
  });
  return loginCookie(email, password);
}

/**
 * Places a single-product order through the real API (cart + checkout).
 * Returns the created order JSON.
 */
async function placeOrder(cookie, productId, { quantity = 1, paymentMethod = 'COD', card = null } = {}) {
  const cartResponse = await request(app)
    .post('/api/cart')
    .set('Cookie', cookie)
    .send({ productId, quantity });
  if (cartResponse.status !== 200) {
    throw new Error(`placeOrder (cart) failed: ${JSON.stringify(cartResponse.body)}`);
  }

  const payload = { shippingAddress: {
    fullName: 'Test Buyer',
    phone: '+216 12 345 678',
    street: '9 Test Avenue',
    city: 'Tunis',
    state: '',
    postalCode: '1000',
    country: 'Tunisia',
  }, paymentMethod };
  if (card) payload.card = card;

  const orderResponse = await request(app).post('/api/orders').set('Cookie', cookie).send(payload);
  if (orderResponse.status !== 201) {
    throw new Error(`placeOrder (order) failed: ${JSON.stringify(orderResponse.body)}`);
  }
  return orderResponse.body.data.order;
}

module.exports = { sessionCookie, registerUser, loginCookie, createSessionWithRole, placeOrder };
