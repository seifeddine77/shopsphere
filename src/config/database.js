const mongoose = require('mongoose');
const config = require('./environment');
const logger = require('./logger');

const RETRY_LIMIT = 5;
const RETRY_DELAY_MS = 5000;

mongoose.set('strictQuery', true);

function registerConnectionListeners() {
  mongoose.connection.on('error', (error) => {
    logger.error(`MongoDB runtime error: ${error.message}`);
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
}

async function connectDatabase(attempt = 1) {
  try {
    logger.info(
      `Connecting to MongoDB (attempt ${attempt}/${RETRY_LIMIT}) -> ${maskUri(config.mongodbUri)}`,
    );
    await mongoose.connect(config.mongodbUri);
    logger.info(
      `MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`,
    );
    return true;
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);

    if (attempt >= RETRY_LIMIT) {
      logger.error(
        'MongoDB unreachable after maximum retries - server keeps running in degraded mode (API calls requiring the database will fail)',
      );
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return connectDatabase(attempt + 1);
  }
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB connection closed');
  }
}

/** True when queries can be served right now */
function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

/** Hide credentials before logging a connection string */
function maskUri(uri) {
  return uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
}

registerConnectionListeners();

module.exports = { connectDatabase, disconnectDatabase, isDatabaseConnected };
