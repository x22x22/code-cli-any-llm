import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import * as os from 'os';
import * as path from 'path';
import { GatewayConfigSchema } from '../../src/config/config.schema';
import { GlobalConfigService } from '../../src/config/global-config.service';
import type { GlobalConfig } from '../../src/config/global-config.interface';

describe('Global configuration qwencode integration', () => {
  it('accepts qwencode cliMode via schema transformation', () => {
    const instance = plainToInstance(GatewayConfigSchema, {
      port: 23062,
      host: '127.0.0.1',
      logLevel: 'info',
      logDir: path.join(os.tmpdir(), 'code-cli-any-llm-test'),
      requestTimeout: 3600000,
      apiMode: 'openai',
      cliMode: 'qwencode',
    });

    const errors = validateSync(instance, { forbidUnknownValues: false });
    expect(errors).toHaveLength(0);
    expect(instance.cliMode).toBe('qwencode');
  });

  it('normalizes gateway.apiMode to openai when cliMode is qwencode', () => {
    const service = new GlobalConfigService();
    const rawConfig: Partial<GlobalConfig> = {
      aiProvider: 'openai',
      openai: {
        apiKey: 'test',
        baseURL: 'https://example.com',
        model: 'example-model',
        timeout: 3600000,
      },
      gateway: {
        port: 23062,
        host: '127.0.0.1',
        logLevel: 'info',
        logDir: path.join(os.tmpdir(), 'code-cli-any-llm-test'),
        requestTimeout: 3600000,
        apiMode: 'gemini',
        cliMode: 'qwencode',
        apiKey: 'gateway-key',
      },
      configSource: 'test',
      configSources: ['test'],
      isValid: true,
    } as Partial<GlobalConfig>;

    const result = (service as any).validateConfig(rawConfig);

    expect(result.isValid).toBe(true);
    expect(result.config?.gateway.cliMode).toBe('qwencode');
    expect(result.config?.gateway.apiMode).toBe('openai');
  });
});
