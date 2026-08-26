const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9]{3,20}$/, 'Code must be 3-20 letters/digits'],
    },
    discountType: {
      type: String,
      enum: ['PERCENTAGE', 'FIXED'],
      required: true,
    },
    // PERCENTAGE: 0-100 | FIXED: amount in currency
    discountValue: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator(value) {
          return this.discountType !== 'PERCENTAGE' || value <= 100;
        },
        message: 'Percentage discount cannot exceed 100',
      },
    },
    minimumAmount: { type: Number, min: 0, default: 0 },   // cart floor to qualify
    maximumDiscount: { type: Number, min: 0, default: null }, // cap (percentage only)
    expirationDate: { type: Date, default: null },
    usageLimit: { type: Number, min: 0, default: 0 },       // 0 = unlimited
    usedCount: { type: Number, min: 0, default: 0 },
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

couponSchema.index({ isActive: 1, expirationDate: 1 });

module.exports = mongoose.models.Coupon || mongoose.model('Coupon', couponSchema);
