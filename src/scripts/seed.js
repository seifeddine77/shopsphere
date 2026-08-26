 
/**
 * Database seeder.
 *
 *   npm run seed           -> upserts demo data (safe to re-run)
 *   npm run seed -- --fresh-> wipes catalog + users first (dev only)
 *
 * Creates: admin & customer accounts, 6 categories, 6 brands,
 * 24 products and CSP-friendly local SVG placeholder images.
 */

const fs = require('fs');
const path = require('path');

const config = require('../config/environment');
const { connectDatabase, disconnectDatabase } = require('../config/database');
const User = require('../models/User');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const { slugify } = require('../utils/slugify');

const IMAGES_DIR = path.join(__dirname, '../public/images/products');

const ACCOUNTS = [
  { firstName: 'Admin', lastName: 'ShopSphere', email: 'admin@shopsphere.test', password: 'Admin123!', role: 'ADMIN' },
  { firstName: 'Amine', lastName: 'Customer', email: 'customer@shopsphere.test', password: 'Customer123!', role: 'USER' },
];

const COUPONS = [
  { code: 'SAVE10', discountType: 'PERCENTAGE', discountValue: 10, minimumAmount: 50, maximumDiscount: 50, usageLimit: 0 },
  { code: 'WELCOME5', discountType: 'FIXED', discountValue: 5, minimumAmount: 0, maximumDiscount: null, usageLimit: 0 },
  { code: 'EXPIRED20', discountType: 'PERCENTAGE', discountValue: 20, minimumAmount: 0, expirationDate: new Date('2024-01-01'), isActive: true },
];

const CATEGORIES = [
  { name: 'Electronics', description: 'Phones, laptops, audio and gadgets' },
  { name: 'Fashion', description: 'Clothing, shoes and accessories' },
  { name: 'Home & Kitchen', description: 'Furniture, appliances and decor' },
  { name: 'Sports', description: 'Fitness gear and outdoor equipment' },
  { name: 'Books', description: 'Fiction, non-fiction and comics' },
  { name: 'Beauty', description: 'Skincare, haircare and cosmetics' },
];

const BRANDS = [
  { name: 'TechNova', description: 'Smart technology for everyday life' },
  { name: 'UrbanWear', description: 'Contemporary street fashion' },
  { name: 'HomeCraft', description: 'Quality items for your home' },
  { name: 'PeakFit', description: 'Performance sportswear & gear' },
  { name: 'PagePress', description: 'Independent publishing house' },
  { name: 'GlowLab', description: 'Science-backed skincare' },
];

// [name, categoryIndex, brandIndex, price, discountPrice|null, stock, featured]
const PRODUCTS = [
  ['Wireless Noise-Cancelling Headphones', 0, 0, 199.99, 149.99, 35, true],
  ['Ultra-Slim Laptop 14" 16GB RAM', 0, 0, 999.0, null, 12, true],
  ['Smart Fitness Watch Pro', 0, 0, 249.5, 199.0, 28, false],
  ['Bluetooth Speaker Waterproof', 0, 0, 59.99, null, 64, false],
  ['4K Action Camera', 0, 3, 179.99, 159.99, 18, false],
  ['Fast Charging Power Bank 20000mAh', 0, 0, 39.99, null, 120, false],
  ['Classic Denim Jacket', 1, 1, 89.9, 69.9, 42, true],
  ['Slim Fit Chino Trousers', 1, 1, 49.5, null, 75, false],
  ['Running Shoes CloudFoam', 1, 3, 119.0, 99.0, 54, true],
  ['Leather Crossbody Bag', 1, 1, 139.99, null, 23, false],
  ['Merino Wool Sweater', 1, 1, 95.0, 76.0, 31, false],
  ['Polarized Sunglasses Aviator', 1, 1, 65.0, null, 88, false],
  ['Espresso Machine Deluxe', 2, 2, 349.0, 299.0, 15, true],
  ['Non-Stick Cookware Set (10 pcs)', 2, 2, 129.99, null, 40, false],
  ['Scandinavian Oak Coffee Table', 2, 2, 259.0, null, 8, false],
  ['Robot Vacuum Cleaner', 2, 0, 299.99, 249.99, 21, true],
  ['Memory Foam Pillow Set', 2, 2, 45.5, 36.4, 95, false],
  ['Adjustable Dumbbell Set 24kg', 3, 3, 189.0, 159.0, 26, true],
  ['Yoga Mat Premium Non-Slip', 3, 3, 34.99, null, 110, false],
  ['Cycling Helmet Aero', 3, 3, 79.9, null, 47, false],
  ['Camping Tent 4-Person Waterproof', 3, 3, 159.0, 135.0, 19, false],
  ['The Art of Clean Code (Hardcover)', 4, 4, 32.0, null, 130, false],
  ['Cookbook: Mediterranean Kitchen', 4, 4, 27.5, 22.0, 84, false],
  ['Vitamin C Brightening Serum', 5, 5, 42.0, null, 150, true],
];

/* --------------------------- SVG image generation ------------------------- */

const PALETTE = [
  ['#4f46e5', '#818cf8'], ['#0ea5e9', '#7dd3fc'], ['#10b981', '#6ee7b7'],
  ['#f59e0b', '#fcd34d'], ['#ef4444', '#fca5a5'], ['#8b5cf6', '#c4b5fd'],
  ['#ec4899', '#f9a8d4'], ['#14b8a6', '#5eead4'],
];

function generateProductSvg(name, index) {
  const [dark, light] = PALETTE[index % PALETTE.length];
  const initials = name
    .split(/\s+/)
    .filter((word) => /^[a-z0-9]/i.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${light}"/>
      <stop offset="100%" stop-color="${dark}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" rx="24" fill="url(#g)"/>
  <circle cx="480" cy="110" r="150" fill="#ffffff" opacity="0.08"/>
  <circle cx="90" cy="520" r="190" fill="#ffffff" opacity="0.07"/>
  <text x="300" y="330" font-family="Segoe UI, Arial, sans-serif" font-size="180"
        font-weight="700" fill="#ffffff" fill-opacity="0.92"
        text-anchor="middle">${initials}</text>
  <text x="300" y="420" font-family="Segoe UI, Arial, sans-serif" font-size="26"
        fill="#ffffff" fill-opacity="0.85" text-anchor="middle">ShopSphere</text>
</svg>`;
}

function writeImages(products) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  products.forEach((product, index) => {
    const file = path.join(IMAGES_DIR, `${product.sku.toLowerCase()}.svg`);
    fs.writeFileSync(file, generateProductSvg(product.name, index), 'utf8');
  });
}

/* -------------------------------- Upserts --------------------------------- */

async function upsertUsers() {
  for (const account of ACCOUNTS) {
     
    const existing = await User.findOne({ email: account.email });
    if (!existing) {
       
      await User.create(account);
      console.log(`  + user ${account.email} (${account.role})`);
    }
  }
}

async function upsertTaxonomy(Model, items, label) {
  for (const item of items) {
     
    const exists = await Model.findOne({ slug: slugify(item.name) });
    if (!exists) {
       
      await Model.create(item);
      console.log(`  + ${label} "${item.name}"`);
    }
  }
}

async function seedProducts() {
  const categories = await Category.find();
  const brands = await Brand.find();

  const documents = PRODUCTS.map(
    ([name, categoryIndex, brandIndex, price, discountPrice, stock, isFeatured], index) => ({
      name,
      description:
        `${name} - premium quality from our curated selection. ` +
        'Designed for everyday reliability with attention to detail, durable materials and a modern finish. ' +
        'Backed by our satisfaction guarantee and fast shipping.',
      price,
      discountPrice,
      stock,
      isFeatured,
      sku: `SS-${String(index + 1).padStart(3, '0')}`,
      specifications: {
        warranty: `${(index % 3) + 1} year(s)`,
        origin: 'Imported',
      },
      images: [`/images/products/ss-${String(index + 1).padStart(3, '0')}.svg`],
      category: categories[categoryIndex]._id,
      brand: brands[brandIndex]._id,
      rating: Math.round((3.4 + ((index * 7) % 16) / 10) * 10) / 10, // 3.4 .. 4.9
      reviewCount: (index * 13) % 90,
    }),
  );

  let created = 0;
   
  for (const doc of documents) {
     
    const exists = await Product.findOne({ sku: doc.sku });
    if (!exists) {
       
      await Product.create(doc);
      created += 1;
    }
  }
  writeImages(documents);
  console.log(`  + products created: ${created} (${PRODUCTS.length - created} already present)`);
}

async function upsertCoupons() {
  for (const coupon of COUPONS) {
     
    const exists = await Coupon.findOne({ code: coupon.code });
    if (!exists) {
       
      await Coupon.create(coupon);
      console.log(`  + coupon "${coupon.code}"`);
    }
  }
}

/* ---------------------------------- Main ----------------------------------- */

async function main() {
  const fresh = process.argv.includes('--fresh');

  await connectDatabase();

  if (fresh) {
    if (config.isProduction) {
      throw new Error('--fresh is not allowed in production');
    }
    await Promise.all([
      Product.deleteMany({}),
      Category.deleteMany({}),
      Brand.deleteMany({}),
      User.deleteMany({}),
    ]);
    console.log('Fresh mode: existing data wiped.');
  }

  console.log('Seeding...');
  await Promise.all([
    User.syncIndexes(),
    Category.syncIndexes(),
    Brand.syncIndexes(),
    Product.syncIndexes(),
  ]);

  await upsertUsers();
  await upsertTaxonomy(Category, CATEGORIES, 'category');
  await upsertTaxonomy(Brand, BRANDS, 'brand');
  await seedProducts();
  await upsertCoupons();

  console.log('\nDone. Demo accounts:');
  ACCOUNTS.forEach((account) => {
    console.log(`  ${account.role.padEnd(5)} ${account.email} / ${account.password}`);
  });
}

main()
  .then(async () => {
    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(`Seed failed: ${error.message}`);
    await disconnectDatabase();
    process.exit(1);
  });
