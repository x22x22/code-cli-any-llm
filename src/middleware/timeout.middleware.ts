import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Logger } from '@nestjs/common';

@Injectable()
export class TimeoutMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TimeoutMiddleware.name);
  private readonly timeout = parseInt(
    process.env.REQUEST_TIMEOUT || '120000',
    10,
  ); // 120 seconds default

  use(req: Request, res: Response, next: NextFunction) {
    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        this.logger.warn(
          `Request timeout for ${req.method} ${req.originalUrl}`,
        );
        res.status(504).json({
          statusCode: 504,
          message: 'Gateway timeout',
          error: 'Timeout',
          timestamp: new Date().toISOString(),
          path: req.originalUrl,
        });
      }
    }, this.timeout);

    // Override res.end to clear timeout when response is sent
    const originalEnd = res.end.bind(res);
    (res as any).end = function (chunk?: unknown, encoding?: unknown): any {
      clearTimeout(timeoutId);
      return originalEnd.call(this, chunk, encoding);
    };

    // Handle socket errors
    req.socket.on('error', (error: Error) => {
      clearTimeout(timeoutId);
      this.logger.error(
        `Socket error for ${req.method} ${req.originalUrl}: ${error.message}`,
      );
    });

    next();
  }
}
