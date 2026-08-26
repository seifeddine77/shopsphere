const mongoose = require('mongoose');
const { uniqueSlug } = require('../utils/slugify');

const attributeOptionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
    colorCode: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const attributeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Attribute name is required'],
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    slug: { type: String, unique: true, lowercase: true, index: true },
    label: { type: String, trim: true, maxlength: 100, default: '' },
    type: {
      type: String,
      enum: ['TEXT', 'NUMBER', 'SELECT', 'COLOR', 'RADIO', 'CHECKBOX'],
      default: 'SELECT',
    },
    options: { type: [attributeOptionSchema], default: [] },
    categories: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      index: true,
    }],
    isFilterable: { type: Boolean, default: true, index: true },
    isVariant: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 },
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

attributeSchema.pre('validate', async function ensureSlug(next) {
  try {
    if (!this.slug || this.isModified('name')) {
      this.slug = await uniqueSlug(this.constructor, this.name, this);
    }
    if (!this.label) {
      this.label = this.name;
    }
    return next();
  } catch (error) {
    return next(error);
  }
});

module.exports = mongoose.models.Attribute || mongoose.model('Attribute', attributeSchema);

