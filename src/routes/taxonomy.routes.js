const router = require('express').Router();

const taxonomyController = require('../controllers/taxonomy.controller');
const { protect } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/admin.middleware');
const {
  categoryCreateSchema,
  categoryUpdateSchema,
  brandCreateSchema,
  brandUpdateSchema,
} = require('../validators/product.validator');
const { validate } = require('../middlewares/validation.middleware');

/* --------------------------- Categories ---------------------------------- */

router.get('/categories', taxonomyController.listCategories);
router.get('/categories/:identifier', taxonomyController.getCategory);

router.post('/categories', protect, adminOnly, validate(categoryCreateSchema), taxonomyController.createCategory);
router.put('/categories/:id', protect, adminOnly, validate(categoryUpdateSchema), taxonomyController.updateCategory);
router.delete('/categories/:id', protect, adminOnly, taxonomyController.deleteCategory);

/* ------------------------------ Brands ------------------------------------ */

router.get('/brands', taxonomyController.listBrands);
router.get('/brands/:identifier', taxonomyController.getBrand);

router.post('/brands', protect, adminOnly, validate(brandCreateSchema), taxonomyController.createBrand);
router.put('/brands/:id', protect, adminOnly, validate(brandUpdateSchema), taxonomyController.updateBrand);
router.delete('/brands/:id', protect, adminOnly, taxonomyController.deleteBrand);

module.exports = router;
