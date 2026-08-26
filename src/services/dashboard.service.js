const User = require('../models/User');
const Product = require('../models/Product');
const { Order } = require('../models/Order');
const settingsService = require('./settings.service');

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * Revenue definition (documented business rule):
 * card orders count when PAID; COD orders count once DELIVERED.
 */
function revenueMatch() {
  return {
    orderStatus: { $ne: 'CANCELLED' },
    $or: [
      { paymentStatus: 'PAID' },
      { paymentMethod: 'COD', orderStatus: 'DELIVERED' },
    ],
  };
}

async function getCounts() {
  const [totalUsers, totalProducts, totalOrders, pendingOrders] = await Promise.all([
    User.countDocuments({ role: 'USER' }),
    Product.countDocuments(),
    Order.countDocuments(),
    Order.countDocuments({ orderStatus: 'PENDING' }),
  ]);
  return { totalUsers, totalProducts, totalOrders, pendingOrders };
}

async function getRevenue() {
  const [result] = await Order.aggregate([
    { $match: revenueMatch() },
    { $group: { _id: null, total: { $sum: '$total' } } },
  ]);
  return round2(result ? result.total : 0);
}

/** Monthly buckets for the last N months: [{label, revenue, orders}] */
async function getMonthlySeries(monthsBack = 6) {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCMonth(since.getUTCMonth() - (monthsBack - 1));

  const monthly = await Order.aggregate([
    { $match: { createdAt: { $gte: since }, ...revenueMatch() } },
    {
      $group: {
        _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
        revenue: { $sum: '$total' },
        orders: { $sum: 1 },
      },
    },
  ]);

  const byKey = new Map(monthly.map((row) => [`${row._id.y}-${row._id.m}`, row]));
  const series = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Chronological order (oldest -> newest) so chart axes read naturally
  for (let offset = 0; offset < monthsBack; offset += 1) {
    const date = new Date(since);
    date.setUTCMonth(since.getUTCMonth() + offset);
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
    const row = byKey.get(key);
    series.push({
      label: monthNames[date.getUTCMonth()],
      revenue: round2(row ? row.revenue : 0),
      orders: row ? row.orders : 0,
    });
  }
  return series;
}

/** Best sellers by units sold (uses the immutable item snapshots) */
async function getTopProducts(limit = 5) {
  return Order.aggregate([
    { $match: { orderStatus: { $ne: 'CANCELLED' } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        units: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.lineTotal' },
      },
    },
    { $sort: { units: -1 } },
    { $limit: limit },
    { $project: { _id: 0, name: 1, units: 1, revenue: { $round: ['$revenue', 2] } } },
  ]);
}

async function getSalesByCategory(limit = 5) {
  return Order.aggregate([
    { $match: { orderStatus: { $ne: 'CANCELLED' } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        units: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.lineTotal' },
      },
    },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
    {
      $lookup: {
        from: 'categories',
        localField: 'product.category',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: '$category' },
    {
      $group: {
        _id: '$category.name',
        units: { $sum: '$units' },
        revenue: { $sum: '$revenue' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
    { $project: { _id: 0, category: '$_id', units: 1, revenue: { $round: ['$revenue', 2] } } },
  ]);
}

async function getLowStockProducts(limit = 10) {
  const { lowStockThreshold } = await settingsService.getSettings();

  return Product.find({
    isActive: true,
    stock: { $lte: lowStockThreshold },
  })
    .sort({ stock: 1 })
    .limit(limit)
    .select('name sku stock');
}

/** Everything the dashboard page needs, in one call */
async function getOverview() {
  const [counts, revenue, monthlySeries, topProducts, salesByCategory, lowStock, settings] =
    await Promise.all([
      getCounts(),
      getRevenue(),
      getMonthlySeries(6),
      getTopProducts(5),
      getSalesByCategory(5),
      getLowStockProducts(10),
      settingsService.getSettings(),
    ]);

  return {
    stats: { ...counts, revenue, lowStockThreshold: settings.lowStockThreshold },
    charts: {
      monthly: monthlySeries,
      categories: salesByCategory,
      topProducts,
    },
    lowStock: lowStock.map((product) => product.toJSON()),
  };
}

module.exports = { getOverview };
