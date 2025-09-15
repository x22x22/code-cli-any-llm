import { Controller, Get } from '@nestjs/common';
import { OpenAIProvider } from '../providers/openai/openai.provider';
import { ConfigService } from '@nestjs/config';

interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  provider?: any;
  config?: any;
}

@Controller()
export class HealthController {
  private readonly startTime = Date.now();

  constructor(
    private readonly openAIProvider: OpenAIProvider,
    private readonly configService: ConfigService,
  ) {}

  @Get('health')
  async healthCheck(): Promise<HealthResponse> {
    const response: HealthResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: '1.0.0',
    };

    try {
      // Check OpenAI provider health
      const providerHealth = await this.openAIProvider.healthCheck();

      if (providerHealth.status === 'healthy') {
        response.provider = providerHealth.details;

        // Add basic config info (without sensitive data)
        const openaiConfig = this.configService.get('openai');
        response.config = {
          model: openaiConfig.model,
          baseURL: openaiConfig.baseURL,
        };
      } else {
        response.status = 'unhealthy';
        response.provider = providerHealth.details;
      }
    } catch (error) {
      response.status = 'unhealthy';
      response.provider = {
        error: error.message,
      };
    }

    return response;
  }
}