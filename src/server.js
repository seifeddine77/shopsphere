const app = require('./app');
const config = require('./config/environment');
const logger = require('./config/logger');
const { connectDatabase, disconnectDatabase } = require('./config/database');

let httpServer;

async function start() {
  // Fail fast on misconfiguration in production
  if (config.isProduction) {
    const problems = config.validateEnvironment();
    if (problems.length > 0) {
      problems.forEach((problem) => logger.error(`Configuration error: ${problem}`));
      process.exit(1);
    }
  }

  httpServer = app.listen(config.port, () => {
    logger.info(`Server listening on http://localhost:${config.port} [${config.nodeEnv}]`);
  });

  // The HTTP server starts immediately; the database connects with retries.
  // While disconnected the app runs in degraded mode and /health reports it.
  await connectDatabase();
}

async function shutdown(signal) {
  logger.info(`${signal} received - shutting down gracefully...`);
  try {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    await disconnectDatabase();
    process.exit(0);
  } catch (error) {
    logger.error(`Error during shutdown: ${error.message}`);
    process.exit(1);
  }
}

['SIGINT', 'SIGTERM'].forEach((signal) => process.on(signal, () => shutdown(signal)));

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled promise rejection: ${reason instanceof Error ? reason.stack : reason}`);
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.stack}`);
  shutdown('uncaughtException');
});

start();
