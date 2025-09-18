import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import os from 'os';
import path from 'path';
import { GlobalConfigService } from './global-config.service';

const DEFAULT_GATEWAY_LOG_DIR = path.join(
  os.homedir(),
  '.gemini-any-llm',
  'logs',
);

const resolveLogDir = (value?: string): string => {
  if (!value || !value.trim()) {
    return DEFAULT_GATEWAY_LOG_DIR;
  }
  const trimmed = value.trim();
  if (trimmed === '~') {
    return os.homedir();
  }
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    const relative = trimmed.slice(2);
    return path.join(os.homedir(), relative);
  }
  if (trimmed.startsWith('~')) {
    const relative = trimmed.slice(1).replace(/^[\\/]/, '');
    return path.join(os.homedir(), relative);
  }
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(trimmed);
};

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
                    logDir: resolveLogDir(config.gateway.logDir),
                  },
                };
              }

              // Fallback to environment variables if global config fails
              return {
                openai: {
                  apiKey: process.env.GAL_OPENAI_API_KEY,
                  baseURL:
                    process.env.GAL_OPENAI_BASE_URL ||
                    'https://api.openai.com/v1',
                  model: process.env.GAL_OPENAI_MODEL || 'gpt-3.5-turbo',
                  organization: process.env.GAL_OPENAI_ORGANIZATION,
                  timeout: Number(process.env.GAL_OPENAI_TIMEOUT) || 30000,
                },
                gateway: {
                  port: Number(process.env.GAL_PORT) || 23062,
                  host: process.env.GAL_HOST || '0.0.0.0',
                  logLevel: process.env.GAL_LOG_LEVEL || 'info',
                  logDir: resolveLogDir(process.env.GAL_GATEWAY_LOG_DIR),
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
