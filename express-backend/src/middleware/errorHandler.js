const logger = require('../services/logger');

// Global error handler — must be registered last in Express middleware chain
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (status >= 500) {
    logger.error(`${req.method} ${req.path} → ${status}: ${err.stack || err.message}`);
  }

  res.status(status).json({
    success: false,
    error: message,
  });
}

module.exports = errorHandler;
