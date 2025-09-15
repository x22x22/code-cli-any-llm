import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { requestLoggingConfig } from '../config/logging.config';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger(LoggingMiddleware.name);
  }

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const { method, originalUrl, ip, headers } = req;

    // Skip logging based on configuration
    if (requestLoggingConfig.skip(req)) {
      return next();
    }

    // Log request
    this.logger.log(`[${method}] ${originalUrl}`, {
      ip,
      userAgent: headers['user-agent'],
      timestamp: new Date().toISOString(),
    });

    // Override res.end to log response
    const originalEnd = res.end;
    (res as any).end = function(chunk?: any, encoding?: any) {
      const duration = Date.now() - start;
      const { statusCode } = res;

      // Log response
      console.log(`[${method}] ${originalUrl} ${statusCode} ${duration}ms`, {
        statusCode,
        duration,
        timestamp: new Date().toISOString(),
      });

      originalEnd.call(this, chunk, encoding);
    };

    next();
  }
}