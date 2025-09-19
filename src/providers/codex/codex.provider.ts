import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Readable } from 'node:stream';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import os from 'os';
import { readFileSync } from 'fs';
import {
  OpenAIMessage,
  OpenAIRequest,
  OpenAIToolCall,
} from '../../models/openai/openai-request.model';
import {
  OpenAIChoice,
  OpenAIResponse,
  OpenAIUsage,
  OpenAIStreamChunk,
} from '../../models/openai/openai-response.model';
import { CodexConfig } from '../../config/config.schema';
import { ChatGPTAuthManager } from './chatgpt-auth.manager';
import type { CodexReasoningConfig } from '../../config/global-config.interface';
import {
  CodexRequest,
  CodexInputItem,
  CodexMessageItem,
  CodexMessageContent,
  CodexFunctionCallItem,
  CodexFunctionCallOutputItem,
  CodexTool,
  CodexToolChoice,
} from '../../models/codex/codex-request.model';
import { CodexStreamEvent } from '../../models/codex/codex-stream-event.model';
import { GPT5_CODEX_BASE_INSTRUCTIONS } from '../../common/prompts/gpt5-codex-instructions';

const CODEX_VERSION = '0.38.0';
const DEFAULT_TERMINAL = 'WindowsTerminal';

interface ToolCallState {
  index: number;
  argumentsBuffer: string;
  hasStreamed: boolean;
}

interface ResolvedCodexConfig {
  authMode: 'ApiKey' | 'ChatGPT';
  apiKey?: string;
  baseURL: string;
  model: string;
  timeout: number;
  reasoning?: CodexReasoningConfig;
  textVerbosity?: 'low' | 'medium' | 'high';
}

interface CodexStreamContext {
  responseId: string;
  model: string;
  createdAt: number;
  accumulated: string;
  started: boolean;
  completed: boolean;
  finishReason?: 'stop' | 'tool_calls';
  usage?: OpenAIUsage;
  toolCalls: OpenAIToolCall[];
  toolCallState: Map<string, ToolCallState>;
  reasoningStates: Map<string, CodexReasoningState>;
}

interface CodexReasoningState {
  hasStreamed: boolean;
}

class CodexHttpError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Codex request failed (status ${status})`);
  }
}

@Injectable()
export class CodexProvider implements OnModuleInit {
  private readonly logger = new Logger(CodexProvider.name);
  private config?: ResolvedCodexConfig;
  private enabled = false;
  private initialized = false;
  private chatgptAuth?: ChatGPTAuthManager;
  private readonly conversationId = randomUUID();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.ensureInitialized();
  }

  private refreshConfig(): void {
    const activeProvider = (
      this.configService.get<string>('aiProvider') || 'openai'
    ).toLowerCase();
    if (activeProvider !== 'codex') {
      this.logger.debug(
        `Codex provider disabled because aiProvider is set to ${activeProvider}.`,
      );
      this.enabled = false;
      this.config = undefined;
      return;
    }

    const config = this.configService.get<CodexConfig>('codex');

    if (!config) {
      this.logger.log('Codex provider配置缺失，已禁用。');
      this.enabled = false;
      this.config = undefined;
      this.chatgptAuth = undefined;
      this.initialized = true;
      return;
    }

    const authMode =
      (config.authMode || 'ApiKey').toString().toLowerCase() === 'chatgpt'
        ? 'ChatGPT'
        : 'ApiKey';

    const resolved: ResolvedCodexConfig = {
      authMode,
      baseURL: config.baseURL || 'https://chatgpt.com/backend-api',
      model: config.model || 'gpt-5-codex',
      timeout: config.timeout || 60000,
      textVerbosity: config.textVerbosity,
    };
    if (config.reasoning) {
      resolved.reasoning = { ...config.reasoning };
    }

    if (authMode === 'ApiKey') {
      const apiKey = config.apiKey?.trim();
      if (!apiKey) {
        this.logger.log('Codex provider 缺少 API Key，已禁用。');
        this.enabled = false;
        this.config = undefined;
        this.chatgptAuth = undefined;
        this.initialized = true;
        return;
      }
      resolved.apiKey = apiKey;
      this.chatgptAuth = undefined;
      this.logger.log(
        `Codex provider 以 ApiKey 模式初始化，模型：${resolved.model} (${resolved.baseURL})`,
      );
    } else {
      this.chatgptAuth = new ChatGPTAuthManager(this.logger);
      this.logger.log(
        `Codex provider 以 ChatGPT 模式初始化，模型：${resolved.model} (${resolved.baseURL})`,
      );
    }

    this.config = resolved;
    this.enabled = true;
    this.initialized = true;
  }

  isEnabled(): boolean {
    this.ensureInitialized();
    return this.enabled;
  }

  getConfig(): ResolvedCodexConfig | undefined {
    this.ensureInitialized();
    return this.config;
  }

  async generateContent(request: OpenAIRequest): Promise<OpenAIResponse> {
    const config = this.ensureEnabledConfig();
    const payload = this.buildCodexPayload(request, config);
    const context = this.createStreamContext(config.model);

    try {
      for await (const chunk of this.streamCodexChunks(
        payload,
        config,
        context,
      )) {
        void chunk;
      }
    } catch (error: unknown) {
      throw this.transformError(error);
    }

    const toolCalls =
      context.toolCalls.length > 0 ? context.toolCalls : undefined;
    const message: OpenAIMessage = {
      role: 'assistant',
    };

    if (context.accumulated) {
      message.content = context.accumulated;
    }

    if (toolCalls) {
      message.tool_calls = toolCalls;
      if (!message.content) {
        message.content = undefined;
      }
    }

    this.logger.debug(
      `[CodexProvider] inbound response (non-stream): ${this.sanitizeForLog({
        responseId: context.responseId,
        finishReason: context.finishReason,
        hasToolCalls: !!toolCalls,
        contentPreview: context.accumulated,
      })}`,
    );

    const finishReason = toolCalls
      ? 'tool_calls'
      : (context.finishReason ?? 'stop');

    return {
      id: context.responseId,
      object: 'chat.completion',
      created: context.createdAt,
      model: config.model,
      choices: [
        {
          index: 0,
          message,
          finish_reason: finishReason,
        } as OpenAIChoice,
      ],
      usage: context.usage,
    };
  }

  async *generateContentStream(
    request: OpenAIRequest,
  ): AsyncIterable<OpenAIStreamChunk> {
    const config = this.ensureEnabledConfig();
    const payload = this.buildCodexPayload(request, config);
    const context = this.createStreamContext(config.model);

    try {
      for await (const chunk of this.streamCodexChunks(
        payload,
        config,
        context,
      )) {
        yield chunk;
      }
    } catch (error: unknown) {
      throw this.transformError(error);
    }
  }

  listModels(): Promise<unknown> {
    return Promise.resolve({ provider: 'codex', models: [this.config?.model] });
  }

  healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details?: unknown;
  }> {
    if (!this.isEnabled()) {
      return Promise.resolve({
        status: 'unhealthy',
        details: {
          provider: 'Codex',
          message: 'Codex provider disabled',
        },
      });
    }

    return Promise.resolve({
      status: 'healthy',
      details: {
        provider: 'Codex',
        baseURL: this.config?.baseURL,
        model: this.config?.model,
      },
    });
  }

  private ensureEnabledConfig(): ResolvedCodexConfig {
    this.ensureInitialized();
    if (!this.enabled || !this.config) {
      throw new Error('Codex provider is not enabled.');
    }

    if (
      this.config.authMode === 'ApiKey' &&
      (!this.config.apiKey || !this.config.apiKey.trim())
    ) {
      throw new Error('Codex provider ApiKey 模式缺少 API Key。');
    }

    const resolved: ResolvedCodexConfig = {
      authMode: this.config.authMode,
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL || 'https://chatgpt.com/backend-api',
      model: this.config.model || 'gpt-5-codex',
      timeout: this.config.timeout || 60000,
      textVerbosity: this.config.textVerbosity,
    };

    if (this.config.reasoning) {
      resolved.reasoning = { ...this.config.reasoning };
    }

    return resolved;
  }

  private buildCodexPayload(
    request: OpenAIRequest,
    config: ResolvedCodexConfig,
  ): CodexRequest {
    const { instructions, input } = this.transformMessages(request.messages);
    const tools = this.transformTools(request.tools);

    const payload: CodexRequest = {
      model: config.model,
      instructions,
      input,
      stream: true,
      store: false,
      include: ['reasoning.encrypted_content'],
      prompt_cache_key: this.conversationId,
      parallel_tool_calls: false,
    };

    if (tools.length > 0) {
      payload.tools = tools;
    }

    const toolChoice = this.transformToolChoice(request.tool_choice);
    if (toolChoice) {
      payload.tool_choice = toolChoice;
    }

    if (config.reasoning) {
      payload.reasoning = { ...config.reasoning };
    }

    const verbosity = config.textVerbosity;
    if (verbosity) {
      payload.text = { verbosity };
    }

    return payload;
  }

  private transformMessages(messages: OpenAIRequest['messages'] = []): {
    instructions: string;
    input: CodexInputItem[];
  } {
    const instructions = GPT5_CODEX_BASE_INSTRUCTIONS;
    const input: CodexInputItem[] = [];

    for (const message of messages) {
      // if (message.role === 'system' && message.content) {
      //   instructions += `\n\n${message.content}`;
      //   continue;
      // }

      if (message.role === 'system' && message.content) {
        const content = message.content;
        if (content) {
          input.push({
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `<system>${content}</system>`,
              } as CodexMessageContent,
            ],
          } as CodexMessageItem);
        }
        continue;
      }

      if (message.role === 'user') {
        const content = this.normalizeContent(message.content);
        if (content) {
          input.push({
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: content,
              } as CodexMessageContent,
            ],
          } as CodexMessageItem);
        }
        continue;
      }

      if (message.role === 'assistant') {
        if (Array.isArray(message.tool_calls)) {
          for (const toolCall of message.tool_calls) {
            if (!toolCall.function) continue;
            const callId = toolCall.id || randomUUID();
            const callItem: CodexFunctionCallItem = {
              type: 'function_call',
              call_id: callId,
              name: toolCall.function.name,
              arguments: toolCall.function.arguments || '{}',
            };
            input.push(callItem);
          }
        }

        const content = this.normalizeContent(message.content);
        if (content) {
          input.push({
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: content,
              } as CodexMessageContent,
            ],
          } as CodexMessageItem);
        }
        continue;
      }

      if (message.role === 'tool') {
        const result = this.normalizeContent(message.content);
        const callId = message.tool_call_id || randomUUID();
        const output: CodexFunctionCallOutputItem = {
          type: 'function_call_output',
          call_id: callId,
          output: result || '',
        };
        input.push(output);
      }
    }

    return { instructions, input };
  }

  private transformTools(
    openaiTools: OpenAIRequest['tools'] = [],
  ): CodexTool[] {
    return openaiTools.map((tool) => ({
      type: 'function',
      name: tool.function.name,
      description: tool.function.description,
      strict: false,
      parameters: tool.function.parameters || {},
    }));
  }

  private transformToolChoice(
    choice: OpenAIRequest['tool_choice'],
  ): CodexToolChoice | undefined {
    if (!choice) {
      return undefined;
    }

    if (choice === 'auto' || choice === 'none') {
      return choice;
    }

    if (typeof choice === 'object' && choice.type === 'function') {
      return {
        type: 'function',
        function: { name: choice.function.name },
      };
    }

    return undefined;
  }

  private normalizeContent(content?: string | null): string | undefined {
    if (content == null) {
      return undefined;
    }
    return content;
  }

  private createStreamContext(model: string): CodexStreamContext {
    return {
      responseId: randomUUID(),
      model,
      createdAt: Math.floor(Date.now() / 1000),
      accumulated: '',
      started: false,
      completed: false,
      finishReason: undefined,
      usage: undefined,
      toolCalls: [],
      toolCallState: new Map<string, ToolCallState>(),
      reasoningStates: new Map<string, CodexReasoningState>(),
    };
  }

  private async *streamCodexChunks(
    payload: CodexRequest,
    config: ResolvedCodexConfig,
    context: CodexStreamContext,
  ): AsyncGenerator<OpenAIStreamChunk> {
    const endpoint = this.resolveEndpoint(config.baseURL);
    const maxRetries = config.authMode === 'ChatGPT' ? 1 : 0;
    const requestBody = JSON.stringify(payload);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(
        () => controller.abort(),
        config.timeout,
      );

      let response: Response;
      try {
        const baseHeaders = await this.buildRequestHeaders(config);
        const requestHeaders: Record<string, string> = {
          ...baseHeaders,
          conversation_id: this.conversationId,
          session_id: this.conversationId,
        };

        this.logger.debug(
          `[CodexProvider] outbound request attempt=${attempt + 1} url=${endpoint} headers=${JSON.stringify(requestHeaders)} body=${requestBody}`,
        );

        response = await fetch(endpoint, {
          method: 'POST',
          headers: requestHeaders,
          body: requestBody,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutHandle);
      }

      if (!response.ok) {
        const status = response.status;

        if (
          status === 401 &&
          config.authMode === 'ChatGPT' &&
          this.chatgptAuth &&
          attempt < maxRetries
        ) {
          await this.chatgptAuth.refreshAuthTokens();
          continue;
        }

        const body = await response.text().catch(() => '');
        throw new CodexHttpError(status, body || response.statusText);
      }

      if (!response.body) {
        throw new Error('Codex response body is empty');
      }

      const stream = Readable.fromWeb(
        response.body as unknown as NodeReadableStream<Uint8Array>,
      );

      for await (const event of this.parseSSE(stream)) {
        if (event === '[DONE]') {
          break;
        }
        const chunk = this.mapEventToChunk(event as CodexStreamEvent, context);
        if (chunk) {
          yield chunk;
        }
      }

      if (!context.completed) {
        yield this.createCompletionChunk(context);
        context.completed = true;
      }

      return;
    }

    throw new Error('Codex request failed after retries');
  }

  private async *parseSSE(stream: Readable): AsyncGenerator<any> {
    let buffer = '';

    for await (const chunk of stream) {
      buffer += chunk.toString('utf8');

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');

        if (!rawEvent) {
          continue;
        }

        const dataLines = rawEvent
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .filter(Boolean);

        if (dataLines.length === 0) {
          continue;
        }

        const data = dataLines.join('\n');
        if (data === '[DONE]') {
          yield '[DONE]';
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          this.logCodexResponseEvent(parsed);
          yield parsed;
        } catch (error: unknown) {
          this.logger.warn(`Failed to parse Codex SSE chunk: ${String(error)}`);
        }
      }
    }
  }

  private sanitizeForLog(value: unknown, maxLength = 500): string {
    let stringified: string;
    if (typeof value === 'string') {
      stringified = value;
    } else {
      try {
        stringified = JSON.stringify(value);
      } catch {
        stringified = String(value);
      }
    }

    if (stringified.length > maxLength) {
      return `${stringified.slice(0, maxLength)}…`;
    }
    return stringified;
  }

  private logCodexResponseEvent(event: unknown): void {
    if (!event || typeof event !== 'object') {
      this.logger.debug(
        `[CodexProvider] inbound event: ${this.sanitizeForLog(event)}`,
      );
      return;
    }

    const eventObj = event as Record<string, unknown>;
    const type = typeof eventObj.type === 'string' ? eventObj.type : 'unknown';

    let preview: unknown;
    if (typeof eventObj.delta === 'string') {
      preview = eventObj.delta;
    } else if (
      eventObj.delta &&
      typeof (eventObj.delta as Record<string, unknown>).text === 'string'
    ) {
      preview = (eventObj.delta as Record<string, unknown>).text;
    } else if (typeof eventObj.text === 'string') {
      preview = eventObj.text;
    } else {
      const item = eventObj.item as
        | { content?: Array<{ text?: string }> }
        | undefined;
      if (
        item &&
        Array.isArray(item.content) &&
        typeof item.content[0]?.text === 'string'
      ) {
        preview = item.content[0]?.text;
      }
    }

    const previewText = preview ? this.sanitizeForLog(preview, 200) : '∅';

    this.logger.debug(
      `[CodexProvider] inbound event type=${type} preview=${previewText}`,
    );
  }

  private mapEventToChunk(
    event: CodexStreamEvent,
    context: CodexStreamContext,
  ): OpenAIStreamChunk | null {
    const eventType = event.type ?? '';

    if (
      eventType === 'response.reasoning_text.delta' ||
      eventType === 'response.reasoning_text.done' ||
      eventType === 'response.reasoning_summary_text.delta' ||
      eventType === 'response.reasoning_summary_text.done'
    ) {
      const reasoningChunk = this.handleReasoningEvent(event, context);
      return reasoningChunk;
    }

    if (eventType === 'response.completed') {
      const usageRaw = (event.response?.usage ?? {}) as {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
      };
      context.usage = {
        prompt_tokens: usageRaw.input_tokens ?? usageRaw.prompt_tokens ?? 0,
        completion_tokens:
          usageRaw.output_tokens ?? usageRaw.completion_tokens ?? 0,
        total_tokens:
          usageRaw.total_tokens ??
          (usageRaw.input_tokens ?? usageRaw.prompt_tokens ?? 0) +
            (usageRaw.output_tokens ?? usageRaw.completion_tokens ?? 0),
      };
      context.completed = true;
      context.finishReason = context.finishReason ?? 'stop';
      return this.createCompletionChunk(context);
    }

    if (eventType === 'response.function_call_arguments.delta') {
      const deltaPayload = event.delta;

      let fragment = '';
      let callId: string | undefined;
      let name: string | undefined;

      if (typeof deltaPayload === 'string') {
        fragment = deltaPayload;
      } else if (deltaPayload) {
        if (typeof deltaPayload.arguments === 'string') {
          fragment = deltaPayload.arguments;
        }
        if (typeof deltaPayload.call_id === 'string') {
          callId = deltaPayload.call_id;
        }
        if (typeof deltaPayload.name === 'string') {
          name = deltaPayload.name;
        }
      }

      if (!callId && typeof event.item?.call_id === 'string') {
        callId = event.item.call_id;
      }

      if (!callId || !fragment) {
        return null;
      }

      const { toolCall, state } = this.getOrCreateToolCall(
        context,
        callId,
        name,
      );
      state.argumentsBuffer += fragment;
      toolCall.function.arguments = state.argumentsBuffer;
      context.finishReason = 'tool_calls';

      const firstChunk = !context.started;
      if (firstChunk) {
        context.started = true;
      }

      state.hasStreamed = true;

      const chunk: OpenAIStreamChunk = {
        id: context.responseId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: context.model,
        choices: [
          {
            index: 0,
            delta: {
              ...(firstChunk ? { role: 'assistant' as const } : {}),
              tool_calls: [
                {
                  index: state.index,
                  id: toolCall.id,
                  type: toolCall.type,
                  function: {
                    name: toolCall.function.name,
                    arguments: fragment,
                  },
                },
              ],
            },
          },
        ],
      };

      return chunk;
    }

    if (eventType === 'response.output_item.done' && event.item) {
      const itemType = event.item.type;

      if (itemType === 'function_call') {
        const callId =
          typeof event.item.call_id === 'string'
            ? event.item.call_id
            : randomUUID();
        const name =
          typeof event.item.name === 'string' ? event.item.name : undefined;
        const argsRaw =
          typeof event.item.arguments === 'string'
            ? event.item.arguments
            : event.item.arguments
              ? JSON.stringify(event.item.arguments)
              : '';

        const { toolCall, state } = this.getOrCreateToolCall(
          context,
          callId,
          name,
        );

        if (name) {
          toolCall.function.name = name;
        }

        if (argsRaw) {
          state.argumentsBuffer = argsRaw;
          toolCall.function.arguments = argsRaw;
        }

        context.finishReason = 'tool_calls';

        if (!state.hasStreamed && argsRaw) {
          const firstChunk = !context.started;
          if (firstChunk) {
            context.started = true;
          }
          state.hasStreamed = true;

          return {
            id: context.responseId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: context.model,
            choices: [
              {
                index: 0,
                delta: {
                  ...(firstChunk ? { role: 'assistant' as const } : {}),
                  tool_calls: [
                    {
                      index: state.index,
                      id: toolCall.id,
                      type: toolCall.type,
                      function: {
                        name: toolCall.function.name,
                        arguments: argsRaw,
                      },
                    },
                  ],
                },
              },
            ],
          };
        }

        return null;
      }

      if (itemType === 'message' && event.item.content?.length) {
        const text = event.item.content
          .filter((part) => part?.type === 'output_text' && part.text)
          .map((part) => part.text as string)
          .join('');

        if (text) {
          if (context.accumulated.length > 0) {
            // 已经通过增量流传递过文本，这里仅用于完善最终结果
            return null;
          }
          const firstChunk = !context.started;
          if (firstChunk) {
            context.started = true;
          }
          context.accumulated += text;

          return {
            id: context.responseId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: context.model,
            choices: [
              {
                index: 0,
                delta: {
                  ...(firstChunk ? { role: 'assistant' as const } : {}),
                  content: text,
                },
              },
            ],
          };
        }
      }

      return null;
    }

    const delta = this.extractDeltaText(event);
    if (!delta) {
      return null;
    }

    let normalizedDelta = delta;
    if (context.accumulated.length > 0) {
      if (normalizedDelta.startsWith(context.accumulated)) {
        normalizedDelta = normalizedDelta.slice(context.accumulated.length);
      } else if (context.accumulated.endsWith(normalizedDelta)) {
        return null;
      }
    }

    if (!normalizedDelta) {
      return null;
    }

    const firstChunk = !context.started;
    if (firstChunk) {
      context.started = true;
    }

    context.accumulated += normalizedDelta;

    const chunk: OpenAIStreamChunk = {
      id: (event.response?.id as string) || context.responseId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: context.model,
      choices: [
        {
          index: 0,
          delta: {
            ...(firstChunk ? { role: 'assistant' as const } : {}),
            content: normalizedDelta,
          },
        },
      ],
    };

    return chunk;
  }

  private handleReasoningEvent(
    event: CodexStreamEvent,
    context: CodexStreamContext,
  ): OpenAIStreamChunk | null {
    const text = this.extractReasoningText(event);
    if (!text) {
      return null;
    }

    const key = this.getReasoningStateKey(event);
    if (key) {
      const state = this.getOrCreateReasoningState(context, key);
      if (
        (event.type === 'response.reasoning_text.done' ||
          event.type === 'response.reasoning_summary_text.done') &&
        state.hasStreamed
      ) {
        return null;
      }
      state.hasStreamed = true;
    }

    return this.buildReasoningChunk(context, text);
  }

  private getReasoningStateKey(event: CodexStreamEvent): string | null {
    const itemId = event.item_id;
    if (!itemId) {
      return null;
    }

    const outputIndex =
      typeof event.output_index === 'number' ? event.output_index : 0;
    const contentIndex =
      typeof event.content_index === 'number' ? event.content_index : 0;

    return `${itemId}:${outputIndex}:${contentIndex}`;
  }

  private getOrCreateReasoningState(
    context: CodexStreamContext,
    key: string,
  ): CodexReasoningState {
    if (!context.reasoningStates.has(key)) {
      context.reasoningStates.set(key, { hasStreamed: false });
    }
    return context.reasoningStates.get(key)!;
  }

  private extractReasoningText(event: CodexStreamEvent): string | undefined {
    if (
      event.type === 'response.reasoning_text.delta' ||
      event.type === 'response.reasoning_summary_text.delta'
    ) {
      if (typeof event.delta === 'string') {
        return event.delta;
      }
      if (
        event.delta &&
        typeof (event.delta as { delta?: string }).delta === 'string'
      ) {
        return (event.delta as { delta?: string }).delta;
      }
      if (
        event.delta &&
        typeof (event.delta as { text?: string }).text === 'string'
      ) {
        return (event.delta as { text?: string }).text;
      }
    }

    if (
      event.type === 'response.reasoning_text.done' ||
      event.type === 'response.reasoning_summary_text.done'
    ) {
      if (typeof event.text === 'string') {
        return event.text;
      }
      if (typeof event.delta === 'string') {
        return event.delta;
      }
      if (
        event.delta &&
        typeof (event.delta as { text?: string }).text === 'string'
      ) {
        return (event.delta as { text?: string }).text;
      }
    }

    return undefined;
  }

  private buildReasoningChunk(
    context: CodexStreamContext,
    text: string,
  ): OpenAIStreamChunk {
    const firstChunk = !context.started;
    if (firstChunk) {
      context.started = true;
    }

    return {
      id: context.responseId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: context.model,
      choices: [
        {
          index: 0,
          delta: {
            ...(firstChunk ? { role: 'assistant' as const } : {}),
            reasoning_content: text,
          },
        },
      ],
    };
  }

  private createCompletionChunk(
    context: CodexStreamContext,
  ): OpenAIStreamChunk {
    return {
      id: context.responseId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: context.model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: context.finishReason ?? 'stop',
        },
      ],
      usage: context.usage,
    };
  }

  private extractDeltaText(event: CodexStreamEvent): string | undefined {
    if (!event) {
      return undefined;
    }

    if (event.delta) {
      if (typeof event.delta === 'string') {
        return event.delta;
      }
      if (typeof event.delta.text === 'string') {
        return event.delta.text;
      }
    }

    if (typeof event.text === 'string') {
      return event.text;
    }

    if (typeof event.content === 'string') {
      return event.content;
    }

    if (event.message?.content?.length) {
      const part = event.message.content[0];
      if (typeof part?.text === 'string') {
        return part.text;
      }
    }

    return undefined;
  }

  private getOrCreateToolCall(
    context: CodexStreamContext,
    callId: string,
    name?: string,
  ): { toolCall: OpenAIToolCall; state: ToolCallState } {
    const effectiveName = name?.trim() || 'function';
    let state = context.toolCallState.get(callId);
    if (!state) {
      const index = context.toolCalls.length;
      const toolCall: OpenAIToolCall = {
        id: callId,
        type: 'function',
        function: {
          name: effectiveName,
          arguments: '',
        },
      };
      context.toolCalls.push(toolCall);
      state = {
        index,
        argumentsBuffer: '',
        hasStreamed: false,
      };
      context.toolCallState.set(callId, state);
      return { toolCall, state };
    }

    const toolCall = context.toolCalls[state.index];
    if (
      name &&
      (!toolCall.function.name || toolCall.function.name === 'function')
    ) {
      toolCall.function.name = effectiveName;
    }

    return { toolCall, state };
  }

  private transformError(error: unknown): Error {
    if (error instanceof CodexHttpError) {
      const err = new Error(
        `Codex request failed (status ${error.status}): ${error.body}`,
      );
      (err as { status?: number }).status = error.status;
      return err;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      return new Error('Codex request aborted due to timeout');
    }

    if (error instanceof Error) {
      return error;
    }

    return new Error(String(error));
  }

  private resolveEndpoint(baseURL: string): string {
    const normalized = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
    return `${normalized}/responses`;
  }

  private async buildRequestHeaders(
    config: ResolvedCodexConfig,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'User-Agent': this.buildUserAgent(),
      originator: 'codex_cli_rs',
      version: CODEX_VERSION,
      'OpenAI-Beta': 'responses=experimental',
    };

    if (config.authMode === 'ApiKey') {
      if (!config.apiKey) {
        throw new Error('Codex ApiKey 模式缺少 API Key');
      }
      headers.Authorization = `Bearer ${config.apiKey}`;
      return headers;
    }

    if (!this.chatgptAuth) {
      throw new Error('ChatGPT 认证未初始化');
    }

    const { authorization, accountId } =
      await this.chatgptAuth.getAuthHeaders();
    headers.Authorization = authorization;
    if (accountId) {
      headers['chatgpt-account-id'] = accountId;
    }
    return headers;
  }

  private buildUserAgent(): string {
    const osLabel = this.detectOsLabel();
    const arch = this.normalizeArch(os.arch());
    const terminal = this.detectTerminal();
    return `codex_cli_rs/${CODEX_VERSION} (${osLabel}; ${arch}) ${terminal}`;
  }

  private detectOsLabel(): string {
    if (process.platform === 'linux') {
      try {
        const osRelease = readFileSync('/etc/os-release', 'utf-8');
        const match = osRelease.match(/^PRETTY_NAME="?(.+?)"?$/m);
        if (match?.[1]) {
          return match[1];
        }
      } catch (error) {
        this.logger.debug(`Failed to read /etc/os-release: ${String(error)}`);
      }
    }

    if (process.platform === 'darwin') {
      return `macOS ${os.release()}`;
    }

    if (process.platform === 'win32') {
      return `Windows ${os.release()}`;
    }

    return `${os.type()} ${os.release()}`;
  }

  private normalizeArch(arch: string): string {
    switch (arch) {
      case 'x64':
        return 'x86_64';
      case 'arm64':
        return 'aarch64';
      default:
        return arch;
    }
  }

  private detectTerminal(): string {
    const termProgram = process.env.TERM_PROGRAM;
    if (termProgram && termProgram.trim()) {
      return termProgram;
    }

    const term = process.env.TERM;
    if (term && term.trim()) {
      return term;
    }

    return DEFAULT_TERMINAL;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      this.refreshConfig();
    }
  }
}
