const config = require('../config/environment');
const logger = require('../config/logger');
const { sendError } = require('../utils/response');
const { isApiRequest } = require('../utils/request');

/** 404 for unmatched routes - JSON for /api, HTML page otherwise. */
function notFoundHandler(req, res) {
  if (isApiRequest(req)) {
    return sendError(res, {
      status: 404,
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
  }

  return renderErrorPage(res, 404, 'The page you are looking for does not exist or has been moved.');
}

/** Centralized error handler - every thrown/next(err) ends up here. */
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  let status = error.statusCode || 500;
  let message = error.message || 'Something went wrong';
  let fieldErrors = Array.isArray(error.errors) ? error.errors : [];

  // Mongoose: malformed ObjectId
  if (error.name === 'CastError') {
    status = 400;
    message = `Invalid identifier format: ${error.value}`;
    fieldErrors = [];
  }

  // Mongoose: schema validation
  if (error.name === 'ValidationError' && error.errors && !Array.isArray(error.errors)) {
    status = 422;
    message = 'Validation failed';
    fieldErrors = Object.values(error.errors).map((e) => ({ field: e.path, message: e.message }));
  }

  // Mongo duplicate key
  if (error.code === 11000) {
    status = 409;
    const match = /index:\s*(\w+)/.exec(error.message || '') || /dup key:\s*\{\s*(\w+)/.exec(error.message || '');
    const field = match ? match[1] : 'field';
    message = `Duplicate value for ${field}`;
    fieldErrors = [{ field, message: `${field} is already in use` }];
  }

  // Programming errors must never leak internals in production
  if (!error.isOperational) {
    message = config.isProduction ? 'Something went wrong' : message;
    fieldErrors = [];
  }

  if (res.headersSent) {
    logger.warn('Headers already sent - delegating to default handler');
    return res.end();
  }

  logger.log(status >= 500 ? 'error' : 'warn', `${status} ${req.method} ${req.originalUrl}: ${message}`, {
    stack: status >= 500 ? error.stack : undefined,
  });

  if (isApiRequest(req)) {
    return sendError(res, { status, message, errors: fieldErrors });
  }

  return renderErrorPage(res, status, message);
}

function renderErrorPage(res, status, message) {
  try {
    return res.status(status).render('error', {
      title: `Error ${status}`,
      statusCode: status,
      errorMessage: message,
    });
  } catch (renderFailure) {
    // Absolute fallback: never crash on a broken template
    logger.error(`Error page rendering failed: ${renderFailure.message}`);
    return res.status(status).send(`<h1>Error ${status}</h1><p>${message}</p>`);
  }
}

module.exports = { notFoundHandler, errorHandler };
