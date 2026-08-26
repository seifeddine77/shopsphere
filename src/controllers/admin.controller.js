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

module.exports = {
  dashboard,
  listOrders,
  updateOrderStatus,
  listUsers,
  setUserStatus,
  setUserRole,
  listCoupons,
  createCoupon,
  deleteCoupon,
};
