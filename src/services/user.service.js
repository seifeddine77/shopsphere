const User = require('../models/User');
const Cart = require('../models/Cart');
const { notFound, badRequest, unauthorized } = require('../utils/errors');
const { comparePassword } = require('../utils/password');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Paginated user directory with optional search on email / names.
 * Administrators are always listed; search applies to every account.
 */
async function listUsers(query = {}) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);

  const filter = {};
  if (query.q && String(query.q).trim()) {
    const term = escapeRegExp(String(query.q).trim().slice(0, 60));
    const pattern = new RegExp(term, 'i');
    filter.$or = [{ email: pattern }, { firstName: pattern }, { lastName: pattern }];
  }

  const [users, totalItems] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('firstName lastName email phone role isActive createdAt'),
    User.countDocuments(filter),
  ]);

  return {
    users,
    pagination: {
      currentPage: page,
      totalPages: Math.max(Math.ceil(totalItems / limit), 1),
      totalItems,
      itemsPerPage: limit,
      hasNextPage: page < Math.ceil(totalItems / limit),
      hasPreviousPage: page > 1,
    },
  };
}

/**
 * Role & status changes are allowed between different accounts;
 * self-modification is always blocked (prevents accidental privilege loss).
 */
async function setStatus(actorId, targetUserId, isActive) {
  if (String(actorId) === String(targetUserId)) {
    throw badRequest('You cannot change the status of your own account');
  }
  const user = await User.findById(targetUserId);
  if (!user) throw notFound('User not found');

  user.isActive = Boolean(isActive);
  await user.save();

  // Deactivating a customer also invalidates their cart session data
  if (!user.isActive) {
    await Cart.findOneAndDelete({ user: user._id });
  }
  return user;
}

async function setRole(actorId, targetUserId, role) {
  if (String(actorId) === String(targetUserId)) {
    throw badRequest('You cannot change your own role');
  }
  const user = await User.findById(targetUserId);
  if (!user) throw notFound('User not found');

  user.role = role;
  await user.save();
  return user;
}

/* ------------------------------ Profile (self) ----------------------------- */

async function updateProfile(userId, payload) {
  const user = await User.findById(userId);
  if (!user) throw notFound('User not found');

  user.firstName = payload.firstName;
  user.lastName = payload.lastName;
  user.phone = payload.phone || '';
  await user.save();
  return user;
}

/** Verifies the current password before swapping in the new one */
async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw notFound('User not found');

  const matches = await comparePassword(currentPassword, user.password);
  if (!matches) {
    throw unauthorized('Your current password is incorrect');
  }

  user.password = newPassword; // hashed by the pre-save hook
  await user.save();
  return true;
}

/* ------------------------------- Addresses ---------------------------------- */

function findAddress(user, addressId) {
  const address = (user.addresses || []).id(addressId);
  if (!address) throw notFound('Address not found');
  return address;
}

async function addAddress(userId, addressData) {
  const user = await User.findById(userId);
  if (!user) throw notFound('User not found');

  // A new default demotes every other address
  const makeDefault = Boolean(addressData.isDefault) || (user.addresses || []).length === 0;
  user.addresses.push({ ...addressData, isDefault: false });
  const added = user.addresses[user.addresses.length - 1];
  if (makeDefault) {
    added.isDefault = true;
    (user.addresses || []).forEach((address) => {
      if (String(address._id) !== String(added._id)) address.isDefault = false;
    });
  }

  await user.save();
  return added;
}

async function removeAddress(userId, addressId) {
  const user = await User.findById(userId);
  if (!user) throw notFound('User not found');

  const wasDefault = findAddress(user, addressId).isDefault;
  user.addresses.pull(addressId);

  // Promote the first remaining address when the default disappeared
  if (wasDefault && user.addresses.length > 0) {
    user.addresses[0].isDefault = true;
  }

  await user.save();
  return user.addresses;
}

module.exports = {
  listUsers,
  setStatus,
  setRole,
  updateProfile,
  changePassword,
  addAddress,
  removeAddress,
};
