import { Controller, Get, Optional } from '@nestjs/common';
import { OpenAIProvider } from '../providers/openai/openai.provider';
import { CodexProvider } from '../providers/codex/codex.provider';
import { ConfigService } from '@nestjs/config';

interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  provider?: unknown;
  config?: {
    model?: string;
    baseURL?: string;
  };
}

@Controller()
export class HealthController {
  private readonly startTime = Date.now();
  private readonly aiProvider: 'openai' | 'codex';
  private readonly useCodexProvider: boolean;
  private readonly provider: OpenAIProvider | CodexProvider;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly openAIProvider?: OpenAIProvider,
    @Optional() private readonly codexProvider?: CodexProvider,
  ) {
    const configuredProvider = (
      this.configService.get<string>('aiProvider') || 'openai'
    ).toLowerCase();
    this.aiProvider = configuredProvider === 'codex' ? 'codex' : 'openai';
    this.useCodexProvider = this.aiProvider === 'codex';
    if (this.useCodexProvider) {
      const codexProvider = this.codexProvider;
      if (!codexProvider || !codexProvider.isEnabled()) {
        throw new Error('Codex provider selected but configuration is missing');
      }
      this.provider = codexProvider;
    } else {
      if (!this.openAIProvider || !this.openAIProvider.isEnabled()) {
        throw new Error(
          'OpenAI provider selected but configuration is missing',
        );
      }
      this.provider = this.openAIProvider;
    }
  }

  @Get('health')
  async healthCheck(): Promise<HealthResponse> {
    const response: HealthResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: '1.0.0',
    };

    try {
      // Check active provider health
      const providerHealth = await this.provider.healthCheck();

      if (providerHealth.status === 'healthy') {
        response.provider = providerHealth.details;

        // Add basic config info (without sensitive data)
        const configKey = this.useCodexProvider ? 'codex' : 'openai';
        const providerConfig =
          this.configService.get<Record<string, unknown>>(configKey);
        response.config = {
          model: providerConfig?.model as string | undefined,
          baseURL: providerConfig?.baseURL as string | undefined,
        };
      } else {
        response.status = 'unhealthy';
        response.provider = providerHealth.details;
      }
    } catch (error) {
      response.status = 'unhealthy';
      response.provider = {
        error: (error as Error).message,
      };
    }

    return response;
  }
}
