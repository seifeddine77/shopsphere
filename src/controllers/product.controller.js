const productService = require('../services/product.service');
const { sendSuccess } = require('../utils/response');

/**
 * GET /api/products - paginated catalog with filters/sort/search
 */
async function list(req, res, next) {
  try {
    const includeInactive = req.user?.role === 'ADMIN' && req.query.includeInactive === 'true';
    const { products, pagination } = await productService.listProducts(req.query, { includeInactive });
    return sendSuccess(res, { data: { products }, message: 'Products retrieved', pagination });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/products/suggest?q=term - navbar autocomplete
 */
async function suggest(req, res, next) {
  try {
    const suggestions = await productService.getSuggestions(req.query.q);
    return sendSuccess(res, { data: { suggestions }, message: 'Suggestions' });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/products/:identifier - by slug or id (detail page)
 */
async function details(req, res, next) {
  try {
    const includeInactive = req.user?.role === 'ADMIN';
    const product = await productService.getProduct(req.params.identifier, { includeInactive });
    const related = await productService.getRelatedProducts(product);

    // Related products reuse the lightweight card shape
    const relatedCards = related.map(({ description: _description, specifications: _specifications, ...card }) => card);

    return sendSuccess(res, {
      data: { product: product.toJSON(), relatedProducts: relatedCards },
      message: 'Product retrieved',
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/products [admin]
 */
async function create(req, res, next) {
  try {
    const product = await productService.createProduct(req.body);
    return sendSuccess(res, { status: 201, data: { product }, message: 'Product created' });
  } catch (error) {
    return next(error);
  }
}

/**
 * PUT /api/products/:id [admin]
 */
async function update(req, res, next) {
  try {
    const product = await productService.updateProduct(req.params.id, req.body);
    return sendSuccess(res, { data: { product }, message: 'Product updated' });
  } catch (error) {
    return next(error);
  }
}

/**
 * DELETE /api/products/:id [admin]
 */
async function remove(req, res, next) {
  try {
    await productService.deleteProduct(req.params.id);
    return sendSuccess(res, { message: 'Product deleted' });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/products/compare?ids=id1,id2
 */
async function compare(req, res, next) {
  try {
    const rawIds = req.query.ids ? String(req.query.ids).split(',').map((s) => s.trim()).filter(Boolean) : [];
    const comparison = await productService.compareProducts(rawIds);
    return sendSuccess(res, { data: comparison, message: 'Products comparison' });
  } catch (error) {
    return next(error);
  }
}

module.exports = { list, suggest, details, create, update, remove, compare };
