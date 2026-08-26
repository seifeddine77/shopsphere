const Coupon = require('../models/Coupon');
const { notFound, unprocessable } = require('../utils/errors');

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * Validates a coupon against a subtotal WITHOUT consuming it.
 * Throws descriptive AppErrors; returns the computed discount otherwise.
 */
async function validateCoupon(rawCode, subtotal) {
  const code = String(rawCode || '').trim().toUpperCase();

  const coupon = await Coupon.findOne({ code });
  if (!coupon || !coupon.isActive) throw notFound('Invalid coupon code');

  if (coupon.expirationDate && coupon.expirationDate < new Date()) {
    throw unprocessable('This coupon has expired');
  }

  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    throw unprocessable('This coupon has reached its usage limit');
  }

  if (subtotal < coupon.minimumAmount) {
    throw unprocessable(
      `This coupon requires a minimum order of $${coupon.minimumAmount.toFixed(2)}`,
      [{ field: 'code', message: `Minimum order: $${coupon.minimumAmount.toFixed(2)}` }],
    );
  }

  let discount = coupon.discountType === 'PERCENTAGE'
    ? (subtotal * coupon.discountValue) / 100
    : coupon.discountValue;

  if (coupon.maximumDiscount != null) {
    discount = Math.min(discount, coupon.maximumDiscount);
  }
  discount = Math.min(round2(discount), round2(subtotal)); // never exceed the subtotal

  return {
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountAmount: discount,
  };
}

/**
 * Atomically consumes one usage. The usage-limit check lives inside the
 * update filter, so two concurrent orders can never over-consume a coupon.
 * Returns null when the coupon vanished or the limit was hit in the race.
 */
async function consumeCoupon(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  return Coupon.findOneAndUpdate(
    {
      code,
      isActive: true,
      $or: [
        { usageLimit: 0 },
        { usageLimit: null },
        { $expr: { $lt: ['$usedCount', '$usageLimit'] } },
      ],
    },
    { $inc: { usedCount: 1 } },
    { new: true },
  );
}

/** Compensating action when an order fails after consumption */
async function releaseCoupon(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  await Coupon.updateOne(
    { code, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1 } },
  );
}

/* --------------------------- Admin management ---------------------------- */

async function listCoupons({ includeInactive = false } = {}) {
  return Coupon.find(includeInactive ? {} : { isActive: true }).sort({ createdAt: -1 });
}

async function createCoupon(data) {
  const exists = await Coupon.findOne({ code: data.code });
  if (exists) throw unprocessable(`Coupon "${data.code}" already exists`, [
    { field: 'code', message: 'Already in use' },
  ]);
  return Coupon.create(data);
}

async function deleteCoupon(id) {
  const coupon = await Coupon.findByIdAndDelete(id);
  if (!coupon) throw notFound('Coupon not found');
  return coupon;
}

module.exports = {
  validateCoupon,
  consumeCoupon,
  releaseCoupon,
  listCoupons,
  createCoupon,
  deleteCoupon,
};
