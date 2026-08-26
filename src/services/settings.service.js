const Setting = require('../models/Setting');
const config = require('../config/environment');

let cache = null;

function defaults() {
  return {
    shippingFlatRate: config.shipping.flatRate,
    shippingFreeThreshold: config.shipping.freeThreshold,
    lowStockThreshold: 5,
  };
}

/**
 * Returns the effective settings: database values overlaid on env defaults.
 * Cached in memory; call invalidate() after an update.
 */
async function getSettings() {
  if (cache) return cache;

  const doc = await Setting.findOne({ key: 'store' }).lean();
  const base = defaults();
  cache = doc
    ? {
        shippingFlatRate: doc.shippingFlatRate ?? base.shippingFlatRate,
        shippingFreeThreshold: doc.shippingFreeThreshold ?? base.shippingFreeThreshold,
        lowStockThreshold: doc.lowStockThreshold ?? base.lowStockThreshold,
      }
    : base;

  return cache;
}

async function updateSettings(patch) {
  const clean = {};
  for (const key of ['shippingFlatRate', 'shippingFreeThreshold', 'lowStockThreshold']) {
    if (patch[key] !== undefined && patch[key] !== null && patch[key] !== '') {
      clean[key] = Math.max(Number(patch[key]) || 0, 0);
    } else {
      clean[key] = null; // explicit reset to env default / built-in
    }
  }

  await Setting.updateOne(
    { key: 'store' },
    { $set: clean },
    { upsert: true },
  );

  cache = null; // invalidate
  return getSettings();
}

function invalidate() {
  cache = null;
}

module.exports = { getSettings, updateSettings, invalidate };
