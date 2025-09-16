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
import { RequestTransformer } from './transformers/request.transformer';
import { ResponseTransformer } from './transformers/response.transformer';
import { StreamTransformer } from './transformers/stream.transformer';
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
    RequestTransformer,
    ResponseTransformer,
    StreamTransformer,
    TokenizerService,
  ],
})
export class AppModule implements OnModuleDestroy {
  private readonly logger = new Logger(AppModule.name);

  constructor() {}

  async onModuleDestroy() {
    this.logger.log('Application is shutting down, cleaning up resources...');
    // Add any additional cleanup logic here
  }

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggingMiddleware)
      .forRoutes('*')
      .apply(TimeoutMiddleware)
      .exclude({ path: 'health', method: RequestMethod.GET })
      .forRoutes('*');
  }
}
