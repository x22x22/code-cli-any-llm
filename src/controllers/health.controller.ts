import {
  Controller,
  Get,
  Optional,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { OpenAIProvider } from '../providers/openai/openai.provider';
import { CodexProvider } from '../providers/codex/codex.provider';
import { ClaudeCodeProvider } from '../providers/claude-code/claude-code.provider';
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
  gateway?: {
    apiMode: string;
    cliMode: string;
  };
}

@Controller()
export class HealthController implements OnApplicationBootstrap {
  private readonly startTime = Date.now();
  private aiProvider: 'openai' | 'codex' | 'claudeCode' = 'openai';
  private useCodexProvider = false;
  private useClaudeCodeProvider = false;
  private provider!: OpenAIProvider | CodexProvider | ClaudeCodeProvider;
  private initialized = false;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly openAIProvider?: OpenAIProvider,
    @Optional() private readonly codexProvider?: CodexProvider,
    @Optional() private readonly claudeCodeProvider?: ClaudeCodeProvider,
  ) {}

  onApplicationBootstrap(): void {
    this.initializeProvider();
  }

  private initializeProvider(): void {
    if (this.initialized) {
      return;
    }
    const providerInput =
      this.configService.get<string>('aiProvider') || 'claudeCode';
    const normalizedProvider = providerInput.trim().toLowerCase();
    if (normalizedProvider === 'codex') {
      this.aiProvider = 'codex';
    } else if (
      normalizedProvider === 'claudecode' ||
      normalizedProvider === 'claude-code'
    ) {
      this.aiProvider = 'claudeCode';
    } else {
      this.aiProvider = 'openai';
    }
    this.useCodexProvider = this.aiProvider === 'codex';
    this.useClaudeCodeProvider = this.aiProvider === 'claudeCode';

    if (this.useCodexProvider) {
      const codexProvider = this.codexProvider;
      if (!codexProvider || !codexProvider.isEnabled()) {
        throw new Error('Codex provider selected but configuration is missing');
      }
      this.provider = codexProvider;
    } else if (this.useClaudeCodeProvider) {
      const claudeProvider = this.claudeCodeProvider;
      if (!claudeProvider || !claudeProvider.isEnabled()) {
        throw new Error(
          'Claude Code provider selected but configuration is missing',
        );
      }
      this.provider = claudeProvider;
    } else {
      if (!this.openAIProvider || !this.openAIProvider.isEnabled()) {
        throw new Error(
          'OpenAI provider selected but configuration is missing',
        );
      }
      this.provider = this.openAIProvider;
    }
    this.initialized = true;
  }

  @Get('health')
  async healthCheck(): Promise<HealthResponse> {
    this.initializeProvider();
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
        const configKey = this.useCodexProvider
          ? 'codex'
          : this.useClaudeCodeProvider
            ? 'claudeCode'
            : 'openai';
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

    const gatewayConfig =
      this.configService.get<Record<string, unknown>>('gateway');
    const apiModeValue = (gatewayConfig?.apiMode as string | undefined)
      ?.trim()
      .toLowerCase();
    const cliModeValue = (gatewayConfig?.cliMode as string | undefined)
      ?.trim()
      .toLowerCase();
    const normalizedCliMode =
      cliModeValue === 'opencode'
        ? 'opencode'
        : cliModeValue === 'crush'
          ? 'crush'
          : 'gemini';

    response.gateway = {
      apiMode: apiModeValue === 'openai' ? 'openai' : 'gemini',
      cliMode: normalizedCliMode,
    };

    return response;
  }
}
