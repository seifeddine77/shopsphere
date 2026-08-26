const mongoose = require('mongoose');

/**
 * Shopping cart - one document per user.
 *
 * `price` is an informational snapshot taken when the item was added;
 * ALL totals are recomputed from live product data at read time
 * (see cart.service) so stale prices can never be charged.
 */
const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 99,
    },
    price: { type: Number, min: 0, default: null }, // snapshot
  },
  { _id: false },
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    items: { type: [cartItemSchema], default: [] },
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

module.exports = mongoose.models.Cart || mongoose.model('Cart', cartSchema);
