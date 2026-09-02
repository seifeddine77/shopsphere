const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { notFound, conflict } = require('../utils/errors');

/**
 * Lists categories. Public requests see active ones only;
 * admins may request inactive categories as well.
 */
async function listCategories({ includeInactive = false, parent = undefined } = {}) {
  const filter = includeInactive ? {} : { isActive: true };
  if (parent !== undefined) {
    filter.parent = parent === null || parent === 'null' ? null : parent;
  }
  return Category.find(filter).populate('parent', 'name slug').sort({ order: 1, name: 1 });
}

/**
 * Returns a full hierarchical category tree with nested children.
 */
async function getCategoryTree({ includeInactive = false } = {}) {
  const allCategories = await listCategories({ includeInactive });
  const categoryMap = new Map();

  allCategories.forEach((cat) => {
    categoryMap.set(String(cat._id), { ...cat.toJSON(), children: [] });
  });

  const rootCategories = [];

  allCategories.forEach((cat) => {
    const node = categoryMap.get(String(cat._id));
    if (cat.parent) {
      const parentId = typeof cat.parent === 'object' && cat.parent._id ? String(cat.parent._id) : String(cat.parent);
      const parentNode = categoryMap.get(parentId);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        rootCategories.push(node);
      }
    } else {
      rootCategories.push(node);
    }
  });

  return rootCategories;
}

async function getCategoryAncestors(idOrSlug) {
  const ancestors = [];
  let current = await getCategory(idOrSlug);
  while (current && current.parent) {
    const parentId = typeof current.parent === 'object' && current.parent._id ? current.parent._id : current.parent;
    current = await Category.findById(parentId);
    if (current) ancestors.unshift(current);
  }
  return ancestors;
}

async function getCategory(idOrSlug) {
  const query = mongoose.isValidObjectId(idOrSlug)
    ? { _id: idOrSlug }
    : { slug: String(idOrSlug).toLowerCase() };

  const category = await Category.findOne(query).populate('parent', 'name slug').populate('attributes');
  if (!category) throw notFound('Category not found');
  return category;
}

async function createCategory(data) {
  let level = 0;
  if (data.parent && mongoose.isValidObjectId(data.parent)) {
    const parentCategory = await Category.findById(data.parent);
    if (parentCategory) {
      level = (parentCategory.level || 0) + 1;
    } else {
      data.parent = null;
    }
  } else {
    data.parent = null;
  }
  return Category.create({ ...data, level });
}

async function updateCategory(id, data) {
  const category = await Category.findById(id);
  if (!category) throw notFound('Category not found');

  if (data.parent) {
    if (String(data.parent) === String(id)) {
      throw conflict('A category cannot be its own parent');
    }
    const parentCategory = await Category.findById(data.parent);
    if (parentCategory) {
      category.level = (parentCategory.level || 0) + 1;
    }
  } else if (data.parent === null || data.parent === '') {
    category.parent = null;
    category.level = 0;
  }

  Object.assign(category, data);
  await category.save(); // re-runs slug hook when the name changed
  return category;
}

/** Categories with products cannot be deleted - prevents orphaned products */
async function deleteCategory(id) {
  const category = await Category.findById(id);
  if (!category) throw notFound('Category not found');

  const childCount = await Category.countDocuments({ parent: id });
  if (childCount > 0) {
    throw conflict(`Cannot delete this category: ${childCount} subcategory/subcategories belong to it`);
  }

  const productCount = await Product.countDocuments({ category: id });
  if (productCount > 0) {
    throw conflict(
      `Cannot delete this category: ${productCount} product(s) still reference it`,
    );
  }

  await category.deleteOne();
  return category;
}

module.exports = {
  listCategories,
  getCategoryTree,
  getCategoryAncestors,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
};
