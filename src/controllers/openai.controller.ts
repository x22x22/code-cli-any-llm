import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { OpenAIRequest } from '../models/openai/openai-request.model';
import {
  OpenAIResponse,
  OpenAIUsage,
} from '../models/openai/openai-response.model';
import {
  OpenAIStreamChunk,
  OpenAIStreamUsage,
} from '../models/openai/openai-stream.model';
import {
  ActiveProviderContext,
  LlmProviderResolverService,
  SupportedLLMProvider,
} from '../services/llm-provider-resolver.service';

@Controller('openai/v1')
export class OpenAIController implements OnApplicationBootstrap {
  private readonly logger = new Logger(OpenAIController.name);
  private initialized = false;
  private gatewayApiMode: 'gemini' | 'openai' = 'gemini';
  private aiProvider!: 'openai' | 'codex' | 'claudeCode';
  private useCodexProvider = false;
  private useClaudeCodeProvider = false;
  private llmProvider!: SupportedLLMProvider;

  private providerContext?: ActiveProviderContext;

  constructor(
    private readonly configService: ConfigService,
    private readonly providerResolver: LlmProviderResolverService,
  ) {}

  onApplicationBootstrap(): void {
    this.initializeProvider();
  }

  @Get('models')
  async listModels(@Res() res: Response): Promise<void> {
    this.initializeProvider();
    this.ensureApiEnabled();

    try {
      const provider = this.ensureProvider();
      const config = this.getActiveProviderConfig();
      const defaultModel = this.resolveDefaultModel(config);

      let data: unknown;
      if (typeof (provider as any).listModels === 'function') {
        data = await (provider as any).listModels();
      }

      const payload = {
        object: 'list',
        data:
          Array.isArray(data) && data.length > 0
            ? data
            : [
                {
                  id: defaultModel,
                  object: 'model',
                  created: Math.floor(Date.now() / 1000),
                  owned_by: 'code-cli-any-llm',
                },
              ],
      };

      res.status(200).json(payload);
    } catch (error) {
      this.logger.error('Failed to list models', error as Error);
      res.status(500).json({
        error: {
          message: (error as Error).message || 'Failed to list models',
          type: 'internal_server_error',
        },
      });
    }
  }

  @Post('chat/completions')
  async createChatCompletion(
    @Body() body: any,
    @Res() res: Response,
  ): Promise<void> {
    this.initializeProvider();
    this.ensureApiEnabled();
    const provider = this.ensureProvider();

    const config = this.getActiveProviderConfig();
    const defaultModel = this.resolveDefaultModel(config);
    const request = this.normalizeChatCompletionRequest(body, defaultModel);
    const stream = this.isStreaming(body);

    if (stream) {
      await this.streamChatCompletion(provider, request, res);
      return;
    }

    try {
      const response = await provider.generateContent(request);
      res.status(200).json(response);
    } catch (error) {
      this.logger.error('Chat completion failed', error as Error);
      res.status(500).json({
        error: {
          message: (error as Error).message || 'Chat completion failed',
          type: 'internal_server_error',
        },
      });
    }
  }

  @Post('responses')
  async createResponse(@Body() body: any, @Res() res: Response): Promise<void> {
    this.initializeProvider();
    this.ensureApiEnabled();
    const provider = this.ensureProvider();

    const config = this.getActiveProviderConfig();
    const defaultModel = this.resolveDefaultModel(config);
    const request = this.normalizeResponsesRequest(body, defaultModel);
    const stream = this.isStreaming(body);

    if (stream) {
      await this.streamResponse(provider, request, body, res);
      return;
    }

    try {
      const response = await provider.generateContent(request);
      const transformed = this.transformToResponsesPayload(response, body);
      res.status(200).json(transformed);
    } catch (error) {
      this.logger.error('Responses endpoint failed', error as Error);
      res.status(500).json({
        error: {
          message: (error as Error).message || 'Responses endpoint failed',
          type: 'internal_server_error',
        },
      });
    }
  }

  private initializeProvider(): void {
    if (this.initialized) {
      return;
    }

    const context = this.providerResolver.resolve();
    this.providerContext = context;
    this.gatewayApiMode = context.gatewayApiMode;
    this.aiProvider = context.aiProvider;
    this.useCodexProvider = context.useCodexProvider;
    this.useClaudeCodeProvider = context.useClaudeCodeProvider;
    this.llmProvider = context.provider;

    const providerLabel = this.useCodexProvider
      ? 'Codex'
      : this.useClaudeCodeProvider
        ? 'Claude Code'
        : 'OpenAI';
    const defaultModel = this.resolveDefaultModel(context.providerConfig);
    this.logger.log(`OpenAI facade configured with provider: ${providerLabel}`);
    this.logger.log(`Gateway API Mode: ${this.gatewayApiMode.toUpperCase()}`);
    this.logger.log(`Default model: ${defaultModel}`);
    this.initialized = true;
  }

  private ensureApiEnabled(): void {
    if (this.gatewayApiMode !== 'openai') {
      throw new NotFoundException(
        'OpenAI API mode is disabled. Set gateway.apiMode to openai to enable.',
      );
    }
  }

  private ensureProvider(): SupportedLLMProvider {
    if (!this.llmProvider) {
      throw new Error('LLM provider not initialized');
    }
    return this.llmProvider;
  }

  private getActiveProviderConfig(): Record<string, unknown> | undefined {
    if (this.providerContext?.providerConfig) {
      return this.providerContext.providerConfig;
    }
    const key = this.useCodexProvider
      ? 'codex'
      : this.useClaudeCodeProvider
        ? 'claudeCode'
        : 'openai';
    return this.configService.get<Record<string, unknown>>(key);
  }

  private resolveDefaultModel(config?: Record<string, unknown>): string {
    if (this.providerContext) {
      return this.providerResolver.resolveDefaultModel(this.providerContext);
    }
    const configured = (config?.model as string | undefined)?.trim();
    if (configured) {
      return configured;
    }
    if (this.useCodexProvider) {
      return 'gpt-5-codex';
    }
    if (this.useClaudeCodeProvider) {
      return 'claude-sonnet-4-20250514';
    }
    return 'gpt-4o-mini';
  }

  private normalizeChatCompletionRequest(
    payload: any,
    defaultModel: string,
  ): OpenAIRequest {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Request body must be a JSON object');
    }

    if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
      throw new BadRequestException('messages array is required');
    }

    const request: OpenAIRequest = {
      ...(payload as Record<string, unknown>),
      model:
        typeof payload.model === 'string' && payload.model.trim()
          ? payload.model
          : defaultModel,
      messages: payload.messages,
    } as OpenAIRequest;

    if (!request.model) {
      request.model = defaultModel;
    }
    return request;
  }

  private normalizeResponsesRequest(
    payload: any,
    defaultModel: string,
  ): OpenAIRequest {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Request body must be a JSON object');
    }

    if (Array.isArray(payload.messages) && payload.messages.length > 0) {
      return this.normalizeChatCompletionRequest(payload, defaultModel);
    }

    const request: OpenAIRequest = {
      model:
        typeof payload.model === 'string' && payload.model.trim()
          ? payload.model
          : defaultModel,
      messages: [],
      tools: payload.tools,
      tool_choice: payload.tool_choice,
      temperature: payload.temperature,
      top_p: payload.top_p,
      max_tokens: payload.max_output_tokens ?? payload.max_tokens,
      stop: payload.stop,
      user: payload.user,
    } as OpenAIRequest;

    const instructions = payload.instructions;
    if (typeof instructions === 'string' && instructions.trim()) {
      request.messages.push({
        role: 'system',
        content: instructions.trim(),
      });
    }

    const input = payload.input;
    if (Array.isArray(input) && input.length > 0) {
      const textParts: string[] = [];
      for (const block of input) {
        if (
          block &&
          block.type === 'input_text' &&
          typeof block.text === 'string'
        ) {
          textParts.push(block.text);
        }
      }
      if (textParts.length > 0) {
        request.messages.push({
          role: 'user',
          content: textParts.join('\n\n'),
        });
      }
    } else if (typeof input === 'string' && input.trim()) {
      request.messages.push({
        role: 'user',
        content: input.trim(),
      });
    }

    if (request.messages.length === 0) {
      throw new BadRequestException(
        'Either messages or input must be provided for the responses API',
      );
    }

    return request;
  }

  private isStreaming(payload: any): boolean {
    const value = payload?.stream;
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    }
    return false;
  }

  private async streamChatCompletion(
    provider: SupportedLLMProvider,
    request: OpenAIRequest,
    res: Response,
  ): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    try {
      for await (const chunk of provider.generateContentStream(request)) {
        if (res.destroyed || res.writableEnded) {
          break;
        }
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } catch (error) {
      this.logger.error('Streaming chat completion failed', error as Error);
      res.write(
        `data: ${JSON.stringify({
          error: {
            message:
              (error as Error).message || 'Streaming chat completion failed',
            type: 'internal_server_error',
          },
        })}\n\n`,
      );
      res.write('data: [DONE]\n\n');
    } finally {
      res.end();
    }
  }

  private async streamResponse(
    provider: SupportedLLMProvider,
    request: OpenAIRequest,
    originalPayload: any,
    res: Response,
  ): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    let accumulatedText = '';
    let responseId = `resp_${Date.now()}`;
    let responseModel = request.model;
    let usage: OpenAIUsage | undefined;

    try {
      for await (const chunk of provider.generateContentStream(request)) {
        if (res.destroyed || res.writableEnded) {
          break;
        }

        responseId = chunk.id || responseId;
        responseModel = chunk.model || responseModel;
        usage = this.mergeUsage(usage, chunk.usage);

        const content = this.extractDeltaContent(chunk);
        if (content) {
          accumulatedText += content;
          const payload = {
            type: 'response.delta',
            delta: {
              content: [
                {
                  type: 'output_text',
                  text: content,
                },
              ],
            },
            response: {
              id: responseId,
              object: 'response',
              model: responseModel,
            },
          };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
      }

      const completedPayload = {
        type: 'response.completed',
        response: {
          ...this.transformToResponsesPayload(
            {
              id: responseId,
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model: responseModel,
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: accumulatedText,
                  },
                  finish_reason: 'stop',
                },
              ],
              usage,
            } as OpenAIResponse,
            originalPayload,
          ),
          status: 'completed',
        },
      };

      res.write(`data: ${JSON.stringify(completedPayload)}\n\n`);
      res.write('data: [DONE]\n\n');
    } catch (error) {
      this.logger.error('Streaming responses endpoint failed', error as Error);
      const errorPayload = {
        type: 'response.error',
        error: {
          message:
            (error as Error).message || 'Streaming responses endpoint failed',
        },
      };
      res.write(`data: ${JSON.stringify(errorPayload)}\n\n`);
      res.write('data: [DONE]\n\n');
    } finally {
      res.end();
    }
  }

  private extractDeltaContent(chunk: OpenAIStreamChunk): string {
    if (!chunk?.choices?.length) {
      return '';
    }
    const choice = chunk.choices[0];
    if (!choice?.delta) {
      return '';
    }
    if (typeof choice.delta.content === 'string') {
      return choice.delta.content;
    }
    return '';
  }

  private mergeUsage(
    existing: OpenAIUsage | undefined,
    partial?: OpenAIStreamUsage,
  ): OpenAIUsage | undefined {
    if (!partial) {
      return existing;
    }

    const promptTokens = partial.prompt_tokens ?? existing?.prompt_tokens ?? 0;
    const completionTokens =
      partial.completion_tokens ?? existing?.completion_tokens ?? 0;
    const totalTokens =
      partial.total_tokens ??
      existing?.total_tokens ??
      promptTokens + completionTokens;

    return {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    };
  }

  private transformToResponsesPayload(
    response: OpenAIResponse,
    originalPayload: any,
  ): Record<string, unknown> {
    const primaryChoice = response.choices?.[0];
    const contentBlocks: Array<Record<string, unknown>> = [];

    if (primaryChoice?.message?.content) {
      contentBlocks.push({
        type: 'output_text',
        text: primaryChoice.message.content,
      });
    }

    if (primaryChoice?.message?.tool_calls?.length) {
      primaryChoice.message.tool_calls.forEach((toolCall) => {
        contentBlocks.push({
          type: 'tool_call',
          name: toolCall.function.name,
          args: toolCall.function.arguments,
        });
      });
    }

    return {
      id: response.id,
      object: 'response',
      created: response.created,
      model: response.model,
      usage: response.usage,
      status: 'completed',
      output: [
        {
          id: `${response.id}-message-0`,
          type: 'message',
          role: 'assistant',
          content: contentBlocks,
        },
      ],
      metadata: originalPayload?.metadata ?? {},
    };
  }
}
