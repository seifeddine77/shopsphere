const mongoose = require('mongoose');
const { uniqueSlug } = require('../utils/slugify');

const round2 = (value) => (value == null ? value : Math.round(value * 100) / 100);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    slug: { type: String, unique: true, lowercase: true, index: true },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      trim: true,
      maxlength: 5000,
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
      max: 10000000,
      set: round2,
    },
    // Discounted price - always lower than `price` (enforced below)
    discountPrice: {
      type: Number,
      min: [0, 'Discount price cannot be negative'],
      max: 10000000,
      default: null,
      set: round2,
    },
    // price actually charged - maintained automatically, used for
    // filtering and sorting so discounts are consistently handled
    effectivePrice: { type: Number, index: true },

    images: {
      type: [String],
      default: [],
      validate: {
        validator: (images) => images.length <= 20,
        message: 'A product cannot have more than 20 images',
      },
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
      index: true,
    },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      required: [true, 'Brand is required'],
      index: true,
    },

    stock: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Stock cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Stock must be a whole number',
      },
    },
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 50,
    },

    specifications: { type: Map, of: String, default: {} },

    // Denormalized review aggregates (recomputed by the Review service)
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },

    isFeatured: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
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

/* ------------------------------- Hooks ---------------------------------- */

productSchema.pre('validate', function computePricing(next) {
  if (this.discountPrice != null && this.price != null && this.discountPrice >= this.price) {
    return next(new Error('Discount price must be lower than the regular price'));
  }
  this.effectivePrice = this.discountPrice != null ? this.discountPrice : this.price;
  return next();
});

productSchema.pre('validate', async function ensureSlug(next) {
  try {
    if (!this.slug || this.isModified('name')) {
      this.slug = await uniqueSlug(this.constructor, this.name, this);
    }
    return next();
  } catch (error) {
    return next(error);
  }
});

/* ------------------------------ Indexes ---------------------------------- */
/* Text search across name + description (name weighted higher).            */
/* Compound indexes back the catalog's filter+sort combinations.            */

productSchema.index({ name: 'text', description: 'text' }, { weights: { name: 3, description: 1 } });
productSchema.index({ category: 1, effectivePrice: 1 });
productSchema.index({ brand: 1, effectivePrice: 1 });
productSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
