import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from './common/validation.pipe';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { ValidationExceptionFilter } from './filters/validation-exception.filter';
import { corsConfig } from './config/cors.config';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { GlobalConfigService } from './config/global-config.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // 1. 全局配置加载和验证 - 在NestJS应用启动前
  const globalConfigService = new GlobalConfigService();
  const globalConfigResult = globalConfigService.loadGlobalConfig();

  // 2. 配置验证失败 - 优雅退出
  if (!globalConfigResult.isValid) {
    logger.error('全局配置验证失败:');
    globalConfigResult.errors.forEach((error) => {
      logger.error(`  - ${error.field}: ${error.message}`);
      logger.error(`    建议: ${error.suggestion}`);
    });
    logger.error(`\n配置文件位置: ~/.gemini-any-llm/config.yaml`);
    logger.error('请修复配置问题后重新启动应用');
    process.exit(1);
  }

  // 3. 配置有效 - 显示配置来源信息
  logger.log(`全局配置加载成功: ${globalConfigResult.config!.configSource}`);
  if (globalConfigResult.warnings.length > 0) {
    globalConfigResult.warnings.forEach((warning) => {
      logger.warn(`配置警告: ${warning}`);
    });
  }

  // 4. 继续启动NestJS应用
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

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
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/v1beta/')) {
      // Rewrite /api/v1beta/xxx to /api/v1/xxx
      req.url = req.path.replace('/api/v1beta', '/api/v1');
    }
    next();
  });

  // Set global prefix for API routes
  app.setGlobalPrefix('api/v1');

  // Get port from configuration
  const port = (configService.get('gateway.port') as number) || 3002;

  const server = (await app.listen(port)) as {
    close: (callback: () => void) => void;
  };

  // Handle graceful shutdown
  const gracefulShutdown = (signal: string) => {
    logger.log(`Received ${signal}. Shutting down gracefully...`);

    server.close(() => {
      logger.log('HTTP server closed');
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      logger.error(
        'Could not close connections in time, forcefully shutting down',
      );
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
void bootstrap();
