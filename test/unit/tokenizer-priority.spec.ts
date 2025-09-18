import { Test, TestingModule } from '@nestjs/testing';
import { TokenizerService } from '../../src/services/tokenizer.service';
import { StreamTransformer } from '../../src/transformers/stream.transformer';
import { ToolCallProcessor } from '../../src/utils/zhipu/ToolCallProcessor';

describe('TokenizerService - API Usage Priority', () => {
  let tokenizer: TokenizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TokenizerService],
    }).compile();

    tokenizer = module.get<TokenizerService>(TokenizerService);
  });

  afterEach(async () => {
    // Clean up tokenizer cache
    await tokenizer.onModuleDestroy();
  });

  describe('combineUsageInfo', () => {
    it('should prioritize API usage when complete data is available', () => {
      const apiUsage = {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      };

      const localText = {
        promptText: 'Hello world this is a test prompt',
        candidateText: 'Response from AI',
        thoughtText: 'Internal reasoning',
      };

      const result = tokenizer.combineUsageInfo(apiUsage, localText, 'gpt-4');

      expect(result.promptTokenCount).toBe(100);
      expect(result.candidatesTokenCount).toBe(50);
      expect(result.totalTokenCount).toBe(150);
    });

    it('should fall back to local calculation when API usage is null', () => {
      const localText = {
        candidateText: 'This is a test response',
        thoughtText: 'Some internal reasoning',
      };

      const result = tokenizer.combineUsageInfo(null, localText, 'gpt-4');

      expect(result.promptTokenCount).toBe(0); // No prompt text provided
      expect(result.candidatesTokenCount).toBeGreaterThan(0);
      expect(result.totalTokenCount).toBeGreaterThan(0);
      expect(result.thoughtsTokenCount).toBeGreaterThan(0);
    });

    it('should use hybrid approach when API usage is partial', () => {
      const partialApiUsage = {
        prompt_tokens: 80,
        // completion_tokens and total_tokens missing
      };

      const localText = {
        candidateText: 'AI response text here',
        thoughtText: 'Reasoning process',
      };

      const result = tokenizer.combineUsageInfo(
        partialApiUsage,
        localText,
        'gpt-4',
      );

      expect(result.promptTokenCount).toBe(80); // From API
      expect(result.candidatesTokenCount).toBeGreaterThan(0); // From local calculation
      expect(result.thoughtsTokenCount).toBeGreaterThan(0); // From local calculation
      expect(result.totalTokenCount).toBeGreaterThan(80); // Combined
    });

    it('should handle empty or undefined text gracefully', () => {
      const apiUsage = {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      };

      const result = tokenizer.combineUsageInfo(
        apiUsage,
        { candidateText: undefined },
        'gpt-4',
      );

      expect(result.promptTokenCount).toBe(10);
      expect(result.candidatesTokenCount).toBe(5);
      expect(result.totalTokenCount).toBe(15);
    });
  });
});

describe('StreamTransformer - API Usage Integration', () => {
  let streamTransformer: StreamTransformer;
  let tokenizer: TokenizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TokenizerService, ToolCallProcessor],
    }).compile();

    tokenizer = module.get<TokenizerService>(TokenizerService);
    const toolCallProcessor = module.get<ToolCallProcessor>(ToolCallProcessor);
    streamTransformer = new StreamTransformer(tokenizer, toolCallProcessor);
  });

  afterEach(async () => {
    await tokenizer.onModuleDestroy();
  });

  it('should process API usage from stream chunks', () => {
    const mockChunk = {
      id: 'test-id',
      object: 'chat.completion.chunk' as const,
      created: Date.now(),
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          delta: {
            content: 'Hello world',
          },
          finish_reason: null,
        },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 5,
        total_tokens: 25,
      },
    };

    streamTransformer.initializeForModel('gpt-4', 20);
    const result = streamTransformer.transformStreamChunk(mockChunk);

    expect(result).toBeDefined();
    expect(result.candidates).toHaveLength(1);
  });

  it('should handle stream chunks without usage information', () => {
    const mockChunk = {
      id: 'test-id',
      object: 'chat.completion.chunk' as const,
      created: Date.now(),
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          delta: {
            content: 'Response without usage',
          },
          finish_reason: null,
        },
      ],
      // No usage field
    };

    streamTransformer.initializeForModel('gpt-4', 15);
    const result = streamTransformer.transformStreamChunk(mockChunk);

    expect(result).toBeDefined();
    expect(result.candidates).toHaveLength(1);
  });
});
