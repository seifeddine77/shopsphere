/**
 * Shared catalog fixtures used by catalog and storefront-page suites.
 */
const Category = require('../../src/models/Category');
const Brand = require('../../src/models/Brand');
const Product = require('../../src/models/Product');

async function seedTaxonomy() {
  const category = await Category.create({ name: 'Electronics', description: 'Gadgets' });
  const otherCategory = await Category.create({ name: 'Books', description: 'Reading' });
  const brand = await Brand.create({ name: 'TechNova' });
  const otherBrand = await Brand.create({ name: 'PagePress' });
  return { category, otherCategory, brand, otherBrand };
}

/** Four demo products - created through the model so slug/effectivePrice
 *  hooks run exactly like in production */
async function seedProducts(taxonomy) {
  const { category, otherCategory, brand, otherBrand } = taxonomy;
  const base = {
    description: 'Demo catalog fixture used by the integration suite',
    stock: 10,
  };

  return Promise.all([
    Product.create({
      ...base,
      name: 'Wireless Headphones Deluxe',
      price: 200,
      discountPrice: 150,
      stock: 10,
      isFeatured: true,
      rating: 4.5,
      reviewCount: 40,
      sku: 'CAT-001',
      category: category._id,
      brand: brand._id,
    }),
    Product.create({
      ...base,
      name: 'Budget Earbuds',
      price: 49.99,
      stock: 0,
      rating: 3.8,
      reviewCount: 12,
      sku: 'CAT-002',
      category: category._id,
      brand: brand._id,
    }),
    Product.create({
      ...base,
      name: 'Premium Speaker',
      price: 320,
      stock: 5,
      rating: 4.9,
      reviewCount: 80,
      sku: 'CAT-003',
      category: category._id,
      brand: brand._id,
    }),
    Product.create({
      ...base,
      name: 'Clean Code Guide',
      price: 35,
      stock: 100,
      rating: 4.1,
      reviewCount: 25,
      sku: 'CAT-004',
      category: otherCategory._id,
      brand: otherBrand._id,
    }),
  ]);
}

module.exports = { seedTaxonomy, seedProducts };
