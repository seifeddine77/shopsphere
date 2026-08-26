const request = require('supertest');
const app = require('../../src/app');
const emailService = require('../../src/services/email.service');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearCollections,
} = require('../setup/db');
const { sessionCookie } = require('../setup/helpers');

const VALID_USER = {
  firstName: 'Amine',
  lastName: 'Rezgui',
  email: 'amine@example.com',
  password: 'Str0ngPassw0rd',
  confirmPassword: 'Str0ngPassw0rd',
  phone: '+216 12 345 678',
};

/** Emails are sent fire-and-forget (setImmediate) - yield the event loop */
const flushEmailQueue = () => new Promise((resolve) => setTimeout(resolve, 100));

/** Captured reset emails (welcome emails share the array) */
function capturedResetEmails() {
  return emailService.sentEmails.filter((mail) => mail.subject === 'Reset your password');
}

/** Requests a reset for an account and returns the raw token from the email */
async function requestResetTokenFor(email) {
  await request(app).post('/api/auth/forgot-password').send({ email });
  await flushEmailQueue();
  const mail = capturedResetEmails().find((m) => m.to === email);
  const match = /\/auth\/reset-password\/([a-f0-9]{64})/.exec(mail.html);
  if (!match) throw new Error(`No reset token found in email for ${email}`);
  return match[1];
}

describe('Phase 2 - Authentication API', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();
    emailService.sentEmails.length = 0;
  });

  /* ------------------------------ Registration ---------------------------- */

  describe('POST /api/auth/register', () => {
    it('creates an account, sets an HTTP-only session cookie and never leaks the password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(VALID_USER);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(VALID_USER.email);
      expect(response.body.data.user.firstName).toBe('Amine');
      expect(response.body.data.user.role).toBe('USER');

      // Password must never appear anywhere in the payload
      expect(JSON.stringify(response.body)).not.toContain('Str0ngPassw0rd');

      // Session cookie must be HttpOnly
      const cookies = response.headers['set-cookie'];
      expect(cookies.some((cookie) => cookie.startsWith('token=') && /httponly/i.test(cookie))).toBe(true);
    });

    it('rejects duplicate emails with 409', async () => {
      await request(app).post('/api/auth/register').send(VALID_USER);

      const response = await request(app)
        .post('/api/auth/register')
        .send({ ...VALID_USER, email: VALID_USER.email.toUpperCase() });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
    });

    it('returns 422 with per-field errors for a weak password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ ...VALID_USER, password: 'weak', confirmPassword: 'weak' });

      expect(response.status).toBe(422);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'password' })]),
      );
    });

    it('returns 422 when passwords do not match', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ ...VALID_USER, confirmPassword: 'Different123' });

      expect(response.status).toBe(422);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'confirmPassword' })]),
      );
    });

    it('ignores client-supplied role (never trust frontend roles)', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ ...VALID_USER, role: 'ADMIN' });

      expect(response.status).toBe(201);
      expect(response.body.data.user.role).toBe('USER');
    });
  });

  /* --------------------------------- Login -------------------------------- */

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/register').send(VALID_USER);
    });

    it('logs in with valid credentials and returns a session cookie', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: VALID_USER.email, password: VALID_USER.password });

      expect(response.status).toBe(200);
      expect(sessionCookie(response)).toContain('token=');
      expect(response.body.data.user.email).toBe(VALID_USER.email);
    });

    it('rejects a wrong password with 401', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: VALID_USER.email, password: 'WrongPassword1' });

      expect(response.status).toBe(401);
      expect(response.body.message).toMatch(/invalid email or password/i);
    });

    it('responds identically for an unknown email (anti-enumeration)', async () => {
      const wrongPasswordResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: VALID_USER.email, password: 'WrongPassword1' });

      const unknownEmailResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@example.com', password: 'WrongPassword1' });

      expect(unknownEmailResponse.status).toBe(wrongPasswordResponse.status);
      expect(unknownEmailResponse.body.message).toBe(wrongPasswordResponse.body.message);
    });
  });

  /* ------------------------------ Session (me) ----------------------------- */

  describe('GET /api/auth/me', () => {
    it('returns the current user for a valid session', async () => {
      const registration = await request(app).post('/api/auth/register').send(VALID_USER);

      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', sessionCookie(registration));

      expect(response.status).toBe(200);
      expect(response.body.data.user.email).toBe(VALID_USER.email);
    });

    it('returns 401 without a session', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  /* --------------------------------- Logout -------------------------------- */

  describe('POST /api/auth/logout', () => {
    it('clears the session cookie', async () => {
      const registration = await request(app).post('/api/auth/register').send(VALID_USER);

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', sessionCookie(registration));

      expect(response.status).toBe(200);
      const cleared = response.headers['set-cookie'].join('; ');
      expect(cleared).toMatch(/token=;/);
    });
  });

  /* ---------------------------- Password reset ----------------------------- */

  describe('Password reset flow', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/register').send(VALID_USER);
    });

    it('sends a reset link by email for an existing account', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: VALID_USER.email });

      expect(response.status).toBe(200);
      await flushEmailQueue();

      const resetEmails = capturedResetEmails();
      expect(resetEmails).toHaveLength(1);
      expect(resetEmails[0].to).toBe(VALID_USER.email);
      expect(resetEmails[0].html).toMatch(/\/auth\/reset-password\//);
    });

    it('responds identically for an unknown email (no account enumeration)', async () => {
      const known = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: VALID_USER.email });

      const unknown = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'ghost@example.com' });

      expect(unknown.status).toBe(known.status);
      expect(unknown.body.message).toBe(known.body.message);
      await flushEmailQueue();
      expect(emailService.sentEmails.filter((m) => m.to === 'ghost@example.com')).toHaveLength(0);
    });

    it('resets the password with a valid token and invalidates the old one', async () => {
      const token = await requestResetTokenFor(VALID_USER.email);

      const newPassword = 'BrandNew123';
      const reset = await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: newPassword, confirmPassword: newPassword });

      expect(reset.status).toBe(200);

      // Old password no longer works
      const oldLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: VALID_USER.email, password: VALID_USER.password });
      expect(oldLogin.status).toBe(401);

      // New password works
      const newLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: VALID_USER.email, password: newPassword });
      expect(newLogin.status).toBe(200);
    });

    it('rejects token reuse after a successful reset', async () => {
      const token = await requestResetTokenFor(VALID_USER.email);

      await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: 'FirstReset123', confirmPassword: 'FirstReset123' });

      const reuse = await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: 'SecondReset123', confirmPassword: 'SecondReset123' });

      expect(reuse.status).toBe(400);
    });
  });

  /* -------------------------- Authorization (RBAC) ------------------------- */

  describe('Admin authorization', () => {
    const ADMIN = { ...VALID_USER, email: 'admin@example.com' };

    beforeEach(async () => {
      const User = require('../../src/models/User');
      await User.create({
        firstName: ADMIN.firstName,
        lastName: ADMIN.lastName,
        email: ADMIN.email,
        password: ADMIN.password,
        role: 'ADMIN',
      });
    });

    it('allows an admin to reach /api/admin/dashboard', async () => {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: ADMIN.password });

      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Cookie', sessionCookie(login));

      expect(response.status).toBe(200);
      expect(response.body.data.stats).toHaveProperty('totalUsers');
      expect(response.body.data.charts).toHaveProperty('monthly');
    });

    it('blocks a normal user from admin resources with 403', async () => {
      await request(app).post('/api/auth/register').send(VALID_USER);
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: VALID_USER.email, password: VALID_USER.password });

      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Cookie', sessionCookie(login));

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('requires authentication on admin routes (401 anonymous)', async () => {
      const response = await request(app).get('/api/admin/dashboard');

      expect(response.status).toBe(401);
    });
  });

  /* ------------------------------ CSRF guard ------------------------------- */

  describe('Cross-origin protection', () => {
    it('rejects state-changing requests from a foreign origin with 403', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Origin', 'https://evil.example.com')
        .send({ email: VALID_USER.email, password: VALID_USER.password });

      expect(response.status).toBe(403);
      expect(response.body.message).toMatch(/cross-origin/i);
    });

    it('accepts same-origin state-changing requests', async () => {
      await request(app).post('/api/auth/register').send(VALID_USER);

      const response = await request(app)
        .post('/api/auth/login')
        // supertest binds to an ephemeral port on 127.0.0.1 - align the
        // simulated Host with the Origin exactly like a real browser would
        .set('Host', 'localhost:3000')
        .set('Origin', 'http://localhost:3000')
        .send({ email: VALID_USER.email, password: VALID_USER.password });

      expect(response.status).toBe(200);
    });
  });
});
