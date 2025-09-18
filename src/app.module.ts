import {
  Module,
  MiddlewareConsumer,
  RequestMethod,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { GeminiController } from './controllers/gemini.controller';
import { HealthController } from './controllers/health.controller';
import { OpenAIProvider } from './providers/openai/openai.provider';
import { CodexProvider } from './providers/codex/codex.provider';
import { RequestTransformer } from './transformers/request.transformer';
import { ResponseTransformer } from './transformers/response.transformer';
import { StreamTransformer } from './transformers/stream.transformer';
import { EnhancedRequestTransformer } from './transformers/enhanced-request.transformer';
import { EnhancedResponseTransformer } from './transformers/enhanced-response.transformer';
import { ToolFormatterAdapter } from './transformers/enhanced/ToolFormatterAdapter';
import { ToolFormatter } from './transformers/enhanced/ToolFormatter';
import { ZhipuOptimizer } from './utils/zhipu/ZhipuOptimizer';
import { DoubleEscapeUtils } from './utils/zhipu/doubleEscapeUtils';
import { ToolCallProcessor } from './utils/zhipu/ToolCallProcessor';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggingMiddleware } from './middleware/logging.middleware';
import { TimeoutMiddleware } from './middleware/timeout.middleware';
import { TokenizerService } from './services/tokenizer.service';
import { Logger } from '@nestjs/common';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [AppController, GeminiController, HealthController],
  providers: [
    AppService,
    OpenAIProvider,
    CodexProvider,
    RequestTransformer,
    ResponseTransformer,
    StreamTransformer,
    TokenizerService,
    // Enhanced transformers and utilities
    EnhancedRequestTransformer,
    EnhancedResponseTransformer,
    ToolFormatterAdapter,
    ToolFormatter,
    ZhipuOptimizer,
    DoubleEscapeUtils,
    ToolCallProcessor,
  ],
})
export class AppModule implements OnModuleDestroy {
  private readonly logger = new Logger(AppModule.name);

  constructor() {}

  onModuleDestroy() {
    this.logger.log('Application is shutting down, cleaning up resources...');
    // Add any additional cleanup logic here
  }

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggingMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL })
      .apply(TimeoutMiddleware)
      .exclude({ path: 'health', method: RequestMethod.GET })
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
