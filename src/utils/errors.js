/**
 * Operational application error with an HTTP status code.
 * Only operational errors are reported to clients; programming
 * errors fall through to the generic 500 handler.
 */
class AppError extends Error {
  constructor(message, statusCode, errors = []) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

const badRequest = (message = 'Bad request', errors = []) => new AppError(message, 400, errors);
const unauthorized = (message = 'Authentication required') => new AppError(message, 401);
const forbidden = (message = 'You do not have permission to perform this action') => new AppError(message, 403);
const notFound = (message = 'Resource not found') => new AppError(message, 404);
const conflict = (message = 'Resource already exists') => new AppError(message, 409);
const unprocessable = (message = 'Validation failed', errors = []) => new AppError(message, 422, errors);
const tooManyRequests = (message = 'Too many requests, please try again later') => new AppError(message, 429);

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessable,
  tooManyRequests,
};
