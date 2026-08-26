const mongoose = require('mongoose');

/**
 * Payment record - one per order.
 *
 * SECURITY: no card data is ever stored here. The gateway returns only
 * a transaction reference and a status; card fields never touch the DB.
 */
const paymentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,
      index: true,
    },
    method: { type: String, enum: ['COD', 'CARD'], required: true },
    provider: { type: String, default: 'internal' }, // cod | fake-card | stripe...
    status: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    transactionId: { type: String, default: '' },
    message: { type: String, default: '' },
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

module.exports = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
