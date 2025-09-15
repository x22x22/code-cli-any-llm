import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OpenAI } from 'openai';
import { OpenAIRequest } from '../../models/openai/openai-request.model';
import { OpenAIResponse } from '../../models/openai/openai-response.model';
import { OpenAIStreamChunk } from '../../models/openai/openai-stream.model';
import { OpenAIConfig } from '../../config/config.schema';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OpenAIProvider implements OnModuleInit {
  private readonly logger = new Logger(OpenAIProvider.name);
  private openai: OpenAI;
  private config: OpenAIConfig;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
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

    this.logger.log(`OpenAI provider initialized with model: ${config.model}`);
  }

  getConfig() {
    return this.configService.get<OpenAIConfig>('openai');
  }

  async generateContent(request: OpenAIRequest): Promise<OpenAIResponse> {
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
        };

        this.logger.debug('=== OpenAI Request Details ===');
        this.logger.debug(`URL: ${this.config.baseURL}/chat/completions`);
        this.logger.debug(`Headers: {
          'Authorization': 'Bearer ${this.config.apiKey.substring(0, 20)}...',
          'Content-Type': 'application/json'
        }`);
        this.logger.debug(`Body: ${JSON.stringify(requestBody, null, 2)}`);
        this.logger.debug('================================');

        const response = await this.openai.chat.completions.create({
          model: request.model,
          messages: request.messages as any,
          tools: request.tools,
          tool_choice: request.tool_choice,
          temperature: request.temperature,
          top_p: request.top_p,
          max_tokens: request.max_tokens,
          stop: request.stop,
          user: request.user,
          stream: false,
        });

        // 打印 OpenAI 响应内容
        this.logger.debug('=== OpenAI Response Details ===');
        this.logger.debug(`Status: ${response.choices?.[0]?.finish_reason || 'unknown'}`);
        this.logger.debug(`Response: ${JSON.stringify(response, null, 2)}`);
        this.logger.debug('=================================');

        return response as OpenAIResponse;
      } catch (error) {
        lastError = this.transformError(error);

        // Don't retry on client errors (4xx) except 429
        if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
          this.logger.error('Non-retryable error, throwing immediately', error);
          throw lastError;
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          this.logger.error(`Max retries (${maxRetries}) exceeded, giving up`, error);
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          initialDelay * Math.pow(2, attempt - 1) * (1 + Math.random() * 0.2),
          maxDelay
        );

        this.logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`, {
          error: error.message,
          delay,
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  async *generateContentStream(request: OpenAIRequest): AsyncIterable<OpenAIStreamChunk> {
    try {
      this.logger.debug('Starting stream request to OpenAI', {
        model: request.model,
        messages: request.messages.length,
        hasTools: !!request.tools,
      });

      const stream = await this.openai.chat.completions.create({
        model: request.model,
        messages: request.messages as any,
        tools: request.tools,
        tool_choice: request.tool_choice,
        temperature: request.temperature,
        top_p: request.top_p,
        max_tokens: request.max_tokens,
        stop: request.stop,
        user: request.user,
        stream: true,
      });

      for await (const chunk of stream) {
        yield chunk as OpenAIStreamChunk;
      }
    } catch (error) {
      this.logger.error('OpenAI streaming error', error);
      throw this.transformError(error);
    }
  }

  async listModels(): Promise<any> {
    try {
      const response = await this.openai.models.list();
      return response.data;
    } catch (error) {
      this.logger.error('Failed to list models', error);
      throw this.transformError(error);
    }
  }

  private transformError(error: any): Error {
    if (error.status) {
      // OpenAI API error
      const message = error.error?.message || error.message || 'Unknown OpenAI API error';
      const statusCode = error.status;

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
    if (error.code === 'ECONNREFUSED') {
      return new Error('Connection refused - check if OpenAI service is accessible');
    }

    if (error.code === 'ETIMEDOUT') {
      return new Error('Request timeout - OpenAI service did not respond in time');
    }

    return error instanceof Error ? error : new Error(String(error));
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details?: any;
  }> {
    try {
      // Try a simple API call to check if the service is accessible
      await this.openai.models.list();

      return {
        status: 'healthy',
        details: {
          provider: 'OpenAI',
          baseURL: this.openai.baseURL,
          model: this.configService.get('openai.model'),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          provider: 'OpenAI',
          error: error.message,
        },
      };
    }
  }
}