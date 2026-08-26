const express = require('express');

const newsletterController = require('../controllers/newsletter.controller');
const { validate } = require('../middlewares/validation.middleware');
const { subscribeSchema } = require('../validators/user.validator');

const router = express.Router();

// Public: the footer/home forms post here (CSRF origin-guard applies globally)
router.post('/newsletter', validate(subscribeSchema), newsletterController.subscribe);

module.exports = router;
