const mongoose = require('mongoose');
const { uniqueSlug } = require('../utils/slugify');

const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Brand name is required'],
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    slug: { type: String, unique: true, lowercase: true, index: true },
    logo: { type: String, default: '' },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

brandSchema.pre('validate', async function ensureSlug(next) {
  try {
    if (!this.slug || this.isModified('name')) {
      this.slug = await uniqueSlug(this.constructor, this.name, this);
    }
    return next();
  } catch (error) {
    return next(error);
  }
});

module.exports = mongoose.models.Brand || mongoose.model('Brand', brandSchema);
