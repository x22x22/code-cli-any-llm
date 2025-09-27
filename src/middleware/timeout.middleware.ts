import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TimeoutMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TimeoutMiddleware.name);
  private readonly timeout: number;

  constructor(private readonly configService: ConfigService) {
    const configuredTimeout = this.configService.get<number>(
      'gateway.requestTimeout',
    );
    const envTimeout = process.env.CAL_REQUEST_TIMEOUT
      ? parseInt(process.env.CAL_REQUEST_TIMEOUT, 10)
      : undefined;
    const resolved = configuredTimeout ?? envTimeout ?? 3600000;
    this.timeout =
      Number.isFinite(resolved) && resolved > 0 ? resolved : 3600000;
  }

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
