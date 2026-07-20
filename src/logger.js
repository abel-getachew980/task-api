/**
 * Simple structured logger.
 * Outputs JSON lines in production, human-friendly text in development.
 */

const IS_PROD = process.env.NODE_ENV === 'production';

function formatMessage(level, message, meta = {}) {
  if (IS_PROD) {
    return JSON.stringify({ level, message, ...meta, timestamp: new Date().toISOString() });
  }
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}${metaStr}`;
}

const logger = {
  info(message, meta) {
    console.log(formatMessage('info', message, meta));
  },
  warn(message, meta) {
    console.warn(formatMessage('warn', message, meta));
  },
  error(message, meta) {
    console.error(formatMessage('error', message, meta));
  },
  debug(message, meta) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(formatMessage('debug', message, meta));
    }
  },
};

module.exports = logger;
