/**
 * Logger — Express backend.
 *
 * Wraps winston to provide structured, file-based logging.
 * In production: logs to file with rotation.
 * In development: logs to console + file.
 *
 * Usage: const logger = require('./services/logger');
 *        logger.info('message');
 *        logger.error('message', { error });
 */

const winston = require('winston');
const path = require('path');

// Log directory — relative to express-backend/
const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      const stackStr = stack ? `\n${stack}` : '';
      return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}${stackStr}`;
    })
  ),
  transports: [
    // File transport — always active
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'express.log'),
      maxsize: 5 * 1024 * 1024,  // 5 MB per file
      maxFiles: 5,                // Keep 5 rotated files
      tailable: true,
    }),
    // Error-only file for quick triage
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'express-error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
      tailable: true,
    }),
  ],
});

// In development, also log to console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message }) =>
        `[${timestamp}] [${level}] ${message}`
      )
    ),
  }));
}

/**
 * Morgan stream adapter — pipes HTTP request logs into winston.
 */
logger.morganStream = {
  write: (message) => {
    // Remove trailing newline from morgan output
    logger.info(message.trim());
  },
};

module.exports = logger;
