import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIProvider } from '../providers/openai/openai.provider';
import { CodexProvider } from '../providers/codex/codex.provider';
import { ClaudeCodeProvider } from '../providers/claude-code/claude-code.provider';

export type SupportedLLMProvider =
  | OpenAIProvider
  | CodexProvider
  | ClaudeCodeProvider;

export interface ActiveProviderContext {
  provider: SupportedLLMProvider;
  aiProvider: 'openai' | 'codex' | 'claudeCode';
  useCodexProvider: boolean;
  useClaudeCodeProvider: boolean;
  gatewayApiMode: 'gemini' | 'openai';
  providerConfig?: Record<string, unknown>;
}

@Injectable()
export class LlmProviderResolverService {
  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly openaiProvider?: OpenAIProvider,
    @Optional() private readonly codexProvider?: CodexProvider,
    @Optional() private readonly claudeCodeProvider?: ClaudeCodeProvider,
  ) {}

  resolve(): ActiveProviderContext {
    const apiModeInput =
      this.configService.get<string>('gateway.apiMode') || 'gemini';
    const gatewayApiMode: 'gemini' | 'openai' =
      apiModeInput.trim().toLowerCase() === 'openai' ? 'openai' : 'gemini';

    const providerInput =
      this.configService.get<string>('aiProvider') || 'openai';
    const normalizedProvider = providerInput.trim().toLowerCase();

    if (normalizedProvider === 'codex') {
      const provider = this.codexProvider;
      if (!provider || !provider.isEnabled()) {
        throw new Error('Codex provider selected but configuration is missing');
      }
      return {
        provider,
        aiProvider: 'codex',
        useCodexProvider: true,
        useClaudeCodeProvider: false,
        gatewayApiMode,
        providerConfig: this.configService.get('codex'),
      };
    }

    if (
      normalizedProvider === 'claudecode' ||
      normalizedProvider === 'claude-code'
    ) {
      const provider = this.claudeCodeProvider;
      if (!provider || !provider.isEnabled()) {
        throw new Error(
          'Claude Code provider selected but configuration is missing',
        );
      }
      return {
        provider,
        aiProvider: 'claudeCode',
        useCodexProvider: false,
        useClaudeCodeProvider: true,
        gatewayApiMode,
        providerConfig: this.configService.get('claudeCode'),
      };
    }

    const provider = this.openaiProvider;
    if (!provider || !provider.isEnabled()) {
      throw new Error('OpenAI provider selected but configuration is missing');
    }
    return {
      provider,
      aiProvider: 'openai',
      useCodexProvider: false,
      useClaudeCodeProvider: false,
      gatewayApiMode,
      providerConfig: this.configService.get('openai'),
    };
  }

  resolveDefaultModel(context: ActiveProviderContext): string {
    const configured =
      (context.providerConfig?.model as string | undefined)?.trim() || '';
    if (configured) {
      return configured;
    }
    if (context.useCodexProvider) {
      return 'gpt-5-codex';
    }
    if (context.useClaudeCodeProvider) {
      return 'claude-sonnet-4-20250514';
    }
    if (context.gatewayApiMode === 'gemini') {
      return 'glm-4.5';
    }
    return 'gpt-4o-mini';
  }
}
