const request = require('supertest');
const app = require('../../src/app');
const { connectTestDatabase, disconnectTestDatabase, clearCollections } = require('../setup/db');
const User = require('../../src/models/User');
const Category = require('../../src/models/Category');
const Section = require('../../src/models/Section');
const Page = require('../../src/models/Page');
const Menu = require('../../src/models/Menu');

describe('Next-Gen & Supercharged Features Test Suite', () => {
  let adminCookie;
  let userCookie;

  beforeAll(async () => {
    await connectTestDatabase();
    await clearCollections(User, Category, Section, Page, Menu);

    // Create admin
    await User.create({
      firstName: 'Admin',
      lastName: 'Master',
      email: 'admin.nextgen@shopsphere.test',
      password: 'AdminPassword123!',
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    // Create regular user
    await User.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.nextgen@shopsphere.test',
      password: 'UserPassword123!',
      role: 'USER',
      status: 'ACTIVE',
    });

    const adminLogin = await request(app).post('/api/auth/login').send({
      email: 'admin.nextgen@shopsphere.test',
      password: 'AdminPassword123!',
    });
    adminCookie = adminLogin.headers['set-cookie'];

    const userLogin = await request(app).post('/api/auth/login').send({
      email: 'john.nextgen@shopsphere.test',
      password: 'UserPassword123!',
    });
    userCookie = userLogin.headers['set-cookie'];
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  describe('Hierarchical Category Tree API', () => {
    it('creates root and child categories and returns tree structure', async () => {
      const rootRes = await request(app)
        .post('/api/categories')
        .set('Cookie', adminCookie)
        .send({ name: 'Computers & Laptops', description: 'Tech hardware' });
      expect(rootRes.status).toBe(201);
      const rootCat = rootRes.body.data.category;

      const subRes = await request(app)
        .post('/api/categories')
        .set('Cookie', adminCookie)
        .send({ name: 'Gaming Laptops', parent: rootCat._id, description: 'High performance gaming' });
      expect(subRes.status).toBe(201);

      const treeRes = await request(app).get('/api/categories/tree');
      expect(treeRes.status).toBe(200);
      expect(treeRes.body.success).toBe(true);
      expect(Array.isArray(treeRes.body.data.tree)).toBe(true);
      expect(treeRes.body.data.tree.length).toBeGreaterThanOrEqual(1);

      const rootInTree = treeRes.body.data.tree.find((c) => c._id === rootCat._id);
      expect(rootInTree).toBeDefined();
      expect(rootInTree.children.length).toBe(1);
      expect(rootInTree.children[0].name).toBe('Gaming Laptops');
    });
  });

  describe('Dynamic CMS Sections & Pages', () => {
    it('creates a dynamic homepage section', async () => {
      const secRes = await request(app)
        .post('/api/admin/sections')
        .set('Cookie', adminCookie)
        .send({
          type: 'HERO',
          title: 'Spring Season Mega Sale',
          subtitle: 'Up to 50% discount on all trending items',
          order: 1,
          isActive: true,
        });
      expect(secRes.status).toBe(201);
      expect(secRes.body.data.section.type).toBe('HERO');
    });

    it('creates a CMS page and renders it on the storefront /p/:slug', async () => {
      const pageRes = await request(app)
        .post('/api/admin/pages')
        .set('Cookie', adminCookie)
        .send({
          title: 'Terms of Service',
          summary: 'Our platform terms and user conditions',
          content: '<h2>Terms of Service</h2><p>Welcome to ShopSphere official marketplace.</p>',
          seoTitle: 'Terms of Service | ShopSphere',
        });
      expect(pageRes.status).toBe(201);
      const createdPage = pageRes.body.data.page;

      const storefrontRes = await request(app).get(`/p/${createdPage.slug}`);
      expect(storefrontRes.status).toBe(200);
      expect(storefrontRes.text).toContain('Terms of Service');
      expect(storefrontRes.text).toContain('Welcome to ShopSphere official marketplace.');
    });
  });

  describe('Admin Global Search & Executive AI Copilot', () => {
    it('searches across products, users, and categories', async () => {
      const searchRes = await request(app)
        .get('/api/admin/global-search?q=Gaming')
        .set('Cookie', adminCookie);
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.success).toBe(true);
      expect(searchRes.body.data.categories.length).toBeGreaterThanOrEqual(1);
    });

    it('executes AI Executive Copilot real-time intelligence', async () => {
      const copilotRes = await request(app)
        .post('/api/ai/admin-copilot')
        .set('Cookie', adminCookie)
        .send({ prompt: 'Quel est l\'état actuel du stock et des ventes ?' });
      expect(copilotRes.status).toBe(200);
      expect(copilotRes.body.success).toBe(true);
      expect(copilotRes.body.data.reply).toBeDefined();
      expect(copilotRes.body.data.metrics).toBeDefined();
    });
  });

  describe('Admin Navigation Menu Builder', () => {
    it('saves header menu and retrieves it', async () => {
      const menuRes = await request(app)
        .put('/api/admin/menus/HEADER')
        .set('Cookie', adminCookie)
        .send({
          items: [
            { label: 'Home', url: '/' },
            { label: 'Catalog', url: '/products' },
            { label: 'Terms', url: '/p/terms-of-service' },
          ],
        });
      expect(menuRes.status).toBe(200);
      expect(menuRes.body.data.menu.items.length).toBe(3);
    });
  });

  describe('Admin UI View Renderers', () => {
    it('renders /admin/menus for admin', async () => {
      const res = await request(app).get('/admin/menus').set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.text).toContain('Menu Builder');
    });

    it('renders /admin/media for admin', async () => {
      const res = await request(app).get('/admin/media').set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.text).toContain('Media Library');
    });

    it('renders /admin/customers for admin', async () => {
      const res = await request(app).get('/admin/customers').set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.text).toContain('Customer Intelligence');
    });

    it('blocks regular users from admin pages', async () => {
      const res = await request(app).get('/admin/customers').set('Cookie', userCookie);
      expect(res.status).toBe(302); // redirects away from admin
    });
  });
});
