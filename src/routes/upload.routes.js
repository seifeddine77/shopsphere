const express = require('express');

const { handleImageUpload } = require('../controllers/upload.controller');
const { protect } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/admin.middleware');
const { sendSuccess } = require('../utils/response');

const router = express.Router();

/**
 * POST /api/uploads/image [admin]
 * multipart/form-data with an `image` field.
 * Returns the public URL of the stored file.
 */
router.post('/uploads/image', protect, adminOnly, handleImageUpload, (req, res) => {
  return sendSuccess(res, {
    status: 201,
    data: { url: res.locals.uploaded.url },
    message: 'Image uploaded',
  });
});

module.exports = router;
