import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import { join } from 'path';
import { OpenAIConfig, GatewayConfig, AppConfig } from './config.schema';

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
              // Load YAML configuration
              const configPath = join(process.cwd(), 'config', 'config.yaml');
              const yamlConfig = fs.existsSync(configPath)
                ? yaml.load(fs.readFileSync(configPath, 'utf8')) as any
                : {};

              // Use YAML config as primary source, only fallback to environment variables if not in YAML
              return {
                openai: {
                  apiKey: yamlConfig.openai?.apiKey || process.env.OPENAI_API_KEY,
                  baseURL: yamlConfig.openai?.baseURL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
                  model: yamlConfig.openai?.model || process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
                  organization: yamlConfig.openai?.organization || process.env.OPENAI_ORGANIZATION,
                  timeout: yamlConfig.openai?.timeout || process.env.OPENAI_TIMEOUT || 30000,
                },
                gateway: {
                  port: yamlConfig.gateway?.port || process.env.PORT || 3002,
                  host: yamlConfig.gateway?.host || process.env.HOST || '0.0.0.0',
                  logLevel: yamlConfig.gateway?.logLevel || process.env.LOG_LEVEL || 'info',
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