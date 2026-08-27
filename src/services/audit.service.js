const AuditLog = require('../models/AuditLog');

async function logAction({ user, action, entity, entityId = '', details = {}, ip = '' }) {
  try {
    return await AuditLog.create({
      user: user ? user._id : null,
      userEmail: user ? user.email : 'System',
      action,
      entity,
      entityId: String(entityId),
      details,
      ip,
    });
  } catch (error) {
    // Non-blocking logger failure
    return null;
  }
}

async function listLogs({ limit = 50, page = 1 } = {}) {
  const skip = (Math.max(page, 1) - 1) * limit;
  const [logs, total] = await Promise.all([
    AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('user', 'firstName lastName email'),
    AuditLog.countDocuments(),
  ]);
  return { logs, total };
}

module.exports = {
  logAction,
  listLogs,
};
