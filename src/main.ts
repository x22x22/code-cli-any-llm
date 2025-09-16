import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from './common/validation.pipe';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { ValidationExceptionFilter } from './filters/validation-exception.filter';
import { corsConfig } from './config/cors.config';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe());

  // Global exception filters
  app.useGlobalFilters(
    new GlobalExceptionFilter(),
    new ValidationExceptionFilter(),
  );

  // Enable CORS with enhanced configuration
  app.enableCors(corsConfig);

  // Add middleware to handle v1beta path rewriting
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/v1beta/')) {
      // Rewrite /api/v1beta/xxx to /api/v1/xxx
      req.url = req.path.replace('/api/v1beta', '/api/v1');
    }
    next();
  });

  // Set global prefix for API routes
  app.setGlobalPrefix('api/v1');

  // Get port from configuration
  const port = configService.get('gateway.port') || 3002;

  const server = await app.listen(port);

  // Handle graceful shutdown
  const gracefulShutdown = (signal: string) => {
    logger.log(`Received ${signal}. Shutting down gracefully...`);

    server.close(() => {
      logger.log('HTTP server closed');
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  // Listen for termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
  });

  logger.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
