const { describeDbError } = require('../utils/dbErrors');

// Centralized error handler. Any controller that calls next(err) lands here.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  let status = err.status || 500;
  let message = err.message;

  if (status >= 500) {
    console.error(err.stack || err);
    const dbMessage = describeDbError(err);
    if (dbMessage) {
      // Database problems are a setup issue, not a bug in the request.
      status = 503;
      // Detailed hint only outside production; never leak internals there.
      message = process.env.NODE_ENV === 'production' ? 'Service temporarily unavailable' : dbMessage;
    } else if (!err.expose) {
      // Never leak internals (SQL text, stack traces) for unexpected errors.
      message = 'Internal server error';
    }
  }
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
