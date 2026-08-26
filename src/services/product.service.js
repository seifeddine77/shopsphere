const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const { notFound, badRequest, conflict } = require('../utils/errors');
const { parsePaginationQuery, buildPagination } = require('../utils/pagination');
const { slugify } = require('../utils/slugify');

/* --------------------------- Query translation ---------------------------- */

/** Whitelisted sort options -> MongoDB sort documents */
const SORT_OPTIONS = {
  price_asc: { effectivePrice: 1 },
  price_desc: { effectivePrice: -1 },
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  best_rating: { rating: -1, reviewCount: -1 },
  popular: { reviewCount: -1, rating: -1 },
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Translates public query parameters into a Mongo filter.
 * Unknown slugs resolve to an impossible filter so the result is
 * an empty list rather than an error (friendlier for search UX).
 */
async function buildFilter(query, { includeInactive = false } = {}) {
  const filter = {};

  if (!includeInactive) {
    filter.isActive = true;
  }

  // Keyword search via the text index
  if (query.q && String(query.q).trim()) {
    filter.$text = { $search: String(query.q).trim().slice(0, 120) };
  }

  if (query.category) {
    const category = await Category.findOne({ slug: String(query.category).toLowerCase() });
    if (!category) return { _id: { $exists: false } }; // no match possible
    filter.category = category._id;
  }

  if (query.brand) {
    const brand = await Brand.findOne({ slug: String(query.brand).toLowerCase() });
    if (!brand) return { _id: { $exists: false } };
    filter.brand = brand._id;
  }

  const minPrice = Number.parseFloat(query.minPrice);
  const maxPrice = Number.parseFloat(query.maxPrice);
  if (!Number.isNaN(minPrice) || !Number.isNaN(maxPrice)) {
    filter.effectivePrice = {};
    if (!Number.isNaN(minPrice)) filter.effectivePrice.$gte = Math.max(minPrice, 0);
    if (!Number.isNaN(maxPrice)) filter.effectivePrice.$lte = Math.max(maxPrice, 0);
  }

  const minRating = Number.parseFloat(query.minRating);
  if (!Number.isNaN(minRating)) {
    filter.rating = { $gte: Math.min(Math.max(minRating, 0), 5) };
  }

  if (query.inStock === 'true') {
    filter.stock = { $gt: 0 };
  }

  if (query.isFeatured === 'true') {
    filter.isFeatured = true;
  }

  return filter;
}

/* ------------------------------- Queries ---------------------------------- */

/**
 * Paginated + filtered + sorted catalog listing.
 *
 * Supported params:
 *   q, category(slug), brand(slug), minPrice, maxPrice,
 *   minRating, inStock=true, isFeatured=true,
 *   sort=price_asc|price_desc|newest|oldest|best_rating|popular,
 *   page, limit
 */
async function listProducts(query = {}, { includeInactive = false } = {}) {
  const filter = await buildFilter(query, { includeInactive });

  let sort = SORT_OPTIONS[query.sort] || SORT_OPTIONS.newest;
  if (filter.$text && !query.sort) {
    // Relevance ordering when searching without an explicit sort
    sort = { score: { $meta: 'textScore' }, ...sort };
  }

  const { page, limit, skip } = parsePaginationQuery(query);

  const [products, totalItems] = await Promise.all([
    Product.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .select('-description -specifications') // cards do not need heavy fields
      .populate('category', 'name slug')
      .populate('brand', 'name slug'),
    Product.countDocuments(filter),
  ]);

  return { products, pagination: buildPagination(page, limit, totalItems) };
}

/** Lightweight search suggestions for the navbar autocomplete */
async function getSuggestions(rawQuery, limit = 8) {
  const term = escapeRegExp(String(rawQuery || '').trim().slice(0, 80));
  if (!term) return [];

  return Product.find({
    isActive: true,
    name: { $regex: `^${term}`, $options: 'i' },
  })
    .limit(limit)
    .select('name slug effectivePrice images rating')
    .lean();
}

/** Full product detail by slug or id, with references populated */
async function getProduct(identifier, { includeInactive = false } = {}) {
  const isObjectId = mongoose.isValidObjectId(identifier);
  const product = await Product.findOne(
    isObjectId ? { _id: identifier } : { slug: String(identifier).toLowerCase() },
  )
    .populate('category', 'name slug')
    .populate('brand', 'name slug');

  if (!product) throw notFound('Product not found');
  if (!product.isActive && !includeInactive) throw notFound('Product not found');
  return product;
}

/** Related products: same category first, same brand as a fallback filler */
async function getRelatedProducts(product, limit = 4) {
  const cardProjection = '-description -specifications';

  const sameCategory = await Product.find({
    _id: { $ne: product._id },
    category: product.category,
    isActive: true,
  })
    .sort({ rating: -1, reviewCount: -1 })
    .limit(limit)
    .select(cardProjection)
    .populate('category', 'name slug')
    .populate('brand', 'name slug');

  if (sameCategory.length >= limit) return sameCategory;

  const excludeIds = [product._id, ...sameCategory.map((item) => item._id)];
  const sameBrand = await Product.find({
    _id: { $nin: excludeIds },
    brand: product.brand,
    isActive: true,
  })
    .sort({ rating: -1 })
    .limit(limit - sameCategory.length)
    .select(cardProjection)
    .populate('category', 'name slug')
    .populate('brand', 'name slug');

  // Popular store-wide as the final fallback so slots never stay empty
  let results = [...sameCategory, ...sameBrand];
  if (results.length < limit) {
    excludeIds.push(...results.map((item) => item._id));
    const popular = await Product.find({
      _id: { $nin: excludeIds },
      isActive: true,
    })
      .sort({ reviewCount: -1, rating: -1 })
      .limit(limit - results.length)
      .select(cardProjection)
      .populate('category', 'name slug')
      .populate('brand', 'name slug');
    results = [...results, ...popular];
  }

  return results;
}

/* -------------------------------- Mutations -------------------------------- */

async function assertReferencesExist(categoryId, brandId) {
  const [category, brand] = await Promise.all([
    Category.exists({ _id: categoryId }),
    Brand.exists({ _id: brandId }),
  ]);
  if (!category) throw badRequest('Selected category does not exist');
  if (!brand) throw badRequest('Selected brand does not exist');
}

async function createProduct(data) {
  await assertReferencesExist(data.category, data.brand);

  try {
    const product = await Product.create(data);
    return product;
  } catch (error) {
    if (error.code === 11000 && /sku/i.test(error.message)) {
      throw conflict(`SKU "${data.sku}" is already used by another product`);
    }
    throw error;
  }
}

async function updateProduct(id, data) {
  const product = await Product.findById(id);
  if (!product) throw notFound('Product not found');

  if (data.category || data.brand) {
    await assertReferencesExist(data.category || product.category, data.brand || product.brand);
  }
  if (data.name && data.name !== product.name) {
    product.slug = undefined; // forces the pre-validate hook to regenerate
  }

  Object.assign(product, data);

  try {
    await product.save();
  } catch (error) {
    if (error.code === 11000 && /sku/i.test(error.message)) {
      throw conflict(`SKU "${data.sku}" is already used by another product`);
    }
    throw error;
  }

  return product.populate([
    { path: 'category', select: 'name slug' },
    { path: 'brand', select: 'name slug' },
  ]);
}

async function deleteProduct(id) {
  const product = await Product.findByIdAndDelete(id);
  if (!product) throw notFound('Product not found');
  return product;
}

module.exports = {
  listProducts,
  getSuggestions,
  getProduct,
  getRelatedProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  slugify,
};
