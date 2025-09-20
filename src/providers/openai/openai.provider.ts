import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OpenAI } from 'openai';
import {
  OpenAIRequest,
  OpenAIToolCall,
} from '../../models/openai/openai-request.model';
import {
  OpenAIResponse,
  OpenAIUsage,
} from '../../models/openai/openai-response.model';
import { OpenAIStreamChunk } from '../../models/openai/openai-stream.model';
import { OpenAIConfig } from '../../config/config.schema';
import { ConfigService } from '@nestjs/config';
import { GeminiRequestDto } from '../../models/gemini/gemini-request.dto';
import { TokenizerService } from '../../services/tokenizer.service';

type AggregatedRole = 'assistant' | 'user' | 'system' | 'tool';

interface ToolCallAggregationState {
  id?: string;
  type?: 'function';
  function: {
    name?: string;
    argumentParts: string[];
  };
}

interface ChoiceAggregationState {
  role?: AggregatedRole;
  contentParts: string[];
  reasoningParts: string[];
  toolCalls: Map<number, ToolCallAggregationState>;
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

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
      timeout: config.timeout ?? 1800000,
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
          stream: true,
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

        const stream = await this.createChatCompletionStream(
          request,
          config,
          client,
        );
        const response = await this.collectStreamToResponse(
          stream,
          request.model,
        );

        // 打印 OpenAI 聚合响应内容
        this.logger.debug('=== OpenAI Aggregated Response ===');
        this.logger.debug(
          `Status: ${response.choices?.[0]?.finish_reason || 'unknown'}`,
        );
        this.logger.debug(`Response: ${JSON.stringify(response, null, 2)}`);
        this.logger.debug('=================================');

        return response;
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

      const stream = await this.createChatCompletionStream(
        request,
        config,
        client,
      );

      try {
        for await (const chunk of stream) {
          yield chunk;
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

  private async createChatCompletionStream(
    request: OpenAIRequest,
    config: OpenAIConfig,
    client: OpenAI,
  ): Promise<AsyncIterable<OpenAIStreamChunk>> {
    const processedTools = request.tools;
    const extraBody = { ...(config.extraBody || {}) } as {
      stream_options?: Record<string, any>;
    };
    const extraStreamOptions = extraBody.stream_options;
    if (extraStreamOptions) {
      delete extraBody.stream_options;
    }

    try {
      const stream = await client.chat.completions.create({
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
      return stream as unknown as AsyncIterable<OpenAIStreamChunk>;
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
  }

  private async collectStreamToResponse(
    stream: AsyncIterable<OpenAIStreamChunk>,
    fallbackModel: string,
  ): Promise<OpenAIResponse> {
    const choicesState = new Map<number, ChoiceAggregationState>();
    let responseId: string | undefined;
    let created: number | undefined;
    let model: string | undefined;
    let usage: OpenAIUsage | undefined;

    for await (const chunk of stream) {
      if (!responseId) {
        responseId = chunk.id;
        created = chunk.created;
        model = chunk.model;
      }

      if (chunk.usage) {
        const { prompt_tokens, completion_tokens, total_tokens } = chunk.usage;
        if (
          prompt_tokens !== undefined &&
          completion_tokens !== undefined &&
          total_tokens !== undefined
        ) {
          usage = {
            prompt_tokens,
            completion_tokens,
            total_tokens,
          };
        }
      }

      for (const choice of chunk.choices) {
        const state = this.getChoiceState(choicesState, choice.index);
        if (choice.delta.role) {
          state.role = choice.delta.role as AggregatedRole;
        }
        if (choice.delta.content) {
          state.contentParts.push(choice.delta.content);
        }
        if (choice.delta.reasoning_content) {
          state.reasoningParts.push(choice.delta.reasoning_content);
        }
        if (choice.delta.tool_calls?.length) {
          for (const toolCallDelta of choice.delta.tool_calls) {
            const callState = this.getToolCallState(
              state.toolCalls,
              toolCallDelta,
            );
            if (toolCallDelta.id) {
              callState.id = toolCallDelta.id;
            }
            if (toolCallDelta.type) {
              callState.type = toolCallDelta.type;
            }
            if (toolCallDelta.function?.name) {
              callState.function.name = toolCallDelta.function.name;
            }
            if (toolCallDelta.function?.arguments) {
              callState.function.argumentParts.push(
                toolCallDelta.function.arguments,
              );
            }
          }
        }
        if (choice.finish_reason) {
          state.finishReason =
            choice.finish_reason as ChoiceAggregationState['finishReason'];
        }
      }
    }

    if (!responseId) {
      throw new Error('No stream chunks received from OpenAI');
    }

    const choices = Array.from(choicesState.entries())
      .sort(([a], [b]) => a - b)
      .map(([index, state]) => {
        const toolCalls: OpenAIToolCall[] | undefined =
          state.toolCalls.size > 0
            ? Array.from(state.toolCalls.entries())
                .sort(([a], [b]) => a - b)
                .map(([, call]) => {
                  if (!call.id || !call.function.name) {
                    return null;
                  }
                  return {
                    id: call.id,
                    type: call.type || 'function',
                    function: {
                      name: call.function.name,
                      arguments: call.function.argumentParts.join(''),
                    },
                  } satisfies OpenAIToolCall;
                })
                .filter((call): call is OpenAIToolCall => call !== null)
            : undefined;

        const reasoningText = state.reasoningParts.join('');
        const contentText = state.contentParts.join('');

        return {
          index,
          message: {
            role: state.role ?? 'assistant',
            content: contentText,
            reasoning_content: reasoningText || undefined,
            tool_calls: toolCalls,
          },
          finish_reason: state.finishReason ?? 'stop',
        };
      });

    return {
      id: responseId,
      object: 'chat.completion',
      created: created ?? Math.floor(Date.now() / 1000),
      model: model ?? fallbackModel,
      choices,
      usage,
    };
  }

  private getChoiceState(
    store: Map<number, ChoiceAggregationState>,
    index: number,
  ): ChoiceAggregationState {
    const existing = store.get(index);
    if (existing) {
      return existing;
    }
    const initial: ChoiceAggregationState = {
      contentParts: [],
      reasoningParts: [],
      toolCalls: new Map(),
    };
    store.set(index, initial);
    return initial;
  }

  private getToolCallState(
    store: Map<number, ToolCallAggregationState>,
    delta: { index: number },
  ): ToolCallAggregationState {
    const existing = store.get(delta.index);
    if (existing) {
      return existing;
    }
    const initial: ToolCallAggregationState = {
      function: {
        argumentParts: [],
      },
    };
    store.set(delta.index, initial);
    return initial;
  }
}
