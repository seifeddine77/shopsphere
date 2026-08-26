const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { notFound, conflict } = require('../utils/errors');

/**
 * Lists categories. Public requests see active ones only;
 * admins may request inactive categories as well.
 */
async function listCategories({ includeInactive = false } = {}) {
  const filter = includeInactive ? {} : { isActive: true };
  return Category.find(filter).sort({ name: 1 });
}

async function getCategory(idOrSlug) {
  const query = mongoose.isValidObjectId(idOrSlug)
    ? { _id: idOrSlug }
    : { slug: String(idOrSlug).toLowerCase() };

  const category = await Category.findOne(query);
  if (!category) throw notFound('Category not found');
  return category;
}

async function createCategory(data) {
  return Category.create(data);
}

async function updateCategory(id, data) {
  const category = await Category.findById(id);
  if (!category) throw notFound('Category not found');

  Object.assign(category, data);
  await category.save(); // re-runs slug hook when the name changed
  return category;
}

/** Categories with products cannot be deleted - prevents orphaned products */
async function deleteCategory(id) {
  const category = await Category.findById(id);
  if (!category) throw notFound('Category not found');

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
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
};
