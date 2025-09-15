import {
  Controller,
  Post,
  Param,
  Body,
  Res,
  Logger,
  Headers,
  Query,
} from '@nestjs/common';
import type { Response } from 'express';
import { GeminiRequestDto } from '../models/gemini/gemini-request.dto';
import { OpenAIProvider } from '../providers/openai/openai.provider';
import { RequestTransformer } from '../transformers/request.transformer';
import { ResponseTransformer } from '../transformers/response.transformer';
import { StreamTransformer } from '../transformers/stream.transformer';
import { Readable } from 'stream';

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
      this.logger.log(`API Key: ${config.apiKey ? config.apiKey.substring(0, 20) + '...' : 'Not set'}`);
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
    @Headers() headers: Record<string, string>,
  ) {
    try {
      // Determine request type based on alt parameter or model suffix
      const isStreamRequest = alt === 'streamGenerateContent' || model.endsWith(':streamGenerateContent');
      const isGenerateRequest = alt === 'generateContent' || model.endsWith(':generateContent');

      if (!isStreamRequest && !isGenerateRequest) {
        throw new Error('Invalid request. Expected generateContent or streamGenerateContent action.');
      }

      // Extract actual model name
      const actualModel = model.replace(/:(generateContent|streamGenerateContent)$/, '');

      // Use the configured model from YAML instead of the requested model
      const config = this.openaiProvider.getConfig();
      const targetModel = config?.model || 'glm-4.5';
      this.logger.debug(`Mapping model ${actualModel} to ${targetModel}`);

      if (isStreamRequest) {
        // Handle streaming request
        this.logger.debug(`Received streamGenerateContent request for model: ${actualModel}`);

        // Set SSE headers
        response.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        // Transform Gemini request to OpenAI format
        const openAIRequest = this.requestTransformer.transformRequest(request, targetModel);
        openAIRequest.stream = true;

        // Create readable stream for SSE
        const readable = new Readable({
          read() {},
          objectMode: true,
        });

        // Process the stream
        (async () => {
          try {
            for await (const chunk of this.openaiProvider.generateContentStream(openAIRequest)) {
              const geminiChunk = this.streamTransformer.transformStreamChunk(chunk);

              // Add thought signature if provided
              if (thoughtSignature) {
                geminiChunk.thoughtSignature = thoughtSignature;
              }

              const sseData = this.streamTransformer.toSSEFormat(geminiChunk);
              readable.push(sseData);
            }

            // Send end marker
            readable.push(this.streamTransformer.createSSEEndMarker());
            readable.push(null); // End of stream
          } catch (error) {
            this.logger.error('Stream processing error:', error);
            readable.push(`data: ${JSON.stringify({
              error: {
                code: 'STREAM_ERROR',
                message: error.message,
              },
            })}\n\n`);
            readable.push(null);
          }
        })();

        // Pipe the readable stream to response
        readable.pipe(response);
      } else {
        // Handle regular request
        this.logger.debug(`Received generateContent request for model: ${actualModel}`);
        this.logger.debug(`Request path: /api/v1/models/${model}`);

        // Transform Gemini request to OpenAI format
        const openAIRequest = this.requestTransformer.transformRequest(request, targetModel);

        // Send to OpenAI provider
        const openAIResponse = await this.openaiProvider.generateContent(openAIRequest);

        // Transform response back to Gemini format
        const geminiResponse = this.responseTransformer.transformResponse(openAIResponse);

        // Add thought signature if provided
        if (thoughtSignature) {
          geminiResponse.thoughtSignature = thoughtSignature;
        }

        // 打印转换后的 Gemini 响应
        this.logger.debug('=== Transformed Gemini Response ===');
        this.logger.debug(`Response: ${JSON.stringify(geminiResponse, null, 2)}`);
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