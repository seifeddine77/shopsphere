const mongoose = require('mongoose');

/**
 * Website settings - a single document (keyed singleton).
 * Values set here override the environment defaults and are
 * consumed by the shipping, dashboard and inventory modules.
 */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'store' },
    shippingFlatRate: { type: Number, min: 0, default: null },   // null = use env default
    shippingFreeThreshold: { type: Number, min: 0, default: null },
    lowStockThreshold: { type: Number, min: 0, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        delete ret._id;
        delete ret.key;
        return ret;
      },
    },
  },
);

module.exports = mongoose.models.Setting || mongoose.model('Setting', settingSchema);
