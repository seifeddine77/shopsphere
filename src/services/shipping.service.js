const settingsService = require('./settings.service');

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * Shipping rules: flat rate, free above a threshold.
 * Values come from the admin Settings (DB), falling back to env defaults.
 * The threshold is evaluated on the post-discount amount.
 */
async function calculateShipping(amountAfterDiscount) {
  const { shippingFlatRate, shippingFreeThreshold } = await settingsService.getSettings();
  if (amountAfterDiscount >= shippingFreeThreshold) return 0;
  return round2(shippingFlatRate);
}

module.exports = { calculateShipping };
