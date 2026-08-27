const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, default: '' },
    subtitle: { type: String, trim: true, default: '' },
    type: {
      type: String,
      enum: [
        'HERO',
        'BANNER',
        'FLASH_SALE',
        'PRODUCT_GRID',
        'PRODUCT_CAROUSEL',
        'CATEGORY_GRID',
        'BRANDS',
        'TESTIMONIALS',
        'FAQ',
        'NEWSLETTER',
        'CUSTOM_HTML',
      ],
      required: true,
    },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    config: {
      buttonText: { type: String, default: '' },
      buttonLink: { type: String, default: '' },
      image: { type: String, default: '' },
      badge: { type: String, default: '' },
      discountText: { type: String, default: '' },
      limit: { type: Number, default: 4 },
      filterCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
      customHtml: { type: String, default: '' },
      items: { type: Array, default: [] },
    },
  },
  { timestamps: true },
);

sectionSchema.index({ order: 1, isActive: 1 });

module.exports = mongoose.models.Section || mongoose.model('Section', sectionSchema);
