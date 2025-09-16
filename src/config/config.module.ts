import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import { join } from 'path';

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
                ? (yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<
                    string,
                    unknown
                  >)
                : {};

              interface YamlConfig {
                openai?: {
                  apiKey?: string;
                  baseURL?: string;
                  model?: string;
                  organization?: string;
                  timeout?: number;
                };
                gateway?: {
                  port?: number;
                  host?: string;
                  logLevel?: string;
                };
              }

              const typedYamlConfig = yamlConfig as YamlConfig;

              // Use YAML config as primary source, only fallback to environment variables if not in YAML
              return {
                openai: {
                  apiKey:
                    typedYamlConfig.openai?.apiKey ||
                    process.env.OPENAI_API_KEY,
                  baseURL:
                    typedYamlConfig.openai?.baseURL ||
                    process.env.OPENAI_BASE_URL ||
                    'https://api.openai.com/v1',
                  model:
                    typedYamlConfig.openai?.model ||
                    process.env.OPENAI_MODEL ||
                    'gpt-3.5-turbo',
                  organization:
                    typedYamlConfig.openai?.organization ||
                    process.env.OPENAI_ORGANIZATION,
                  timeout:
                    typedYamlConfig.openai?.timeout ||
                    Number(process.env.OPENAI_TIMEOUT) ||
                    30000,
                },
                gateway: {
                  port:
                    typedYamlConfig.gateway?.port ||
                    Number(process.env.PORT) ||
                    3002,
                  host:
                    typedYamlConfig.gateway?.host ||
                    process.env.HOST ||
                    '0.0.0.0',
                  logLevel:
                    typedYamlConfig.gateway?.logLevel ||
                    process.env.LOG_LEVEL ||
                    'info',
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
