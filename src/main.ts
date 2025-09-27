import express from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from './common/validation.pipe';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { ValidationExceptionFilter } from './filters/validation-exception.filter';
import { corsConfig } from './config/cors.config';
import { ConfigService } from '@nestjs/config';
import { Logger, LogLevel } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { GlobalConfigService } from './config/global-config.service';
import { performanceConfig } from './config/performance.config';
import { GatewayLoggerService } from './common/logger/gateway-logger.service';

async function bootstrap() {
  const globalConfigService = new GlobalConfigService();
  const globalConfigResult = globalConfigService.loadGlobalConfig();

  const resolveLogLevels = (level: string | undefined): LogLevel[] => {
    const normalized = (level || 'info').toLowerCase();
    const baseLevels: LogLevel[] = [
      'fatal',
      'error',
      'warn',
      'log',
      'debug',
      'verbose',
    ];
    switch (normalized) {
      case 'fatal':
        return ['fatal'];
      case 'error':
        return ['fatal', 'error'];
      case 'warn':
        return ['fatal', 'error', 'warn'];
      case 'info':
      case 'log':
        return ['fatal', 'error', 'warn', 'log'];
      case 'debug':
        return ['fatal', 'error', 'warn', 'log', 'debug'];
      case 'verbose':
        return baseLevels;
      default:
        return ['fatal', 'error', 'warn', 'log'];
    }
  };

  const configuredLogLevel =
    globalConfigResult.config?.gateway?.logLevel || process.env.GAL_LOG_LEVEL;
  const logLevels = resolveLogLevels(configuredLogLevel);

  const parsePort = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return undefined;
      }
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  };

  const environmentPort = parsePort(process.env.GAL_PORT);
  const configuredPort = parsePort(globalConfigResult.config?.gateway?.port);
  const portForLogger = configuredPort ?? environmentPort ?? 23062;

  const gatewayLogger = GatewayLoggerService.create({
    logDir:
      globalConfigResult.config?.gateway?.logDir ||
      process.env.GAL_GATEWAY_LOG_DIR,
    filePrefix: `gateway-${portForLogger}`,
    logLevels,
  });
  Logger.overrideLogger(gatewayLogger);
  const logger = new Logger('Bootstrap');

  // 2. 配置验证失败 - 优雅退出
  if (!globalConfigResult.isValid) {
    logger.error('全局配置验证失败:');
    globalConfigResult.errors.forEach((error) => {
      logger.error(`  - ${error.field}: ${error.message}`);
      logger.error(`    建议: ${error.suggestion}`);
    });
    logger.error(`\n配置文件位置: ~/.code-cli-any-llm/config.yaml`);
    logger.error('请修复配置问题后重新启动应用');
    logger.error(`网关日志文件: ${GatewayLoggerService.getLogFilePath()}`);
    GatewayLoggerService.close();
    process.exit(1);
  }

  // 3. 配置有效 - 显示配置来源信息
  logger.log(`全局配置加载成功: ${globalConfigResult.config!.configSource}`);
  logger.log(`网关日志文件: ${GatewayLoggerService.getLogFilePath()}`);
  if (globalConfigResult.warnings.length > 0) {
    globalConfigResult.warnings.forEach((warning) => {
      logger.warn(`配置警告: ${warning}`);
    });
  }

  // 4. 继续启动NestJS应用
  const app = await NestFactory.create(AppModule, { logger: gatewayLogger });
  const bodySizeLimit = performanceConfig.maxRequestBodySize;

  // 应用扩展的全局请求体大小限制
  app.use(express.json({ limit: bodySizeLimit }));
  app.use(express.urlencoded({ limit: bodySizeLimit, extended: true }));
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

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      req.path.startsWith('/api/v1/models/') &&
      !req.path.startsWith('/api/v1/gemini/models/')
    ) {
      req.url = req.path.replace('/api/v1/models', '/api/v1/gemini/models');
    }
    next();
  });

  // Set global prefix for API routes
  app.setGlobalPrefix('api/v1');

  // Get port from configuration
  const port = parsePort(configService.get('gateway.port')) ?? portForLogger;

  const server = (await app.listen(port)) as {
    close: (callback: () => void) => void;
  };

  // Handle graceful shutdown
  const gracefulShutdown = (signal: string) => {
    logger.log(`Received ${signal}. Shutting down gracefully...`);

    server.close(() => {
      logger.log('HTTP server closed');
      GatewayLoggerService.close();
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      logger.error(
        'Could not close connections in time, forcefully shutting down',
      );
      GatewayLoggerService.close();
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
