// Request logging configuration
export const requestLoggingConfig = {
  // Skip logging for health checks in production
  skip: (req) => {
    if (process.env.NODE_ENV === 'production' && req.path === '/health') {
      return true;
    }
    return false;
  },
  // Filter sensitive headers
  filterHeaders: [
    'authorization',
    'cookie',
    'x-api-key',
    'x-gemini-api-key',
  ],
};