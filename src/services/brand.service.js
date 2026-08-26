const mongoose = require('mongoose');
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const { notFound, conflict } = require('../utils/errors');

async function listBrands({ includeInactive = false } = {}) {
  const filter = includeInactive ? {} : { isActive: true };
  return Brand.find(filter).sort({ name: 1 });
}

async function getBrand(idOrSlug) {
  const query = mongoose.isValidObjectId(idOrSlug)
    ? { _id: idOrSlug }
    : { slug: String(idOrSlug).toLowerCase() };

  const brand = await Brand.findOne(query);
  if (!brand) throw notFound('Brand not found');
  return brand;
}

async function createBrand(data) {
  return Brand.create(data);
}

async function updateBrand(id, data) {
  const brand = await Brand.findById(id);
  if (!brand) throw notFound('Brand not found');

  Object.assign(brand, data);
  await brand.save();
  return brand;
}

async function deleteBrand(id) {
  const brand = await Brand.findById(id);
  if (!brand) throw notFound('Brand not found');

  const productCount = await Product.countDocuments({ brand: id });
  if (productCount > 0) {
    throw conflict(`Cannot delete this brand: ${productCount} product(s) still reference it`);
  }

  await brand.deleteOne();
  return brand;
}

module.exports = {
  listBrands,
  getBrand,
  createBrand,
  updateBrand,
  deleteBrand,
};
