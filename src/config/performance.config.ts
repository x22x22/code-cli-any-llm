// Type definitions for request and error objects
interface RequestWithPath {
  path: string;
}

interface NetworkError {
  code?: string;
  status?: number;
}

export const performanceConfig = {
  // Request/response size limits
  maxRequestBodySize: '10mb' as const,
  maxResponseBodySize: '50mb' as const,

  // Rate limiting configuration
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.RATE_LIMIT_MAX
      ? parseInt(process.env.RATE_LIMIT_MAX, 10)
      : 100, // limit each IP to 100 requests per windowMs
    skip: (req: RequestWithPath): boolean => {
      // Skip rate limiting for health checks
      return req.path === '/health';
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  },

  // Connection pooling for OpenAI provider
  connectionPool: {
    maxSockets: 100,
    maxFreeSockets: 10,
    keepAlive: true,
    keepAliveMsecs: 30000,
    timeout: 60000,
  },

  // Caching configuration
  caching: {
    modelsTTL: 5 * 60 * 1000, // 5 minutes for model list
    healthCheckTTL: 30 * 1000, // 30 seconds for health checks
  },

  // Retry configuration for API calls
  retryConfig: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    retryCondition: (error: NetworkError): boolean => {
      // Retry on network errors and 5xx status codes
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return true;
      }
      if (error.status && error.status >= 500 && error.status < 600) {
        return true;
      }
      // Don't retry on 4xx errors (except 429)
      if (error.status === 429) {
        return true;
      }
      return false;
    },
  },
} as const;
