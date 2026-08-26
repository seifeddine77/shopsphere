/**
 * Standardized API response envelope.
 *
 * Success: { success: true,  data, message, pagination? }
 * Error:   { success: false, message, errors[] }
 */

function sendSuccess(res, { data = null, message = 'Operation successful', status = 200, pagination = null } = {}) {
  const payload = { success: true, data, message };
  if (pagination) {
    payload.pagination = pagination;
  }
  return res.status(status).json(payload);
}

function sendError(res, { message = 'Something went wrong', status = 500, errors = [] } = {}) {
  return res.status(status).json({ success: false, message, errors });
}

module.exports = { sendSuccess, sendError };
