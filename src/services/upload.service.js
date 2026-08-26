const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const ALLOWED_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Image upload pipeline (memory storage - we rename + persist ourselves).
 * Validation: mimetype whitelist AND extension whitelist, 2 MB cap.
 */
function imageUpload(field = 'image') {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_SIZE_BYTES, files: 1 },
    fileFilter: (_req, file, callback) => {
      const extOk = ['.jpg', '.jpeg', '.png', '.webp']
        .includes(path.extname(file.originalname).toLowerCase());
      const mimeOk = Boolean(ALLOWED_MIME[file.mimetype]);

      if (!mimeOk || !extOk) {
        return callback(new Error('INVALID_TYPE'));
      }
      return callback(null, true);
    },
  }).single(field);
}

/** Persists an uploaded buffer under /public/uploads/products */
function persistUpload(file) {
  const ext = ALLOWED_MIME[file.mimetype] || path.extname(file.originalname).toLowerCase();
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const fs = require('fs');
  const dir = path.join(__dirname, '../public/uploads/products');

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), file.buffer);

  return { url: `/uploads/products/${filename}`, filename };
}

module.exports = { imageUpload, persistUpload, MAX_SIZE_BYTES };
