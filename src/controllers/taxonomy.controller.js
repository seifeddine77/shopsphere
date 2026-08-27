const categoryService = require('../services/category.service');
const brandService = require('../services/brand.service');
const { sendSuccess } = require('../utils/response');

/* ------------------------------ Categories -------------------------------- */

async function listCategories(req, res, next) {
  try {
    const includeInactive = req.user?.role === 'ADMIN' && req.query.includeInactive === 'true';
    const categories = await categoryService.listCategories({ includeInactive, parent: req.query.parent });
    return sendSuccess(res, { data: { categories }, message: 'Categories retrieved' });
  } catch (error) {
    return next(error);
  }
}

async function getCategoryTree(req, res, next) {
  try {
    const includeInactive = req.user?.role === 'ADMIN' && req.query.includeInactive === 'true';
    const tree = await categoryService.getCategoryTree({ includeInactive });
    return sendSuccess(res, { data: { tree }, message: 'Category tree retrieved' });
  } catch (error) {
    return next(error);
  }
}

async function getCategory(req, res, next) {
  try {
    const category = await categoryService.getCategory(req.params.identifier);
    return sendSuccess(res, { data: { category }, message: 'Category retrieved' });
  } catch (error) {
    return next(error);
  }
}

async function createCategory(req, res, next) {
  try {
    const category = await categoryService.createCategory(req.body);
    return sendSuccess(res, { status: 201, data: { category }, message: 'Category created' });
  } catch (error) {
    return next(error);
  }
}

async function updateCategory(req, res, next) {
  try {
    const category = await categoryService.updateCategory(req.params.id, req.body);
    return sendSuccess(res, { data: { category }, message: 'Category updated' });
  } catch (error) {
    return next(error);
  }
}

async function deleteCategory(req, res, next) {
  try {
    await categoryService.deleteCategory(req.params.id);
    return sendSuccess(res, { message: 'Category deleted' });
  } catch (error) {
    return next(error);
  }
}

/* -------------------------------- Brands ---------------------------------- */

async function listBrands(req, res, next) {
  try {
    const includeInactive = req.user?.role === 'ADMIN' && req.query.includeInactive === 'true';
    const brands = await brandService.listBrands({ includeInactive });
    return sendSuccess(res, { data: { brands }, message: 'Brands retrieved' });
  } catch (error) {
    return next(error);
  }
}

async function getBrand(req, res, next) {
  try {
    const brand = await brandService.getBrand(req.params.identifier);
    return sendSuccess(res, { data: { brand }, message: 'Brand retrieved' });
  } catch (error) {
    return next(error);
  }
}

async function createBrand(req, res, next) {
  try {
    const brand = await brandService.createBrand(req.body);
    return sendSuccess(res, { status: 201, data: { brand }, message: 'Brand created' });
  } catch (error) {
    return next(error);
  }
}

async function updateBrand(req, res, next) {
  try {
    const brand = await brandService.updateBrand(req.params.id, req.body);
    return sendSuccess(res, { data: { brand }, message: 'Brand updated' });
  } catch (error) {
    return next(error);
  }
}

async function deleteBrand(req, res, next) {
  try {
    await brandService.deleteBrand(req.params.id);
    return sendSuccess(res, { message: 'Brand deleted' });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listCategories,
  getCategoryTree,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  listBrands,
  getBrand,
  createBrand,
  updateBrand,
  deleteBrand,
};
