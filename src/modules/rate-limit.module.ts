import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { performanceConfig } from '../config/performance.config';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: performanceConfig.rateLimiting.windowMs,
        limit: performanceConfig.rateLimiting.max,
      },
    ]),
  ],
})
export class RateLimitModule {}
