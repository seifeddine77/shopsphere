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

  // Keyword search with tokenized partial and full-string matching
  if (query.q && String(query.q).trim()) {
    const rawQ = String(query.q).trim().slice(0, 120);
    const escapedQ = escapeRegExp(rawQ);
    const tokens = rawQ.split(/\s+/).filter(Boolean).map(escapeRegExp);
    const regexPattern = tokens.join('|') || escapedQ;

    filter.$or = [
      { name: { $regex: regexPattern, $options: 'i' } },
      { description: { $regex: regexPattern, $options: 'i' } },
      { sku: { $regex: regexPattern, $options: 'i' } },
    ];
  }

  if (query.category) {
    const rawCats = Array.isArray(query.category)
      ? query.category
      : String(query.category).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const categories = await Category.find({ slug: { $in: rawCats } }).select('_id');
    if (categories.length === 0) return { _id: { $exists: false } };
    filter.category = categories.length === 1 ? categories[0]._id : { $in: categories.map((c) => c._id) };
  }

  if (query.brand) {
    const rawBrands = Array.isArray(query.brand)
      ? query.brand
      : String(query.brand).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const brands = await Brand.find({ slug: { $in: rawBrands } }).select('_id');
    if (brands.length === 0) return { _id: { $exists: false } };
    filter.brand = brands.length === 1 ? brands[0]._id : { $in: brands.map((b) => b._id) };
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

  // Dynamic attribute filtering (supports ?attr_color=Red or ?color=Red or ?attr_ram=16GB)
  const ignoredKeys = new Set([
    'q', 'category', 'brand', 'minPrice', 'maxPrice', 'minRating',
    'inStock', 'isFeatured', 'sort', 'page', 'limit', 'includeInactive',
  ]);

  const dynamicConditions = [];
  for (const [key, rawVal] of Object.entries(query)) {
    if (!ignoredKeys.has(key) && rawVal) {
      const attrName = key.startsWith('attr_') ? key.replace('attr_', '') : key;
      const valStr = String(rawVal).trim();
      const escaped = escapeRegExp(valStr);
      dynamicConditions.push({
        $or: [
          { [`specifications.${attrName}`]: new RegExp(`^${escaped}$`, 'i') },
          { [`variants.attributes.${attrName}`]: new RegExp(`^${escaped}$`, 'i') },
          { 'attributes.name': new RegExp(`^${escapeRegExp(attrName)}$`, 'i'), 'attributes.values': new RegExp(`^${escaped}$`, 'i') },
        ],
      });
    }
  }

  if (dynamicConditions.length > 0) {
    filter.$and = filter.$and || [];
    filter.$and.push(...dynamicConditions);
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

  const products = await Product.find({
    isActive: true,
    $or: [
      { name: { $regex: term, $options: 'i' } },
      { description: { $regex: term, $options: 'i' } },
    ],
  })
    .limit(limit)
    .select('name slug price discountPrice effectivePrice images rating')
    .lean();

  return products.map((p) => ({
    _id: p._id,
    name: p.name,
    slug: p.slug,
    price: p.price,
    effectivePrice: p.discountPrice != null ? p.discountPrice : p.price,
    image: (p.images && p.images[0]) || '/images/placeholder.svg',
    rating: p.rating,
  }));
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

/** Compares up to 4 products by id or slug, assembling specifications & attributes */
async function compareProducts(identifiers = []) {
  if (!Array.isArray(identifiers) || identifiers.length === 0) {
    return { products: [], specKeys: [], attributeKeys: [] };
  }

  const ids = identifiers.slice(0, 4);
  const products = await Promise.all(
    ids.map(async (id) => {
      try {
        return await getProduct(id);
      } catch (_e) {
        return null;
      }
    }),
  );

  const validProducts = products.filter(Boolean);
  const specKeySet = new Set();
  const attributeKeySet = new Set();

  validProducts.forEach((p) => {
    if (p.specifications) {
      if (p.specifications instanceof Map) {
        p.specifications.forEach((_val, key) => specKeySet.add(key));
      } else if (typeof p.specifications === 'object') {
        Object.keys(p.specifications).forEach((key) => specKeySet.add(key));
      }
    }
    if (p.attributes && Array.isArray(p.attributes)) {
      p.attributes.forEach((attr) => attributeKeySet.add(attr.name));
    }
  });

  return {
    products: validProducts,
    specKeys: Array.from(specKeySet),
    attributeKeys: Array.from(attributeKeySet),
  };
}

async function getFrequentlyBoughtTogether(product) {
  if (!product) return null;
  const { Order } = require('../models/Order');

  // Find orders containing this product
  const orders = await Order.find({ 'items.product': product._id }).limit(20);
  const coOccurringIds = new Map();

  orders.forEach((o) => {
    (o.items || []).forEach((item) => {
      const pid = String(item.product);
      if (pid !== String(product._id)) {
        coOccurringIds.set(pid, (coOccurringIds.get(pid) || 0) + 1);
      }
    });
  });

  let complementaryProduct = null;
  if (coOccurringIds.size > 0) {
    const topId = [...coOccurringIds.entries()].sort((a, b) => b[1] - a[1])[0][0];
    complementaryProduct = await Product.findOne({ _id: topId, isActive: true, stock: { $gt: 0 } });
  }

  // Fallback to highest rated active item
  if (!complementaryProduct) {
    complementaryProduct = await Product.findOne({
      _id: { $ne: product._id },
      isActive: true,
      stock: { $gt: 0 },
    }).sort({ ratingsAverage: -1, price: 1 });
  }

  if (!complementaryProduct) return null;

  const mainPrice = product.discountPrice != null ? product.discountPrice : product.price;
  const compPrice = complementaryProduct.discountPrice != null ? complementaryProduct.discountPrice : complementaryProduct.price;
  const combinedRegular = mainPrice + compPrice;
  const bundleDiscount = 0.10; // 10% bundle discount
  const bundlePrice = combinedRegular * (1 - bundleDiscount);

  return {
    mainProduct: product,
    bundledProduct: complementaryProduct,
    combinedRegular,
    bundlePrice,
    savings: combinedRegular - bundlePrice,
  };
}

async function subscribeStockAlert(productId, email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw badRequest('Please provide a valid email address');
  }
  const product = await Product.findById(productId);
  if (!product) throw notFound('Product not found');

  const already = product.stockAlertSubscribers.some((s) => s.email === cleanEmail);
  if (!already) {
    product.stockAlertSubscribers.push({ email: cleanEmail, subscribedAt: new Date() });
    await product.save();
  }
  return { subscribed: true, email: cleanEmail };
}

async function trackView(productId) {
  await Product.findByIdAndUpdate(productId, { $inc: { viewsCount: 1 } });
}

async function getFacetCounts() {
  const [catCounts, brandCounts, priceStats] = await Promise.all([
    Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
    Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$brand', count: { $sum: 1 } } },
    ]),
    Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, min: { $min: '$effectivePrice' }, max: { $max: '$effectivePrice' } } },
    ]),
  ]);

  const categoryCounts = {};
  catCounts.forEach((c) => {
    if (c._id) categoryCounts[c._id.toString()] = c.count;
  });

  const brandCountsMap = {};
  brandCounts.forEach((b) => {
    if (b._id) brandCountsMap[b._id.toString()] = b.count;
  });

  const minPrice = priceStats[0] ? Math.floor(priceStats[0].min || 0) : 0;
  const maxPrice = priceStats[0] ? Math.ceil(priceStats[0].max || 500) : 500;

  return {
    categoryCounts,
    brandCounts: brandCountsMap,
    priceRange: { min: minPrice, max: maxPrice > minPrice ? maxPrice : 500 },
  };
}

module.exports = {
  listProducts,
  getSuggestions,
  getProduct,
  getRelatedProducts,
  getFrequentlyBoughtTogether,
  createProduct,
  updateProduct,
  deleteProduct,
  compareProducts,
  subscribeStockAlert,
  trackView,
  getFacetCounts,
  slugify,
};


