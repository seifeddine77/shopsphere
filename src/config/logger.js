const fs = require('fs');
const path = require('path');
const winston = require('winston');
const config = require('./environment');

const logDirectory = path.join(__dirname, '../../logs');

// Winston creates files but not directories
if (!config.isTest) {
  try {
    fs.mkdirSync(logDirectory, { recursive: true });
  } catch (error) {
    // Fall back to console-only logging if the directory cannot be created
     
    console.error(`Could not create log directory: ${error.message}`);
  }
}

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${stack || message}${rest}`;
  }),
);

const logger = winston.createLogger({
  level: config.isTest ? 'warn' : config.isDevelopment ? 'debug' : 'info',
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    ...(config.isTest
      ? []
      : [
          new winston.transports.File({
            filename: path.join(logDirectory, 'error.log'),
            level: 'error',
            format: fileFormat,
            maxsize: 5 * 1024 * 1024,
            maxFiles: 5,
          }),
          new winston.transports.File({
            filename: path.join(logDirectory, 'combined.log'),
            format: fileFormat,
            maxsize: 5 * 1024 * 1024,
            maxFiles: 5,
          }),
        ]),
  ],
});

// Stream adapter so morgan HTTP logs go through winston
logger.stream = { write: (line) => logger.http(line.trim()) };

module.exports = logger;
