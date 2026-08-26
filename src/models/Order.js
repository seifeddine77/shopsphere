const mongoose = require('mongoose');

/**
 * Order statuses and their legal transitions.
 * PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED
 *    \-> CANCELLED (only before SHIPPED)
 */
const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];
const PAYMENT_METHODS = ['COD', 'CARD'];

/** Line items are immutable snapshots - orders survive product changes */
const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    image: { type: String, default: '' },
    sku: { type: String, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    street: { type: String, required: true, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, trim: true, maxlength: 80, default: '' },
    postalCode: { type: String, required: true, trim: true, maxlength: 20 },
    country: { type: String, required: true, trim: true, maxlength: 80 },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },

    shippingAddress: { type: shippingAddressSchema, required: true },

    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'PENDING' },
    orderStatus: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'PENDING',
      index: true,
    },
    statusHistory: [{
      _id: false,
      status: { type: String, enum: ORDER_STATUSES },
      at: { type: Date, default: Date.now },
      note: { type: String, default: '' },
    }],

    subtotal: { type: Number, required: true, min: 0 },
    shippingCost: { type: Number, required: true, min: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },

    coupon: {
      _id: false,
      code: { type: String, default: null },
      discountAmount: { type: Number, default: 0 },
    },

    trackingNumber: { type: String, default: '' },

    // Stripe PaymentIntent id when the stripe gateway processed the order
    paymentIntentId: { type: String, default: null, index: true },
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

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });

module.exports = {
  Order: mongoose.models.Order || mongoose.model('Order', orderSchema),
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
};
