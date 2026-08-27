const mongoose = require('mongoose');
const { uniqueSlug } = require('../utils/slugify');

const pageSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Page title is required'], trim: true, maxlength: 150 },
    slug: { type: String, unique: true, lowercase: true, index: true },
    content: { type: String, required: [true, 'Page content is required'] },
    summary: { type: String, trim: true, maxlength: 300, default: '' },
    seoTitle: { type: String, trim: true, maxlength: 150, default: '' },
    seoDescription: { type: String, trim: true, maxlength: 300, default: '' },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

pageSchema.pre('validate', async function ensureSlug(next) {
  try {
    if (!this.slug || this.isModified('title')) {
      this.slug = await uniqueSlug(this.constructor, this.title, this);
    }
    return next();
  } catch (error) {
    return next(error);
  }
});

module.exports = mongoose.models.Page || mongoose.model('Page', pageSchema);
