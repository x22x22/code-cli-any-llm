import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OpenAI } from 'openai';
import { OpenAIRequest } from '../../models/openai/openai-request.model';
import { OpenAIResponse } from '../../models/openai/openai-response.model';
import { OpenAIStreamChunk } from '../../models/openai/openai-stream.model';
import { OpenAIConfig } from '../../config/config.schema';
import { ConfigService } from '@nestjs/config';
import { GeminiRequestDto } from '../../models/gemini/gemini-request.dto';
import { TokenizerService } from '../../services/tokenizer.service';

@Injectable()
export class OpenAIProvider implements OnModuleInit {
  private readonly logger = new Logger(OpenAIProvider.name);
  private openai: OpenAI | null = null;
  private config?: OpenAIConfig;
  private enabled = false;

  constructor(
    private configService: ConfigService,
    private tokenizerService: TokenizerService,
  ) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  onModuleInit(): void {
    const activeProvider = (
      this.configService.get<string>('aiProvider') || 'openai'
    ).toLowerCase();
    if (activeProvider !== 'openai') {
      this.logger.debug(
        `OpenAI provider disabled because aiProvider is set to ${activeProvider}.`,
      );
      this.enabled = false;
      return;
    }

    const config = this.configService.get<OpenAIConfig>('openai');
    if (!config) {
      throw new Error('OpenAI configuration not found');
    }
    this.config = config;

    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      organization: config.organization,
      timeout: config.timeout || 30000,
      dangerouslyAllowBrowser: false, // Ensure we're not in browser context
    });

    this.enabled = true;
    this.logger.log(`OpenAI provider initialized with model: ${config.model}`);
  }

  getConfig() {
    return this.enabled ? this.config : undefined;
  }

  async generateContent(request: OpenAIRequest): Promise<OpenAIResponse> {
    const { config, client } = this.ensureReady();
    let lastError: Error | null = null;
    const maxRetries = 3;
    const initialDelay = 1000;
    const maxDelay = 10000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 打印完整的请求信息
        const requestBody = {
          model: request.model,
          messages: request.messages,
          tools: request.tools,
          tool_choice: request.tool_choice,
          temperature: request.temperature,
          top_p: request.top_p,
          max_tokens: request.max_tokens,
          stop: request.stop,
          user: request.user,
          stream: false,
          ...(config.extraBody || {}),
        };

        this.logger.debug('=== OpenAI Request Details ===');
        this.logger.debug(`URL: ${config.baseURL}/chat/completions`);
        this.logger.debug(`Headers: {
          'Authorization': 'Bearer ${config.apiKey.substring(0, 20)}...',
          'Content-Type': 'application/json'
        }`);
        this.logger.debug(`Body: ${JSON.stringify(requestBody, null, 2)}`);
        this.logger.debug('================================');

        const response = await client.chat.completions.create({
          model: request.model,
          messages:
            request.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          tools: request.tools,
          tool_choice: request.tool_choice,
          temperature: request.temperature,
          top_p: request.top_p,
          max_tokens: request.max_tokens,
          stop: request.stop,
          user: request.user,
          stream: false,
          ...(config.extraBody || {}),
        });

        // 打印 OpenAI 响应内容
        this.logger.debug('=== OpenAI Response Details ===');
        this.logger.debug(
          `Status: ${response.choices?.[0]?.finish_reason || 'unknown'}`,
        );
        this.logger.debug(`Response: ${JSON.stringify(response, null, 2)}`);
        this.logger.debug('=================================');

        return response as OpenAIResponse;
      } catch (error) {
        lastError = this.transformError(error);

        // Don't retry on client errors (4xx) except 429
        if (
          (error as { status?: number }).status &&
          (error as { status: number }).status >= 400 &&
          (error as { status: number }).status < 500 &&
          (error as { status: number }).status !== 429
        ) {
          this.logger.error('Non-retryable error, throwing immediately', error);
          throw lastError;
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          this.logger.error(
            `Max retries (${maxRetries}) exceeded, giving up`,
            error,
          );
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          initialDelay * Math.pow(2, attempt - 1) * (1 + Math.random() * 0.2),
          maxDelay,
        );

        this.logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`, {
          error: (error as Error).message,
          delay,
        });

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Max retries exceeded with unknown error');
  }

  async *generateContentStream(
    request: OpenAIRequest,
  ): AsyncIterable<OpenAIStreamChunk> {
    const { config, client } = this.ensureReady();
    try {
      this.logger.debug('Starting stream request to OpenAI', {
        model: request.model,
        messages: request.messages.length,
        hasTools: !!request.tools,
      });

      // 保持调用方提供的工具定义，不做“简化”处理
      const processedTools = request.tools;

      let stream;
      try {
        const extraBody = { ...(config.extraBody || {}) } as {
          stream_options?: Record<string, any>;
        };
        const extraStreamOptions = extraBody.stream_options;
        if (extraStreamOptions) {
          delete extraBody.stream_options;
        }
        stream = await client.chat.completions.create({
          model: request.model,
          messages:
            request.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          tools: processedTools,
          tool_choice: processedTools ? request.tool_choice : undefined,
          temperature: request.temperature,
          top_p: request.top_p,
          max_tokens: request.max_tokens,
          stop: request.stop,
          user: request.user,
          stream: true,
          stream_options: {
            include_usage: true,
            ...(extraStreamOptions || {}),
          },
          ...extraBody,
        });
      } catch (createError) {
        this.logger.error('Failed to create OpenAI stream:', {
          error: (createError as Error).message,
          status: (createError as { status?: number }).status,
          type: (createError as { type?: string }).type,
          code: (createError as { code?: string }).code,
          stack: (createError as Error).stack,
        });
        throw createError;
      }

      try {
        for await (const chunk of stream) {
          yield chunk as OpenAIStreamChunk;
        }
      } catch (iterationError) {
        this.logger.error(
          'Error during stream iteration:',
          (iterationError as Error).message,
        );
        throw iterationError;
      }
    } catch (error) {
      this.logger.error('OpenAI streaming error:', (error as Error).message);
      throw this.transformError(error);
    }
  }

  async listModels(): Promise<unknown> {
    const { client } = this.ensureReady();
    try {
      const response = await client.models.list();
      return response.data;
    } catch (error) {
      this.logger.error('Failed to list models', error);
      throw this.transformError(error);
    }
  }

  private transformError(error: unknown): Error {
    if ((error as { status?: number }).status) {
      // OpenAI API error
      const errorObj = error as {
        status: number;
        error?: { message?: string };
        message?: string;
      };
      const message =
        errorObj.error?.message ||
        errorObj.message ||
        'Unknown OpenAI API error';
      const statusCode = errorObj.status;

      switch (statusCode) {
        case 401:
          return new Error(`Authentication error: ${message}`);
        case 429:
          return new Error(`Rate limit exceeded: ${message}`);
        case 400:
          return new Error(`Invalid request: ${message}`);
        case 404:
          return new Error(`Model not found: ${message}`);
        default:
          return new Error(`OpenAI API error (${statusCode}): ${message}`);
      }
    }

    // Network or other errors
    if ((error as { code?: string }).code === 'ECONNREFUSED') {
      return new Error(
        'Connection refused - check if OpenAI service is accessible',
      );
    }

    if ((error as { code?: string }).code === 'ETIMEDOUT') {
      return new Error(
        'Request timeout - OpenAI service did not respond in time',
      );
    }

    return error instanceof Error ? error : new Error(String(error));
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details?: unknown;
  }> {
    try {
      const { client, config } = this.ensureReady();
      // Try a simple API call to check if the service is accessible
      await client.models.list();

      return {
        status: 'healthy',
        details: {
          provider: 'OpenAI',
          baseURL: client.baseURL,
          model: config.model,
        },
      };
    } catch (error) {
      if (!this.enabled) {
        return {
          status: 'unhealthy',
          details: {
            provider: 'OpenAI',
            message: 'OpenAI provider disabled by configuration',
          },
        };
      }
      return {
        status: 'unhealthy',
        details: {
          provider: 'OpenAI',
          error: (error as Error).message,
        },
      };
    }
  }

  countTokens(request: GeminiRequestDto): number {
    const { config } = this.ensureReady();
    try {
      // Get the configured model
      const model = config.model || 'glm-4.5';

      // Use tokenizer service to count tokens
      const tokenCount = this.tokenizerService.countTokensInRequest(
        request.contents,
        model,
      );

      this.logger.debug(
        `Counted tokens for request: ${tokenCount} (model: ${model})`,
      );

      return tokenCount;
    } catch (error) {
      this.logger.error('Error counting tokens', error);
      throw new Error(`Failed to count tokens: ${(error as Error).message}`);
    }
  }

  private ensureReady(): { config: OpenAIConfig; client: OpenAI } {
    if (!this.enabled || !this.openai || !this.config) {
      throw new Error('OpenAI provider is not enabled.');
    }
    return { config: this.config, client: this.openai };
  }
}
