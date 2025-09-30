import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Readable } from 'node:stream';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { GeminiRequestDto } from '../../models/gemini/gemini-request.dto';
import { GeminiResponseDto } from '../../models/gemini/gemini-response.dto';
import { RequestTransformer } from '../../transformers/request.transformer';
import { ResponseTransformer } from '../../transformers/response.transformer';
import { StreamTransformer } from '../../transformers/stream.transformer';
import { TokenizerService } from '../../services/tokenizer.service';
import { ToolCallProcessor } from '../../utils/zhipu/ToolCallProcessor';
import {
  OpenAIMessage,
  OpenAIRequest,
  OpenAITool,
  OpenAIToolCall,
} from '../../models/openai/openai-request.model';
import {
  OpenAIResponse,
  OpenAIStreamChunk,
} from '../../models/openai/openai-response.model';

interface ResolvedClaudeCodeConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  timeout: number;
  anthropicVersion: string;
  beta?: string[];
  userAgent: string;
  xApp: string;
  dangerousDirectBrowserAccess: boolean;
  maxOutputTokens?: number;
  extraHeaders?: Record<string, string>;
}

interface ClaudeMessageResponse {
  id: string;
  model: string;
  role: 'assistant';
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
  >;
  stop_reason?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

interface ClaudeStreamContext {
  responseId: string;
  model: string;
  created: number;
  started: boolean;
  toolCallStates: Map<number, ToolCallState>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  finishReason?: 'stop' | 'tool_calls' | 'length';
  finalChunkSent: boolean;
}

interface ToolCallState {
  index: number;
  anthropicId: string;
  openaiId: string;
  name?: string;
  arguments: string;
}

class ClaudeRequestError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Claude Code request failed with status ${status}`);
  }
}

@Injectable()
export class ClaudeCodeProvider implements OnModuleInit {
  private readonly logger = new Logger(ClaudeCodeProvider.name);
  private config?: ResolvedClaudeCodeConfig;
  private enabled = false;
  private initialized = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly requestTransformer: RequestTransformer,
    private readonly responseTransformer: ResponseTransformer,
    private readonly tokenizerService: TokenizerService,
    private readonly toolCallProcessor: ToolCallProcessor,
  ) {}

  onModuleInit(): void {
    this.ensureInitialized();
  }

  isEnabled(): boolean {
    this.ensureInitialized();
    return this.enabled;
  }

  getConfig(): ResolvedClaudeCodeConfig | undefined {
    this.ensureInitialized();
    return this.config;
  }

  async generateFromGemini(
    geminiRequest: GeminiRequestDto,
    targetModel: string,
  ): Promise<GeminiResponseDto> {
    const config = this.ensureEnabledConfig();
    const openAIRequest = this.prepareOpenAIRequest(geminiRequest, targetModel);
    const payload = this.buildClaudePayload(openAIRequest, config, false);

    const response = await this.sendClaudeMessagesRequest(
      payload,
      config,
      false,
    );

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = (await response.json()) as ClaudeMessageResponse;
    const openAIResponse = this.convertClaudeResponseToOpenAI(
      data,
      config.model,
    );
    return this.responseTransformer.transformResponse(
      openAIResponse,
    ) as GeminiResponseDto;
  }

  async *streamFromGemini(
    geminiRequest: GeminiRequestDto,
    targetModel: string,
  ): AsyncIterable<GeminiResponseDto> {
    const config = this.ensureEnabledConfig();
    const openAIRequest = this.prepareOpenAIRequest(geminiRequest, targetModel);
    openAIRequest.stream = true;

    const payload = this.buildClaudePayload(openAIRequest, config, true);
    const response = await this.sendClaudeMessagesRequest(
      payload,
      config,
      true,
    );

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    if (!response.body) {
      throw new Error('Claude Code streaming response body is empty');
    }

    const stream = Readable.fromWeb(
      response.body as unknown as NodeReadableStream<Uint8Array>,
    );

    const context: ClaudeStreamContext = {
      responseId: randomUUID(),
      model: config.model,
      created: Math.floor(Date.now() / 1000),
      started: false,
      toolCallStates: new Map(),
      finalChunkSent: false,
    };

    const streamTransformer = new StreamTransformer(
      this.tokenizerService,
      this.toolCallProcessor,
    );
    const promptTokenCount = this.computePromptTokens(
      geminiRequest,
      targetModel,
    );
    streamTransformer.initializeForModel(targetModel, promptTokenCount);

    for await (const chunk of this.parseClaudeStream(stream, context)) {
      const geminiChunk = streamTransformer.transformStreamChunk(chunk);
      yield geminiChunk;
    }

    const bufferedText = streamTransformer.getBufferedText();
    if (bufferedText) {
      const finalChunk: GeminiResponseDto = {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: bufferedText }],
            },
            index: 0,
            finishReason: 'STOP',
          },
        ],
      } as GeminiResponseDto;

      streamTransformer.applyUsageMetadata(
        finalChunk as unknown as Record<string, unknown>,
      );
      yield finalChunk;
    }

    streamTransformer.reset();
  }

  async generateContent(request: OpenAIRequest): Promise<OpenAIResponse> {
    const config = this.ensureEnabledConfig();
    const openAIRequest: OpenAIRequest = {
      ...request,
      stream: false,
    };
    const payload = this.buildClaudePayload(openAIRequest, config, false);
    const response = await this.sendClaudeMessagesRequest(
      payload,
      config,
      false,
    );

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = (await response.json()) as ClaudeMessageResponse;
    return this.convertClaudeResponseToOpenAI(data, config.model);
  }

  async *generateContentStream(
    request: OpenAIRequest,
  ): AsyncIterable<OpenAIStreamChunk> {
    const config = this.ensureEnabledConfig();
    const openAIRequest: OpenAIRequest = {
      ...request,
      stream: true,
    };

    const payload = this.buildClaudePayload(openAIRequest, config, true);
    const response = await this.sendClaudeMessagesRequest(
      payload,
      config,
      true,
    );

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    if (!response.body) {
      throw new Error('Claude Code streaming response body is empty');
    }

    const stream = Readable.fromWeb(
      response.body as unknown as NodeReadableStream<Uint8Array>,
    );

    const context: ClaudeStreamContext = {
      responseId: randomUUID(),
      model: config.model,
      created: Math.floor(Date.now() / 1000),
      started: false,
      toolCallStates: new Map(),
      finalChunkSent: false,
    };

    for await (const chunk of this.parseClaudeStream(stream, context)) {
      yield chunk;
    }
  }

  listModels(): Promise<unknown> {
    const config = this.ensureEnabledConfig();
    return Promise.resolve([
      {
        id: config.model,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'claude-code',
      },
    ]);
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details?: unknown;
  }> {
    try {
      const config = this.ensureEnabledConfig();
      const url = this.buildUrl(config.baseURL, 'v1/models?limit=1');
      const headers = this.buildHeaders(false, config);
      delete headers['content-type'];

      const controller = new AbortController();
      const timeoutHandle = setTimeout(
        () => controller.abort(),
        config.timeout,
      );

      try {
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          await this.handleErrorResponse(response);
        }
      } finally {
        clearTimeout(timeoutHandle);
      }

      return {
        status: 'healthy',
        details: {
          provider: 'Claude Code',
          baseURL: config.baseURL,
          model: config.model,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          provider: 'Claude Code',
          error: (error as Error).message,
        },
      };
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      this.refreshConfig();
    }
  }

  private ensureEnabledConfig(): ResolvedClaudeCodeConfig {
    this.ensureInitialized();
    if (!this.enabled || !this.config) {
      throw new Error('Claude Code provider is not enabled.');
    }
    return this.config;
  }

  private prepareOpenAIRequest(
    geminiRequest: GeminiRequestDto,
    targetModel: string,
  ): OpenAIRequest {
    return this.requestTransformer.transformRequest(geminiRequest, targetModel);
  }

  private refreshConfig(): void {
    const providerInput =
      this.configService.get<string>('aiProvider') || 'claudeCode';
    const normalizedProvider = providerInput.trim().toLowerCase();

    if (
      normalizedProvider !== 'claudecode' &&
      normalizedProvider !== 'claude-code'
    ) {
      this.enabled = false;
      this.config = undefined;
      this.initialized = true;
      return;
    }

    const rawConfig =
      this.configService.get<ResolvedClaudeCodeConfig>('claudeCode');

    if (!rawConfig) {
      this.logger.error(
        'Claude Code provider configuration missing; disabling provider.',
      );
      this.enabled = false;
      this.config = undefined;
      this.initialized = true;
      return;
    }

    if (!rawConfig.apiKey || !rawConfig.apiKey.trim()) {
      this.logger.error(
        'Claude Code provider is missing an API key; disabling provider.',
      );
      this.enabled = false;
      this.config = undefined;
      this.initialized = true;
      return;
    }

    const resolved: ResolvedClaudeCodeConfig = {
      apiKey: rawConfig.apiKey.trim(),
      baseURL: rawConfig.baseURL || 'https://open.bigmodel.cn/api/anthropic',
      model: rawConfig.model || 'claude-sonnet-4-5-20250929',
      timeout: rawConfig.timeout ?? 1800000,
      anthropicVersion: rawConfig.anthropicVersion || '2023-06-01',
      beta: rawConfig.beta,
      userAgent: rawConfig.userAgent || 'claude-cli/2.0.1 (external, cli)',
      xApp: rawConfig.xApp || 'cli',
      dangerousDirectBrowserAccess:
        rawConfig.dangerousDirectBrowserAccess ?? true,
      maxOutputTokens: rawConfig.maxOutputTokens,
      extraHeaders: rawConfig.extraHeaders,
    };

    this.config = resolved;
    this.enabled = true;
    this.initialized = true;

    this.logger.log(
      `Claude Code provider initialized with model: ${resolved.model}`,
    );
  }

  private buildClaudePayload(
    request: OpenAIRequest,
    config: ResolvedClaudeCodeConfig,
    stream: boolean,
  ): Record<string, unknown> {
    const { messages, system } = this.transformMessages(request.messages);
    const tools = this.transformTools(request.tools);

    const payload: Record<string, unknown> = {
      model: config.model,
      messages,
      stream,
      max_tokens: request.max_tokens ?? config.maxOutputTokens ?? 4096,
    };

    if (request.temperature !== undefined) {
      payload.temperature = request.temperature;
    }
    if (request.top_p !== undefined) {
      payload.top_p = request.top_p;
    }
    if (system) {
      payload.system = system;
    }
    if (tools && tools.length > 0) {
      payload.tools = tools;
    }

    const toolChoice = this.transformToolChoice(request.tool_choice);
    if (toolChoice) {
      payload.tool_choice = toolChoice;
    }

    if (request.stop) {
      payload.stop_sequences = Array.isArray(request.stop)
        ? request.stop
        : [request.stop];
    }

    return payload;
  }

  private transformMessages(messages: OpenAIMessage[] = []): {
    messages: Array<{
      role: 'user' | 'assistant';
      content:
        | string
        | Array<
            | { type: 'text'; text: string }
            | { type: 'tool_use'; id: string; name: string; input: unknown }
            | { type: 'tool_result'; tool_use_id: string; content: string }
          >;
    }>;
    system?: string;
  } {
    const anthropicMessages: Array<{
      role: 'user' | 'assistant';
      content:
        | string
        | Array<
            | { type: 'text'; text: string }
            | { type: 'tool_use'; id: string; name: string; input: unknown }
            | { type: 'tool_result'; tool_use_id: string; content: string }
          >;
    }> = [];

    const systemPrompts: string[] = [];
    let pendingToolResults: Array<{
      type: 'tool_result';
      tool_use_id: string;
      content: string;
    }> = [];

    const flushToolResults = () => {
      if (pendingToolResults.length > 0) {
        anthropicMessages.push({
          role: 'user',
          content: pendingToolResults,
        });
        pendingToolResults = [];
      }
    };

    for (const message of messages) {
      if (message.role === 'system' && typeof message.content === 'string') {
        systemPrompts.push(message.content.trim());
        continue;
      }

      if (message.role === 'user') {
        flushToolResults();
        const textContent = this.extractTextContent(message.content);
        if (textContent.trim().length > 0) {
          anthropicMessages.push({
            role: 'user',
            content: textContent,
          });
        }
        continue;
      }

      if (message.role === 'assistant') {
        flushToolResults();
        const text = this.extractTextContent(message.content);
        const toolCalls = Array.isArray(message.tool_calls)
          ? message.tool_calls
          : [];

        if (toolCalls.length === 0) {
          if (text.trim().length > 0) {
            anthropicMessages.push({
              role: 'assistant',
              content: text,
            });
          }
          continue;
        }

        const blocks: Array<
          | { type: 'text'; text: string }
          | { type: 'tool_use'; id: string; name: string; input: unknown }
        > = [];

        if (text.trim()) {
          blocks.push({ type: 'text', text });
        }

        for (const toolCall of toolCalls) {
          const id = this.normalizeToAnthropicToolId(
            toolCall.id || randomUUID(),
          );
          let input: unknown = {};
          if (toolCall.function?.arguments) {
            input = this.parseJson(toolCall.function.arguments);
          }
          blocks.push({
            type: 'tool_use',
            id,
            name: toolCall.function?.name || 'tool',
            input,
          });
        }

        anthropicMessages.push({
          role: 'assistant',
          content: blocks,
        });
        continue;
      }

      if (message.role === 'tool') {
        const toolResultId = this.normalizeToAnthropicToolId(
          message.tool_call_id || randomUUID(),
        );
        const content = this.normalizeToolResultContent(message.content);
        pendingToolResults.push({
          type: 'tool_result',
          tool_use_id: toolResultId,
          content,
        });
      }
    }

    flushToolResults();

    if (anthropicMessages.length === 0) {
      anthropicMessages.push({ role: 'user', content: 'Hello' });
    }

    if (anthropicMessages[0]?.role !== 'user') {
      anthropicMessages.unshift({ role: 'user', content: 'Continue' });
    }

    const system =
      systemPrompts.length > 0 ? systemPrompts.join('\n\n') : undefined;

    return { messages: anthropicMessages, system };
  }

  private transformTools(tools?: OpenAITool[]):
    | Array<{
        name: string;
        description?: string;
        input_schema: Record<string, unknown>;
      }>
    | undefined {
    if (!tools || tools.length === 0) {
      return undefined;
    }

    return tools.map((tool) => {
      const inputSchema =
        tool.function?.parameters &&
        typeof tool.function.parameters === 'object'
          ? { ...tool.function.parameters }
          : { type: 'object' };
      if (!inputSchema.type) {
        inputSchema.type = 'object';
      }
      return {
        name: tool.function?.name || 'tool',
        description: tool.function?.description,
        input_schema: inputSchema,
      };
    });
  }

  private extractTextContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }
    if (!content) {
      return '';
    }
    if (Array.isArray(content)) {
      return content
        .map((part) => this.extractTextFromPart(part))
        .filter((value): value is string => value.length > 0)
        .join('');
    }
    const single = this.extractTextFromPart(content);
    return single;
  }

  private extractTextFromPart(part: unknown): string {
    if (!part) {
      return '';
    }
    if (typeof part === 'string') {
      return part;
    }
    if (typeof part !== 'object') {
      return '';
    }
    const candidate = part as {
      text?: unknown;
      value?: unknown;
      input_text?: unknown;
    };
    if (typeof candidate.text === 'string') {
      return candidate.text;
    }
    if (typeof candidate.value === 'string') {
      return candidate.value;
    }
    if (typeof candidate.input_text === 'string') {
      return candidate.input_text;
    }
    try {
      return JSON.stringify(part);
    } catch {
      return '';
    }
  }

  private transformToolChoice(
    toolChoice: OpenAIRequest['tool_choice'],
  ): Record<string, unknown> | undefined {
    if (!toolChoice || toolChoice === 'auto') {
      return undefined;
    }
    if (toolChoice === 'none') {
      return { type: 'none' };
    }
    if (
      typeof toolChoice === 'object' &&
      toolChoice.type === 'function' &&
      toolChoice.function?.name
    ) {
      return {
        type: 'tool',
        name: toolChoice.function.name,
      };
    }
    return undefined;
  }

  private buildHeaders(
    stream: boolean,
    config: ResolvedClaudeCodeConfig,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: stream ? 'text/event-stream' : 'application/json',
      'anthropic-version': config.anthropicVersion,
      'x-api-key': config.apiKey,
      'user-agent': config.userAgent,
      'x-app': config.xApp,
      'anthropic-dangerous-direct-browser-access':
        config.dangerousDirectBrowserAccess ? 'true' : 'false',
      'x-stainless-lang': 'js',
      'x-stainless-package-version': '0.60.0',
      'x-stainless-runtime': 'node',
      'x-stainless-runtime-version': process.version,
      'x-stainless-os': this.normalizeOS(process.platform),
      'x-stainless-arch': process.arch,
      'x-stainless-timeout': String(
        Math.ceil((config.timeout ?? 1800000) / 1000),
      ),
      'x-stainless-retry-count': '0',
    };

    if (stream) {
      headers['x-stainless-helper-method'] = 'stream';
    }

    if (config.beta && config.beta.length > 0) {
      headers['anthropic-beta'] = config.beta.join(',');
    }

    if (config.extraHeaders) {
      for (const [key, value] of Object.entries(config.extraHeaders)) {
        if (value !== undefined && value !== null) {
          headers[key] = value;
        }
      }
    }

    return headers;
  }

  private sanitizeHeaders(
    headers: Record<string, string>,
  ): Record<string, string> {
    const sanitized: Record<string, string> = { ...headers };
    const sensitiveKeys = ['x-api-key', 'authorization'];
    for (const key of sensitiveKeys) {
      if (sanitized[key]) {
        sanitized[key] = '***';
      }
    }
    return sanitized;
  }

  private async sendClaudeMessagesRequest(
    payload: Record<string, unknown>,
    config: ResolvedClaudeCodeConfig,
    stream: boolean,
  ): Promise<Response> {
    const url = this.buildUrl(config.baseURL, 'v1/messages');
    const headers = this.buildHeaders(stream, config);
    const sanitizedHeaders = this.sanitizeHeaders(headers);

    try {
      this.logger.verbose(
        `ClaudeCodeProvider -> 请求: ${url.toString()} ${JSON.stringify(payload)}`,
      );
      this.logger.verbose(
        `ClaudeCodeProvider -> 请求头: ${JSON.stringify(sanitizedHeaders)}`,
      );
    } catch (error) {
      this.logger.warn(
        `ClaudeCodeProvider -> 请求日志序列化失败: ${(error as Error).message}`,
      );
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), config.timeout);

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      try {
        const responseHeaders = Object.fromEntries(response.headers.entries());
        this.logger.verbose(
          `ClaudeCodeProvider -> 响应状态: ${response.status} ${response.statusText}`,
        );
        this.logger.verbose(
          `ClaudeCodeProvider -> 响应头: ${JSON.stringify(responseHeaders)}`,
        );
        if (!stream) {
          const cloned = response.clone();
          const bodyText = await cloned.text();
          this.logger.verbose(`ClaudeCodeProvider -> 响应报文: ${bodyText}`);
        }
      } catch (error) {
        this.logger.warn(
          `ClaudeCodeProvider -> 响应日志处理失败: ${(error as Error).message}`,
        );
      }

      return response;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status;
    let body = '';
    try {
      body = await response.text();
    } catch {
      body = '';
    }

    try {
      const parsed = body ? JSON.parse(body) : undefined;
      if (parsed?.error?.message) {
        throw new Error(parsed.error.message);
      }
    } catch {
      // ignore parse errors
    }

    throw new ClaudeRequestError(status, body || response.statusText);
  }

  private convertClaudeResponseToOpenAI(
    message: ClaudeMessageResponse,
    model: string,
  ): OpenAIResponse {
    const toolCalls: OpenAIToolCall[] = [];
    const textParts: string[] = [];

    for (const block of message.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        const argumentsString = JSON.stringify(block.input ?? {});
        toolCalls.push({
          id: this.normalizeToOpenAIToolId(block.id),
          type: 'function',
          function: {
            name: block.name,
            arguments: argumentsString,
          },
        });
      }
    }

    const responseMessage: OpenAIMessage = {
      role: 'assistant',
      content: textParts.length > 0 ? textParts.join('') : null,
    };

    if (toolCalls.length > 0) {
      responseMessage.tool_calls = toolCalls;
    }

    const finishReason = this.mapStopReason(
      message.stop_reason,
      toolCalls.length > 0,
    );

    const usage = message.usage
      ? {
          prompt_tokens: message.usage.input_tokens ?? 0,
          completion_tokens: message.usage.output_tokens ?? 0,
          total_tokens:
            message.usage.total_tokens ??
            (message.usage.input_tokens ?? 0) +
              (message.usage.output_tokens ?? 0),
        }
      : undefined;

    return {
      id: message.id || randomUUID(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: responseMessage,
          finish_reason: finishReason,
        },
      ],
      usage,
    };
  }

  private computePromptTokens(
    request: GeminiRequestDto,
    model: string,
  ): number {
    let totalTokens = this.tokenizerService.countTokensInRequest(
      request.contents || [],
      model,
    );

    const systemInstruction = request.systemInstruction;
    if (typeof systemInstruction === 'string') {
      totalTokens += this.tokenizerService.countTokens(
        systemInstruction,
        model,
      );
    } else if (systemInstruction?.parts) {
      totalTokens += this.tokenizerService.countTokensInRequest(
        [systemInstruction],
        model,
      );
    }

    return totalTokens;
  }

  private parseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private normalizeToolResultContent(content: unknown): string {
    if (typeof content !== 'string') {
      try {
        return JSON.stringify(content ?? {});
      } catch {
        return '';
      }
    }

    const trimmed = content.trim();
    if (!trimmed) {
      return '';
    }

    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    } catch {
      return trimmed;
    }
  }

  private normalizeToAnthropicToolId(id: string): string {
    if (id.startsWith('toolu_')) {
      return id;
    }
    if (id.startsWith('hist_tool_')) {
      return 'toolu_' + id.slice('hist_tool_'.length);
    }
    if (id.startsWith('call_')) {
      return 'toolu_' + id.slice('call_'.length);
    }
    return id.startsWith('toolu_') ? id : `toolu_${id}`;
  }

  private normalizeToOpenAIToolId(id: string): string {
    if (id.startsWith('call_')) {
      return id;
    }
    if (id.startsWith('toolu_')) {
      return 'call_' + id.slice('toolu_'.length);
    }
    if (id.startsWith('hist_tool_')) {
      return 'call_' + id.slice('hist_tool_'.length);
    }
    return `call_${id}`;
  }

  private mapStopReason(
    reason: string | null | undefined,
    hasToolCalls: boolean,
  ): 'stop' | 'length' | 'tool_calls' {
    if (!reason) {
      return hasToolCalls ? 'tool_calls' : 'stop';
    }
    switch (reason) {
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      case 'end_turn':
      case 'stop_sequence':
        return hasToolCalls ? 'tool_calls' : 'stop';
      default:
        return hasToolCalls ? 'tool_calls' : 'stop';
    }
  }

  private normalizeOS(platform: NodeJS.Platform): string {
    switch (platform) {
      case 'win32':
        return 'Windows';
      case 'darwin':
        return 'Darwin';
      default:
        return 'Linux';
    }
  }

  private async *parseClaudeStream(
    stream: Readable,
    context: ClaudeStreamContext,
  ): AsyncGenerator<OpenAIStreamChunk> {
    let buffer = '';

    for await (const chunk of stream) {
      const chunkText = chunk.toString('utf8');
      this.logger.verbose(
        `ClaudeCodeProvider -> 流式片段: ${chunkText.trim() || '[空片段]'}`,
      );
      buffer += chunkText;
      buffer = buffer.replace(/\r\n/g, '\n');

      let boundaryIndex = buffer.indexOf('\n\n');
      while (boundaryIndex !== -1) {
        const rawEvent = buffer.slice(0, boundaryIndex).trim();
        buffer = buffer.slice(boundaryIndex + 2);
        boundaryIndex = buffer.indexOf('\n\n');

        if (!rawEvent) {
          continue;
        }

        this.logger.verbose(`ClaudeCodeProvider -> SSE事件: ${rawEvent}`);

        let eventName: string | undefined;
        const dataLines: string[] = [];
        for (const line of rawEvent.split('\n')) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          }
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }

        if (dataLines.length === 0) {
          continue;
        }

        const dataPayload = dataLines.join('');
        if (dataPayload === '[DONE]') {
          if (!context.finalChunkSent) {
            context.finalChunkSent = true;
            yield this.createFinalChunk(context);
          }
          return;
        }

        try {
          const parsed = JSON.parse(dataPayload) as Record<string, unknown>;
          const chunks = this.handleStreamEvent(
            eventName || (parsed.type as string | undefined),
            parsed,
            context,
          );

          if (Array.isArray(chunks)) {
            for (const item of chunks) {
              if (item) {
                yield item;
              }
            }
          } else if (chunks) {
            yield chunks;
          }
        } catch (error) {
          this.logger.warn(
            `Failed to parse Claude Code SSE chunk: ${(error as Error).message}`,
          );
        }
      }
    }
  }

  private handleStreamEvent(
    eventType: string | undefined,
    payload: Record<string, unknown>,
    context: ClaudeStreamContext,
  ): OpenAIStreamChunk | OpenAIStreamChunk[] | undefined {
    switch (eventType) {
      case 'message_start': {
        const message = payload.message as { id?: string; model?: string };
        context.responseId = message?.id || context.responseId || randomUUID();
        context.model = message?.model || context.model;
        context.created = Math.floor(Date.now() / 1000);
        return undefined;
      }
      case 'content_block_start': {
        const contentBlock = payload.content_block as
          | { type: string; id?: string; name?: string }
          | undefined;
        const index = (payload.index as number | undefined) ?? 0;
        if (contentBlock?.type === 'tool_use') {
          const anthropicId = contentBlock.id || randomUUID();
          const state: ToolCallState = {
            index,
            anthropicId,
            openaiId: this.normalizeToOpenAIToolId(anthropicId),
            name: contentBlock.name,
            arguments: '',
          };
          context.toolCallStates.set(index, state);
        }
        return undefined;
      }
      case 'content_block_delta': {
        const index = (payload.index as number | undefined) ?? 0;
        const delta = payload.delta as
          | { type?: string; text?: string; partial_json?: string }
          | undefined;
        if (!delta) {
          return undefined;
        }

        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          return this.createTextChunk(delta.text, context);
        }

        if (delta.type === 'input_json_delta') {
          const state = context.toolCallStates.get(index);
          if (state && typeof delta.partial_json === 'string') {
            state.arguments += delta.partial_json;
          }
        }
        return undefined;
      }
      case 'content_block_stop': {
        const index = (payload.index as number | undefined) ?? 0;
        const state = context.toolCallStates.get(index);
        if (state) {
          const argumentsString = this.normalizeArguments(state.arguments);
          const chunk = this.createToolCallChunk(
            state,
            argumentsString,
            context,
          );
          context.toolCallStates.delete(index);
          return chunk;
        }
        return undefined;
      }
      case 'message_delta': {
        const delta = payload.delta as
          | { stop_reason?: string | null; stop_sequence?: unknown }
          | undefined;
        const usage = payload.usage as
          | {
              input_tokens?: number;
              output_tokens?: number;
              total_tokens?: number;
            }
          | undefined;

        if (usage) {
          context.usage = usage;
        }

        if (delta?.stop_reason) {
          context.finishReason = this.mapStopReason(delta.stop_reason, false);
          if (!context.finalChunkSent) {
            context.finalChunkSent = true;
            return this.createFinalChunk(context);
          }
        }
        return undefined;
      }
      case 'message_stop': {
        if (!context.finalChunkSent) {
          context.finalChunkSent = true;
          return this.createFinalChunk(context);
        }
        return undefined;
      }
      default:
        return undefined;
    }
  }

  private createTextChunk(
    text: string,
    context: ClaudeStreamContext,
  ): OpenAIStreamChunk {
    const delta: Record<string, unknown> = {
      content: text,
    };
    if (!context.started) {
      delta.role = 'assistant';
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
          delta,
        },
      ],
    };
  }

  private createToolCallChunk(
    state: ToolCallState,
    argumentsString: string,
    context: ClaudeStreamContext,
  ): OpenAIStreamChunk {
    const delta: Record<string, unknown> = {
      tool_calls: [
        {
          index: state.index,
          id: state.openaiId,
          type: 'function',
          function: {
            name: state.name || 'tool',
            arguments: argumentsString,
          },
        },
      ],
    };

    if (!context.started) {
      delta.role = 'assistant';
      context.started = true;
    }

    context.finishReason = 'tool_calls';

    return {
      id: context.responseId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: context.model,
      choices: [
        {
          index: 0,
          delta,
        },
      ],
    };
  }

  private createFinalChunk(context: ClaudeStreamContext): OpenAIStreamChunk {
    const usage = context.usage
      ? {
          prompt_tokens: context.usage.input_tokens ?? 0,
          completion_tokens: context.usage.output_tokens ?? 0,
          total_tokens:
            context.usage.total_tokens ??
            (context.usage.input_tokens ?? 0) +
              (context.usage.output_tokens ?? 0),
        }
      : undefined;

    return {
      id: context.responseId,
      object: 'chat.completion.chunk',
      created: context.created,
      model: context.model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: context.finishReason || 'stop',
        },
      ],
      usage,
    };
  }

  private normalizeArguments(argumentsBuffer: string): string {
    const trimmed = argumentsBuffer.trim();
    if (!trimmed) {
      return '{}';
    }
    try {
      const parsed = JSON.parse(trimmed);
      return JSON.stringify(parsed);
    } catch {
      return trimmed;
    }
  }

  private buildUrl(baseUrl: string, path: string): URL {
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return new URL(path, normalizedBase);
  }
}
