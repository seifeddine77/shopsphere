const orderService = require('../services/order.service');
const dashboardService = require('../services/dashboard.service');
const couponService = require('../services/coupon.service');
const userService = require('../services/user.service');
const { sendSuccess } = require('../utils/response');

/**
 * GET /api/admin/dashboard - real analytics (KPIs + chart series)
 */
async function dashboard(_req, res, next) {
  try {
    const overview = await dashboardService.getOverview();
    return sendSuccess(res, {
      message: 'Dashboard statistics',
      data: overview,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/admin/users?q=&page=&limit=
 */
async function listUsers(req, res, next) {
  try {
    const { users, pagination } = await userService.listUsers(req.query);
    return sendSuccess(res, {
      data: { users: users.map((user) => user.toJSON()) },
      message: 'Users retrieved',
      pagination,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PUT /api/admin/users/:id/status
 */
async function setUserStatus(req, res, next) {
  try {
    const user = await userService.setStatus(req.user._id, req.params.id, req.body.isActive);
    return sendSuccess(res, {
      data: { user: user.toJSON() },
      message: `Account ${user.isActive ? 'activated' : 'deactivated'}`,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PUT /api/admin/users/:id/role
 */
async function setUserRole(req, res, next) {
  try {
    const user = await userService.setRole(req.user._id, req.params.id, req.body.role);
    return sendSuccess(res, {
      data: { user: user.toJSON() },
      message: `Role updated to ${user.role}`,
    });
  } catch (error) {
    return next(error);
  }
}

/* -------------------------------- Coupons ---------------------------------- */

async function listCoupons(req, res, next) {
  try {
    const coupons = await couponService.listCoupons({ includeInactive: true });
    return sendSuccess(res, {
      data: { coupons: coupons.map((coupon) => coupon.toJSON()) },
      message: 'Coupons retrieved',
    });
  } catch (error) {
    return next(error);
  }
}

async function createCoupon(req, res, next) {
  try {
    const coupon = await couponService.createCoupon(req.body);
    return sendSuccess(res, {
      status: 201,
      data: { coupon: coupon.toJSON() },
      message: `Coupon ${coupon.code} created`,
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteCoupon(req, res, next) {
  try {
    await couponService.deleteCoupon(req.params.id);
    return sendSuccess(res, { message: 'Coupon deleted' });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/admin/orders?status=&page=&limit=
 */
async function listOrders(req, res, next) {
  try {
    const filter = {};
    if (req.query.status) filter.orderStatus = req.query.status;

    const { orders, pagination } = await orderService.listOrders(filter, req.query);
    return sendSuccess(res, {
      data: { orders: orders.map((order) => order.toJSON()) },
      message: 'Orders retrieved',
      pagination,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PUT /api/admin/orders/:id/status - state-machine validated transition
 */
async function updateOrderStatus(req, res, next) {
  try {
    const order = await orderService.updateOrderStatus(req.params.id, req.body);
    return sendSuccess(res, {
      data: { order: order.toJSON() },
      message: `Order is now ${order.orderStatus}`,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/admin/orders/export - stream CSV of orders
 */
async function exportOrders(req, res, next) {
  try {
    const filter = {};
    if (req.query.status) filter.orderStatus = req.query.status;

    const { orders } = await orderService.listOrders(filter, { limit: 10000 });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="orders-export.csv"');

    const csvHeader = 'Order Number,Date,Customer Name,Customer Email,Items Count,Total,Payment Method,Payment Status,Order Status,Tracking Number\n';
    res.write(csvHeader);

    orders.forEach((order) => {
      const name = order.user ? `"${order.user.firstName} ${order.user.lastName}"` : `"${order.guestName || ''}"`;
      const email = order.user ? order.user.email : (order.guestEmail || '');
      const itemsCount = (order.items || []).reduce((sum, item) => sum + item.quantity, 0);
      const row = [
        order.orderNumber,
        `"${new Date(order.createdAt).toISOString()}"`,
        name,
        email,
        itemsCount,
        order.total.toFixed(2),
        order.paymentMethod,
        order.paymentStatus,
        order.orderStatus,
        order.trackingNumber || '',
      ].join(',') + '\n';
      res.write(row);
    });

    return res.end();
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/admin/global-search?q= - global search for products, orders, users, coupons
 */
async function globalSearch(req, res, next) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) {
      return sendSuccess(res, { data: { results: [] }, message: 'Search term too short' });
    }

    const Product = require('../models/Product');
    const Order = require('../models/Order');
    const User = require('../models/User');
    const Category = require('../models/Category');
    const Coupon = require('../models/Coupon');

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const [products, orders, users, categories, coupons] = await Promise.all([
      Product.find({ $or: [{ name: regex }, { sku: regex }] }).select('name sku slug price images').limit(5),
      Order.find({ $or: [{ orderNumber: regex }, { trackingNumber: regex }, { guestEmail: regex }] }).select('orderNumber total orderStatus createdAt').limit(5),
      User.find({ $or: [{ firstName: regex }, { lastName: regex }, { email: regex }] }).select('firstName lastName email role isActive').limit(5),
      Category.find({ name: regex }).select('name slug').limit(5),
      Coupon.find({ code: regex }).select('code discountType discountValue isActive').limit(5),
    ]);

    return sendSuccess(res, {
      data: {
        products,
        orders,
        users,
        categories,
        coupons,
      },
      message: 'Global search results',
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/admin/audit-logs
 */
async function listAuditLogs(req, res, next) {
  try {
    const auditService = require('../services/audit.service');
    const { logs, total } = await auditService.listLogs(req.query);
    return sendSuccess(res, {
      data: { logs },
      total,
      message: 'Audit logs retrieved',
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  dashboard,
  listOrders,
  exportOrders,
  updateOrderStatus,
  listUsers,
  setUserStatus,
  setUserRole,
  listCoupons,
  createCoupon,
  deleteCoupon,
  globalSearch,
  listAuditLogs,
};
