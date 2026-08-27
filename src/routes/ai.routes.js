const router = require('express').Router();
const aiController = require('../controllers/ai.controller');
const { protect } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/admin.middleware');

// Public AI endpoints
router.post('/chat', aiController.chat);
router.get('/reviews/:slug', aiController.reviewSummary);

// Admin-only AI copy generation & executive copilot
router.post('/generate-product', protect, adminOnly, aiController.generateProduct);
router.post('/admin-copilot', protect, adminOnly, aiController.adminCopilot);

module.exports = router;

