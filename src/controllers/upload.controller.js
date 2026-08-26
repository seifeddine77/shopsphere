/**
 * Upload errors arrive as raw multer errors - translate to AppErrors
 * BEFORE the JSON body parsers run (multipart requests skip them anyway).
 */
const uploadService = require('../services/upload.service');
const { badRequest, unprocessable } = require('../utils/errors');

function handleImageUpload(req, res, next) {
  const uploader = uploadService.imageUpload('image');

  uploader(req, res, (error) => {
    if (!error) {
      if (!req.file) {
        return next(badRequest('No image file received'));
      }
      const stored = uploadService.persistUpload(req.file);
      res.locals.uploaded = stored;
      return next();
    }

    if (error.message === 'INVALID_TYPE') {
      return next(unprocessable('Only JPEG, PNG or WEBP images are allowed', [
        { field: 'image', message: 'Unsupported file type' },
      ]));
    }
    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(unprocessable('Images must be 2 MB or smaller', [
        { field: 'image', message: 'File too large' },
      ]));
    }
    return next(error);
  });
}

module.exports = { handleImageUpload };
