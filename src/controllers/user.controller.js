const userService = require('../services/user.service');
const { sendSuccess } = require('../utils/response');

/** GET /api/users/me - full own profile (includes addresses) */
async function me(req, res, next) {
  try {
    const user = await req.user.populate('addresses');
    return sendSuccess(res, { data: { user: user.toJSON() }, message: 'Profile retrieved' });
  } catch (error) {
    return next(error);
  }
}

/** PUT /api/users/me */
async function updateProfile(req, res, next) {
  try {
    const user = await userService.updateProfile(req.user._id, req.body);
    return sendSuccess(res, { data: { user: user.toJSON() }, message: 'Profile updated' });
  } catch (error) {
    return next(error);
  }
}

/** PUT /api/users/me/password */
async function changePassword(req, res, next) {
  try {
    await userService.changePassword(req.user._id, req.body.currentPassword, req.body.newPassword);
    return sendSuccess(res, { message: 'Password changed successfully' });
  } catch (error) {
    return next(error);
  }
}

/** POST /api/users/me/addresses */
async function addAddress(req, res, next) {
  try {
    const address = await userService.addAddress(req.user._id, req.body);
    return sendSuccess(res, {
      status: 201,
      data: { address },
      message: 'Address saved',
    });
  } catch (error) {
    return next(error);
  }
}

/** DELETE /api/users/me/addresses/:addressId */
async function removeAddress(req, res, next) {
  try {
    const addresses = await userService.removeAddress(req.user._id, req.params.addressId);
    return sendSuccess(res, {
      data: { addresses },
      message: 'Address removed',
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { me, updateProfile, changePassword, addAddress, removeAddress };
