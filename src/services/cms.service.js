const Section = require('../models/Section');
const Page = require('../models/Page');
const Menu = require('../models/Menu');
const { notFound } = require('../utils/errors');

/* ------------------------------ Sections ---------------------------------- */

const DEFAULT_SECTIONS = [
  {
    type: 'HERO',
    title: 'Experience Audio Like Never Before',
    subtitle: 'High-Fidelity Audio, Reimagined. Up to 40% Off.',
    order: 0,
    isActive: true,
    config: {
      buttonText: 'Explore Collection',
      buttonLink: '/products',
      badge: 'New Season 2026',
    },
  },
  {
    type: 'FLASH_SALE',
    title: 'Up to 50% Off On Electronics & Essentials',
    subtitle: 'Limited Time Flash Sale',
    order: 1,
    isActive: true,
    config: {
      buttonText: 'Claim Deals Now',
      buttonLink: '/products?isFeatured=true',
      discountText: '-50% OFF',
    },
  },
  {
    type: 'CATEGORY_GRID',
    title: 'Shop by Category',
    subtitle: 'Find exactly what you need',
    order: 2,
    isActive: true,
  },
  {
    type: 'PRODUCT_GRID',
    title: 'Featured Products',
    subtitle: 'Hand-picked selections for quality and performance',
    order: 3,
    isActive: true,
    config: { limit: 8 },
  },
  {
    type: 'TESTIMONIALS',
    title: 'Loved by thousands of happy shoppers',
    subtitle: 'Verified reviews from real customers worldwide',
    order: 4,
    isActive: true,
  },
  {
    type: 'NEWSLETTER',
    title: 'Join our newsletter',
    subtitle: 'Be first to hear about launches and exclusive offers.',
    order: 5,
    isActive: true,
  },
];

async function getActiveSections() {
  const count = await Section.countDocuments();
  if (count === 0) {
    await Section.insertMany(DEFAULT_SECTIONS);
  }
  return Section.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
}

async function listAllSections() {
  const count = await Section.countDocuments();
  if (count === 0) {
    await Section.insertMany(DEFAULT_SECTIONS);
  }
  return Section.find().sort({ order: 1, createdAt: 1 });
}

async function createSection(data) {
  return Section.create(data);
}

async function updateSection(id, data) {
  const section = await Section.findById(id);
  if (!section) throw notFound('Section not found');
  Object.assign(section, data);
  await section.save();
  return section;
}

async function deleteSection(id) {
  const section = await Section.findById(id);
  if (!section) throw notFound('Section not found');
  await section.deleteOne();
  return section;
}

/* ------------------------------ CMS Pages --------------------------------- */

async function listPages({ includeInactive = false } = {}) {
  const filter = includeInactive ? {} : { isActive: true };
  return Page.find(filter).sort({ order: 1, title: 1 });
}

async function getPageBySlug(slug) {
  const page = await Page.findOne({ slug: String(slug).toLowerCase(), isActive: true });
  if (!page) throw notFound('Page not found');
  return page;
}

async function createPage(data) {
  return Page.create(data);
}

async function updatePage(id, data) {
  const page = await Page.findById(id);
  if (!page) throw notFound('Page not found');
  Object.assign(page, data);
  await page.save();
  return page;
}

async function deletePage(id) {
  const page = await Page.findById(id);
  if (!page) throw notFound('Page not found');
  await page.deleteOne();
  return page;
}

/* ------------------------------ Menus ------------------------------------- */

async function getMenu(location) {
  let menu = await Menu.findOne({ location, isActive: true });
  if (!menu) {
    const defaultItems = location === 'HEADER' ? [
      { label: 'Shop All', url: '/products', order: 0 },
      { label: 'Deals', url: '/products?isFeatured=true', order: 1 },
      { label: 'Compare', url: '/compare', order: 2 },
    ] : [
      { label: 'About Us', url: '/p/about', order: 0 },
      { label: 'FAQ', url: '/p/faq', order: 1 },
      { label: 'Privacy Policy', url: '/p/privacy', order: 2 },
      { label: 'Terms of Service', url: '/p/terms', order: 3 },
    ];
    menu = await Menu.create({ name: `${location} Menu`, location, items: defaultItems, isActive: true });
  }
  return menu;
}

async function updateMenu(location, items) {
  let menu = await Menu.findOne({ location });
  if (!menu) {
    menu = new Menu({ name: `${location} Menu`, location });
  }
  menu.items = items;
  await menu.save();
  return menu;
}

module.exports = {
  getActiveSections,
  listAllSections,
  createSection,
  updateSection,
  deleteSection,
  listPages,
  getPageBySlug,
  createPage,
  updatePage,
  deletePage,
  getMenu,
  updateMenu,
};
