const router = require('express').Router();

const reviewController = require('../controllers/review.controller');
const { protect } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation.middleware');
const { updateReviewSchema } = require('../validators/review.validator');

// Mounted at /api root. Product-scoped routes live in product.routes.js.

router.put('/reviews/:id', protect, validate(updateReviewSchema), reviewController.update);
router.delete('/reviews/:id', protect, reviewController.remove);

module.exports = router;
