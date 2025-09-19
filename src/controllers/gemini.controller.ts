import {
  Controller,
  Post,
  Param,
  Body,
  Res,
  Logger,
  Query,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { GeminiRequestDto } from '../models/gemini/gemini-request.dto';
import { GeminiResponseDto } from '../models/gemini/gemini-response.dto';
import { OpenAIProvider } from '../providers/openai/openai.provider';
import { CodexProvider } from '../providers/codex/codex.provider';
import { RequestTransformer } from '../transformers/request.transformer';
import { ResponseTransformer } from '../transformers/response.transformer';
import { StreamTransformer } from '../transformers/stream.transformer';
import { EnhancedRequestTransformer } from '../transformers/enhanced-request.transformer';
import { EnhancedResponseTransformer } from '../transformers/enhanced-response.transformer';
import { TokenizerService } from '../services/tokenizer.service';

@Controller('')
export class GeminiController {
  private readonly logger = new Logger(GeminiController.name);
  private readonly isUsingZhipuModel: boolean;
  private readonly useCodexProvider: boolean;
  private readonly llmProvider: OpenAIProvider | CodexProvider;
  private readonly aiProvider: 'openai' | 'codex';

  constructor(
    private readonly requestTransformer: RequestTransformer,
    private readonly responseTransformer: ResponseTransformer,
    private readonly streamTransformer: StreamTransformer,
    private readonly enhancedRequestTransformer: EnhancedRequestTransformer,
    private readonly enhancedResponseTransformer: EnhancedResponseTransformer,
    private readonly tokenizerService: TokenizerService,
    private readonly configService: ConfigService,
    @Optional() private readonly openaiProvider?: OpenAIProvider,
    @Optional() private readonly codexProvider?: CodexProvider,
  ) {
    const configuredProvider = (
      this.configService.get<string>('aiProvider') || 'openai'
    ).toLowerCase();
    this.aiProvider = configuredProvider === 'codex' ? 'codex' : 'openai';
    this.useCodexProvider = this.aiProvider === 'codex';
    let provider: OpenAIProvider | CodexProvider | undefined =
      this.openaiProvider;
    if (this.useCodexProvider) {
      const codexProvider = this.codexProvider;
      if (!codexProvider) {
        throw new Error(
          'Codex provider selected but CodexProvider is not available',
        );
      }
      if (!codexProvider.isEnabled()) {
        throw new Error('Codex provider selected but configuration is missing');
      }
      provider = codexProvider;
    } else {
      if (!this.openaiProvider || !this.openaiProvider.isEnabled()) {
        throw new Error(
          'OpenAI provider selected but configuration is missing',
        );
      }
      provider = this.openaiProvider;
    }
    if (!provider) {
      throw new Error('LLM provider is not available.');
    }
    this.llmProvider = provider;

    const config = this.getActiveProviderConfig();
    const providerName = this.useCodexProvider ? 'Codex' : 'OpenAI';
    this.logger.log(`=== ${providerName} Configuration ===`);
    if (config) {
      const apiKey = config.apiKey as string | undefined;
      const baseURL = config.baseURL as string | undefined;
      const model = config.model as string | undefined;
      this.logger.log(
        `API Key: ${apiKey ? apiKey.substring(0, 20) + '...' : 'Not set'}`,
      );
      this.logger.log(`Base URL: ${baseURL ?? 'Not set'}`);
      this.logger.log(`Model: ${model ?? 'Not set'}`);
    } else {
      this.logger.log('No provider configuration found.');
    }
    this.logger.log('==========================');

    const configuredModel =
      ((config as Record<string, unknown>)?.model as string | undefined) ||
      (this.useCodexProvider ? 'gpt-5-codex' : 'glm-4.5');
    this.isUsingZhipuModel =
      !this.useCodexProvider &&
      this.enhancedRequestTransformer.isZhipuModel(configuredModel);
    this.logger.log(`=== Zhipu Optimization ===`);
    this.logger.log(`Configured Model: ${configuredModel}`);
    this.logger.log(`Is Zhipu Model: ${this.isUsingZhipuModel}`);
    this.logger.log(
      `Using Enhanced Transformers: ${this.isUsingZhipuModel ? 'YES' : 'NO'}`,
    );
    this.logger.log('===========================');
  }

  /**
   * 获取适合模型的请求转换器
   */
  private getRequestTransformer() {
    if (this.isUsingZhipuModel) {
      this.logger.debug(`Using enhanced request transformer for Zhipu model`);
      return this.enhancedRequestTransformer;
    }
    this.logger.debug(`Using standard request transformer`);
    return this.requestTransformer;
  }

  /**
   * 获取适合模型的响应转换器
   */
  private getResponseTransformer() {
    if (this.isUsingZhipuModel) {
      this.logger.debug(`Using enhanced response transformer for Zhipu model`);
      return this.enhancedResponseTransformer;
    }
    this.logger.debug(`Using standard response transformer`);
    return this.responseTransformer;
  }

  private getActiveProviderConfig(): Record<string, unknown> | undefined {
    const key = this.useCodexProvider ? 'codex' : 'openai';
    return this.configService.get<Record<string, unknown>>(key);
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

  @Post('models/:model')
  async handleModelRequest(
    @Param('model') model: string,
    @Query('alt') alt: string,
    @Query('thought_signature') thoughtSignature: string,
    @Body() request: GeminiRequestDto,
    @Res() response: Response,
  ) {
    try {
      // Determine request type based on alt parameter or model suffix
      const isStreamRequest =
        alt === 'streamGenerateContent' ||
        model.endsWith(':streamGenerateContent');
      const isGenerateRequest =
        alt === 'generateContent' || model.endsWith(':generateContent');
      const isCountTokensRequest =
        alt === 'countTokens' || model.endsWith(':countTokens');

      if (!isStreamRequest && !isGenerateRequest && !isCountTokensRequest) {
        throw new Error(
          'Invalid request. Expected generateContent, streamGenerateContent or countTokens action.',
        );
      }

      // Extract actual model name
      const actualModel = model.replace(
        /:(generateContent|streamGenerateContent|countTokens)$/,
        '',
      );

      // Use the configured model from YAML instead of the requested model
      const config = this.getActiveProviderConfig();
      const targetModel =
        (config?.model as string | undefined) ||
        (this.useCodexProvider ? 'gpt-5-codex' : 'glm-4.5');
      this.logger.debug(`Mapping model ${actualModel} to ${targetModel}`);

      if (isStreamRequest) {
        // Handle streaming request
        this.logger.debug(
          `Received streamGenerateContent request for model: ${actualModel}`,
        );

        // Set SSE headers with explicit buffering control
        response.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
          'Transfer-Encoding': 'chunked',
        });

        // Force flush any existing buffers
        if (typeof response.flushHeaders === 'function') {
          response.flushHeaders();
        }

        // Transform Gemini request to OpenAI format
        const requestTransformer = this.getRequestTransformer();
        const openAIRequest = requestTransformer.transformRequest(
          request,
          targetModel,
        );
        openAIRequest.stream = true;

        // Initialize stream transformer for the specific model
        const promptTokenCount = this.computePromptTokens(request, targetModel);
        this.streamTransformer.initializeForModel(
          targetModel,
          promptTokenCount,
        );

        // Handle client disconnect
        response.on('close', () => {
          this.logger.debug('Client disconnected');
        });

        response.on('error', (err) => {
          this.logger.error('Response error:', err);
        });

        // Process the stream and write directly to response
        void (async () => {
          try {
            for await (const chunk of this.llmProvider.generateContentStream(
              openAIRequest,
            )) {
              // Check if response is still writable
              if (response.destroyed || response.closed) {
                this.logger.debug('Response closed, stopping stream');
                break;
              }

              const geminiChunk =
                this.streamTransformer.transformStreamChunk(chunk);

              const chunkList = this.splitThoughtAndContentChunks(geminiChunk);

              let shouldStopProcessing = false;
              for (const chunkToSend of chunkList) {
                this.logStreamChunk('stream', chunkToSend);
                // Add thought signature if provided
                if (thoughtSignature) {
                  (
                    chunkToSend as unknown as Record<string, unknown>
                  ).thoughtSignature = thoughtSignature;
                }

                const sseData = this.streamTransformer.toSSEFormat(chunkToSend);

                // Only write if SSE data is not empty (skip empty chunks)
                if (
                  sseData &&
                  sseData.trim() &&
                  !response.destroyed &&
                  !response.closed
                ) {
                  const writeSuccess = response.write(sseData);
                  if (!writeSuccess) {
                    this.logger.warn('Write buffer full, waiting for drain');
                    // Wait for drain event if buffer is full
                    await new Promise((resolve) => {
                      response.once('drain', resolve);
                      // Timeout after 5 seconds to prevent hanging
                      setTimeout(resolve, 5000);
                    });
                  }
                } else if (!sseData || !sseData.trim()) {
                  // Skip empty SSE chunk
                  continue;
                } else {
                  // Response closed during data write
                  shouldStopProcessing = true;
                  break;
                }
              }

              if (shouldStopProcessing) {
                break;
              }
            }

            // Handle any remaining buffered text before ending the stream
            const bufferedText = this.streamTransformer.getBufferedText();
            if (bufferedText && !response.destroyed && !response.closed) {
              const finalChunk: Record<string, unknown> = {
                candidates: [
                  {
                    content: {
                      role: 'model' as const,
                      parts: [{ text: bufferedText }],
                    },
                    index: 0,
                    finishReason: 'STOP',
                  },
                ],
              };

              // Add thought signature if provided
              if (thoughtSignature) {
                finalChunk.thoughtSignature = thoughtSignature;
              }

              this.streamTransformer.applyUsageMetadata(finalChunk);

              const finalChunks = this.splitThoughtAndContentChunks(
                finalChunk as unknown as any,
              );
              for (const chunkToSend of finalChunks) {
                this.logStreamChunk('stream-final', chunkToSend);
                if (thoughtSignature) {
                  (
                    chunkToSend as unknown as Record<string, unknown>
                  ).thoughtSignature = thoughtSignature;
                }
                const finalSSEData =
                  this.streamTransformer.toSSEFormat(chunkToSend);
                if (finalSSEData && finalSSEData.trim()) {
                  response.write(finalSSEData);
                }
              }
            }

            // Send end marker only if response is still open
            if (!response.destroyed && !response.closed) {
              try {
                const endMarker = this.streamTransformer.createSSEEndMarker();
                if (endMarker) {
                  response.write(endMarker);
                }
                response.end();
              } catch (endError) {
                this.logger.error('Error ending response:', endError);
                try {
                  response.end();
                } catch (e) {
                  this.logger.error('Failed to end response:', e);
                }
              }
            }
          } catch (error) {
            this.logger.error('Stream processing error:', error);
            if (!response.destroyed && !response.closed) {
              response.write(
                `data: ${JSON.stringify({
                  error: {
                    code: 'STREAM_ERROR',
                    message: (error as Error).message,
                  },
                })}\n\n`,
              );
              response.end();
            }
          }
        })();
      } else if (isCountTokensRequest) {
        // Handle countTokens request
        this.logger.debug(
          `Received countTokens request for model: ${actualModel}`,
        );

        // Count tokens using tokenizer service
        const tokenCount = this.computePromptTokens(request, targetModel);

        // Return token count response
        response.status(200).json({
          totalTokens: tokenCount,
        });
      } else {
        // Handle regular request
        this.logger.debug(
          `Received generateContent request for model: ${actualModel}`,
        );
        this.logger.debug(`Request path: /api/v1/models/${model}`);

        // Transform Gemini request to OpenAI format
        const requestTransformer = this.getRequestTransformer();
        const openAIRequest = requestTransformer.transformRequest(
          request,
          targetModel,
        );

        // Send to active provider
        const openAIResponse =
          await this.llmProvider.generateContent(openAIRequest);

        // Transform response back to Gemini format
        const responseTransformer = this.getResponseTransformer();
        const geminiResponse = responseTransformer.transformResponse(
          openAIResponse,
          targetModel,
        ) as Record<string, unknown>;

        // Add thought signature if provided
        if (thoughtSignature) {
          geminiResponse.thoughtSignature = thoughtSignature;
        }

        // 打印转换后的 Gemini 响应
        this.logger.debug('=== Transformed Gemini Response ===');
        this.logger.debug(
          `Response: ${JSON.stringify(geminiResponse, null, 2)}`,
        );
        this.logger.debug('=====================================');

        // 添加日志：即将返回响应
        this.logger.debug('=== About to return response to client ===');
        this.logger.debug('=====================================');

        // 手动发送响应
        response.status(200).json(geminiResponse);
        return;
      }
    } catch (error) {
      this.logger.error(`Error in model request for ${model}:`, error);
      throw error;
    }
  }

  private splitThoughtAndContentChunks(
    chunk: GeminiResponseDto,
  ): GeminiResponseDto[] {
    const candidates = chunk?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return [chunk];
    }

    const [candidate] = candidates;
    const contentInfo = candidate?.content;
    const parts = contentInfo?.parts;
    if (!contentInfo || !Array.isArray(parts) || parts.length === 0) {
      return [chunk];
    }

    const thoughtParts = parts
      .filter((part) => (part as { thought?: boolean }).thought)
      .map((part) => ({ ...part }));
    const contentParts = parts
      .filter((part) => !(part as { thought?: boolean }).thought)
      .map((part) => ({ ...part }));

    if (thoughtParts.length === 0 || contentParts.length === 0) {
      return [chunk];
    }

    const baseContent = { ...contentInfo };
    const normalizedThoughtParts = this.normalizeParts(thoughtParts);
    const normalizedContentParts = this.normalizeParts(contentParts, {
      prependLeadingNewline: true,
    });

    const createChunk = (
      selectedParts: Array<Record<string, unknown>>,
      options?: { isThoughtChunk?: boolean },
    ): GeminiResponseDto => ({
      ...chunk,
      candidates: [
        {
          ...candidate,
          content: { ...baseContent, parts: selectedParts },
          finishReason: options?.isThoughtChunk
            ? undefined
            : candidate.finishReason,
        },
      ],
    });

    const thoughtChunk = createChunk(normalizedThoughtParts, {
      isThoughtChunk: true,
    });
    const contentChunk = createChunk(normalizedContentParts);
    return [thoughtChunk, contentChunk];
  }

  private normalizeParts(
    parts: Array<Record<string, unknown>>,
    options?: { prependLeadingNewline?: boolean },
  ): Array<Record<string, unknown>> {
    const normalized: Array<Record<string, unknown>> = [];
    let lastText: string | undefined;

    for (const part of parts) {
      const partText =
        typeof (part as { text?: unknown }).text === 'string'
          ? (part as { text: string }).text
          : undefined;
      if (partText !== undefined) {
        let text = partText;
        if (options?.prependLeadingNewline && normalized.length === 0) {
          text = text.startsWith('\n') ? text : `\n${text}`;
        }
        if (text === lastText) {
          continue;
        }
        lastText = text;
        const cloned = { ...part };
        cloned.text = text;
        normalized.push(cloned);
      } else {
        normalized.push({ ...part });
        lastText = undefined;
      }
    }

    return normalized;
  }

  private logStreamChunk(label: string, chunk: GeminiResponseDto): void {
    const candidate = chunk?.candidates?.[0];
    if (!candidate) {
      this.logger.debug(`[Stream][${label}] empty candidate`);
      return;
    }

    const parts = candidate.content?.parts;
    let preview: string | undefined;
    if (Array.isArray(parts) && parts.length > 0) {
      preview = parts
        .map((part) => {
          const isThought = Boolean((part as { thought?: boolean }).thought);
          const text =
            typeof (part as { text?: unknown }).text === 'string'
              ? (part as { text: string }).text
              : undefined;
          if (text) {
            return `${isThought ? '[thought]' : '[content]'}${this.sanitizeForLog(
              text,
              120,
            )}`;
          }
          if ((part as { functionCall?: { name?: string } }).functionCall) {
            return '[function-call]';
          }
          return '[non-text]';
        })
        .join(' | ');
    }

    this.logger.debug(
      `[Stream][${label}] id=${chunk.responseId ?? 'unknown'} preview=${
        preview ?? '∅'
      } finish=${candidate.finishReason ?? '∅'}`,
    );
  }

  private sanitizeForLog(value: unknown, maxLength = 500): string {
    if (typeof value === 'string') {
      return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
    }

    try {
      const serialized = JSON.stringify(value);
      return serialized.length > maxLength
        ? `${serialized.slice(0, maxLength)}…`
        : serialized;
    } catch {
      const fallback = String(value);
      return fallback.length > maxLength
        ? `${fallback.slice(0, maxLength)}…`
        : fallback;
    }
  }
}
