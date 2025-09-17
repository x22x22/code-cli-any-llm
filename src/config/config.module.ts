import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { GlobalConfigService } from './global-config.service';

@Module({})
export class ConfigModule {
  static forRoot(): DynamicModule {
    return {
      module: ConfigModule,
      imports: [
        NestConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => {
              // Use GlobalConfigService to load configuration with proper hierarchy
              const globalConfigService = new GlobalConfigService();
              const globalConfigResult = globalConfigService.loadGlobalConfig();

              // If global config is valid, use it; otherwise fallback to environment variables
              if (globalConfigResult.isValid && globalConfigResult.config) {
                const config = globalConfigResult.config;
                return {
                  openai: {
                    apiKey: config.openai.apiKey,
                    baseURL: config.openai.baseURL,
                    model: config.openai.model,
                    timeout: config.openai.timeout,
                  },
                  gateway: {
                    port: config.gateway.port,
                    host: config.gateway.host,
                    logLevel: config.gateway.logLevel,
                  },
                };
              }

              // Fallback to environment variables if global config fails
              return {
                openai: {
                  apiKey: process.env.OPENAI_API_KEY,
                  baseURL:
                    process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
                  model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
                  organization: process.env.OPENAI_ORGANIZATION,
                  timeout: Number(process.env.OPENAI_TIMEOUT) || 30000,
                },
                gateway: {
                  port: Number(process.env.PORT) || 23062,
                  host: process.env.HOST || '0.0.0.0',
                  logLevel: process.env.LOG_LEVEL || 'info',
                },
              };
            },
          ],
        }),
      ],
      exports: [NestConfigModule],
      global: true,
    };
  }
}
