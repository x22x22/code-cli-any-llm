import {
  Controller,
  Post,
  Param,
  Body,
  Res,
  Logger,
  Query,
} from '@nestjs/common';
import type { Response } from 'express';
import { GeminiRequestDto } from '../models/gemini/gemini-request.dto';
import { OpenAIProvider } from '../providers/openai/openai.provider';
import { RequestTransformer } from '../transformers/request.transformer';
import { ResponseTransformer } from '../transformers/response.transformer';
import { StreamTransformer } from '../transformers/stream.transformer';

@Controller('')
export class GeminiController {
  private readonly logger = new Logger(GeminiController.name);

  constructor(
    private readonly openaiProvider: OpenAIProvider,
    private readonly requestTransformer: RequestTransformer,
    private readonly responseTransformer: ResponseTransformer,
    private readonly streamTransformer: StreamTransformer,
  ) {
    // 打印 OpenAI 配置信息
    const config = this.openaiProvider.getConfig();
    if (config) {
      this.logger.log('=== OpenAI Configuration ===');
      this.logger.log(
        `API Key: ${config.apiKey ? config.apiKey.substring(0, 20) + '...' : 'Not set'}`,
      );
      this.logger.log(`Base URL: ${config.baseURL}`);
      this.logger.log(`Model: ${config.model}`);
      this.logger.log('==========================');
    }
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
      const config = this.openaiProvider.getConfig();
      const targetModel = config?.model || 'glm-4.5';
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
        const openAIRequest = this.requestTransformer.transformRequest(
          request,
          targetModel,
        );
        openAIRequest.stream = true;

        // Initialize stream transformer for the specific model
        this.streamTransformer.initializeForModel(targetModel);

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
            for await (const chunk of this.openaiProvider.generateContentStream(
              openAIRequest,
            )) {
              // Check if response is still writable
              if (response.destroyed || response.closed) {
                this.logger.debug('Response closed, stopping stream');
                break;
              }

              const geminiChunk =
                this.streamTransformer.transformStreamChunk(chunk);

              // Add thought signature if provided
              if (thoughtSignature) {
                (geminiChunk as Record<string, unknown>).thoughtSignature =
                  thoughtSignature;
              }

              const sseData = this.streamTransformer.toSSEFormat(geminiChunk);

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
              } else {
                // Response closed during data write
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

              const finalSSEData =
                this.streamTransformer.toSSEFormat(finalChunk);
              if (finalSSEData && finalSSEData.trim()) {
                response.write(finalSSEData);
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

        // Count tokens using OpenAI provider
        const tokenCount = this.openaiProvider.countTokens(request);

        // Return token count response
        response.json({
          totalTokens: tokenCount,
        });
      } else {
        // Handle regular request
        this.logger.debug(
          `Received generateContent request for model: ${actualModel}`,
        );
        this.logger.debug(`Request path: /api/v1/models/${model}`);

        // Transform Gemini request to OpenAI format
        const openAIRequest = this.requestTransformer.transformRequest(
          request,
          targetModel,
        );

        // Send to OpenAI provider
        const openAIResponse =
          await this.openaiProvider.generateContent(openAIRequest);

        // Transform response back to Gemini format
        const geminiResponse = this.responseTransformer.transformResponse(
          openAIResponse,
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
        response.json(geminiResponse);
        return;
      }
    } catch (error) {
      this.logger.error(`Error in model request for ${model}:`, error);
      throw error;
    }
  }
}
