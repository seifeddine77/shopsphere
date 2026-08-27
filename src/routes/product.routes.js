const router = require('express').Router();

const productController = require('../controllers/product.controller');
const reviewController = require('../controllers/review.controller');
const { protect } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/admin.middleware');
const {
  productCreateSchema,
  productUpdateSchema,
} = require('../validators/product.validator');
const { createReviewSchema } = require('../validators/review.validator');
const { validate } = require('../middlewares/validation.middleware');

/* ------------------------------- Public ---------------------------------- */

router.get('/', productController.list);
router.get('/suggest', productController.suggest);
router.get('/compare', productController.compare);

// Reviews are scoped to a product (identifier = id or slug)
router.get('/:identifier/reviews', reviewController.listForProduct);
router.post('/:identifier/reviews', protect, validate(createReviewSchema), reviewController.create);

// slug or id - must come after the more specific routes above
router.post('/:id/stock-alert', productController.stockAlert);
router.get('/:identifier', productController.details);

/* ------------------------------- Admin ----------------------------------- */

router.use(protect, adminOnly);
router.post('/', validate(productCreateSchema), productController.create);
router.put('/:id', validate(productUpdateSchema), productController.update);
router.delete('/:id', productController.remove);

module.exports = router;
