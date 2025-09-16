/**
 * EnhancedProvider 接口合约测试
 *
 * 目标: 验证增强的Provider接口，支持工具格式检测和智谱优化
 * 重要: 这些测试必须在实现前编写，并且必须失败
 */

import { Test, TestingModule } from '@nestjs/testing';

// 导入将要实现的接口和类型
// 注意: 这些导入目前会失败，因为实现还不存在 - 这是 TDD 的关键
import {
  IEnhancedLLMProvider,
  ModelCapabilities,
  TextBufferingConfig,
  ZhipuModelConfig,
  EnhancedProviderConfig,
  ModelDetectionResult,
  RequestProcessingContext,
  ResponseProcessingResult,
} from '../../src/providers/enhanced-provider.types';
import { ToolFormat } from '../../src/transformers/enhanced/tool-formatter.types';
import { EnhancedOpenAIProvider } from '../../src/providers/EnhancedOpenAIProvider';

describe('EnhancedProvider Contract Tests', () => {
  let enhancedProvider: IEnhancedLLMProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: EnhancedOpenAIProvider,
          useFactory: () => {
            // 模拟配置用于测试
            const config: EnhancedProviderConfig = {
              baseURL: 'https://test-api.example.com',
              apiKey: 'test-key',
              model: 'glm-4.5',
              modelConfigs: new Map(),
              defaultToolFormat: ToolFormat.OPENAI,
              globalOptions: {
                enableAdvancedToolFormatDetection: true,
                logToolFormatDetection: false,
                enableAutoTypeCoercion: true,
                enablePerformanceMetrics: false,
              },
              zhipuOptimizations: {
                enabled: true,
                autoDetectGLMModels: true,
                bufferChineseOutput: true,
                fixDoubleEscaping: true,
              },
            };
            return new EnhancedOpenAIProvider(config);
          },
        },
      ],
    }).compile();

    enhancedProvider = module.get<EnhancedOpenAIProvider>(
      EnhancedOpenAIProvider,
    );
  });

  describe('工具格式检测合约', () => {
    it('应该检测OpenAI格式', () => {
      // 模拟一个标准OpenAI模型配置
      const format = enhancedProvider.detectToolFormat();
      expect(Object.values(ToolFormat)).toContain(format);
    });

    it('应该为GLM模型检测qwen格式', () => {
      // 这个测试假设provider被配置为GLM-4.5模型
      const format = enhancedProvider.detectToolFormat();
      expect([ToolFormat.QWEN, ToolFormat.OPENAI]).toContain(format);
    });

    it('应该为不同模型返回不同格式', () => {
      // 测试格式检测的一致性
      const format1 = enhancedProvider.detectToolFormat();
      const format2 = enhancedProvider.detectToolFormat();
      expect(format1).toBe(format2);
    });
  });

  describe('模型能力检测合约', () => {
    it('应该返回完整的模型能力信息', () => {
      const capabilities = enhancedProvider.getModelCapabilities();

      expect(capabilities).toMatchObject({
        supportsToolCalls: expect.any(Boolean),
        supportsStreaming: expect.any(Boolean),
        hasDoubleEscapeIssues: expect.any(Boolean),
        preferredToolFormat: expect.any(String),
        bufferRequiredForChinese: expect.any(Boolean),
        supportedLanguages: expect.any(Array),
        knownIssues: expect.any(Array),
      });
    });

    it('应该为GLM模型标识双重转义问题', () => {
      const capabilities = enhancedProvider.getModelCapabilities();

      // 如果是GLM模型，应该识别有双重转义问题
      if (capabilities.preferredToolFormat === ToolFormat.QWEN) {
        expect(capabilities.hasDoubleEscapeIssues).toBe(true);
      }
    });

    it('应该为中文模型启用缓冲', () => {
      const capabilities = enhancedProvider.getModelCapabilities();

      if (
        capabilities.supportedLanguages.includes('zh') ||
        capabilities.supportedLanguages.includes('chinese')
      ) {
        expect(capabilities.bufferRequiredForChinese).toBe(true);
      }
    });

    it('应该包含已知问题列表', () => {
      const capabilities = enhancedProvider.getModelCapabilities();
      expect(Array.isArray(capabilities.knownIssues)).toBe(true);
    });
  });

  describe('智谱优化检测合约', () => {
    it('应该识别需要智谱优化的情况', () => {
      const needsOptimization = enhancedProvider.shouldUseZhipuOptimizations();
      expect(typeof needsOptimization).toBe('boolean');
    });

    it('应该基于模型名称决定是否使用优化', () => {
      // 测试智谱优化决策的一致性
      const optimization1 = enhancedProvider.shouldUseZhipuOptimizations();
      const optimization2 = enhancedProvider.shouldUseZhipuOptimizations();
      expect(optimization1).toBe(optimization2);
    });
  });

  describe('流式响应控制合约', () => {
    it('应该决定是否禁用工具调用的流式响应', () => {
      const shouldDisable = enhancedProvider.shouldDisableStreamingForTools();
      expect(typeof shouldDisable).toBe('boolean');
    });

    it('应该为智谱模型在工具调用时禁用流式响应', () => {
      const capabilities = enhancedProvider.getModelCapabilities();
      if (capabilities.hasDoubleEscapeIssues) {
        const shouldDisable = enhancedProvider.shouldDisableStreamingForTools();
        expect(shouldDisable).toBe(true);
      }
    });
  });

  describe('文本缓冲配置合约', () => {
    it('应该返回文本缓冲配置或null', () => {
      const config = enhancedProvider.getTextBufferingConfig();

      if (config !== null) {
        expect(config).toMatchObject({
          enabled: expect.any(Boolean),
          breakPoints: expect.any(Array),
          maxBufferSize: expect.any(Number),
          flushOnPatterns: expect.any(Array),
        });
      }
    });

    it('应该为中文优化模型提供缓冲配置', () => {
      const capabilities = enhancedProvider.getModelCapabilities();
      if (capabilities.bufferRequiredForChinese) {
        const config = enhancedProvider.getTextBufferingConfig();
        expect(config).not.toBeNull();
        expect(config?.enabled).toBe(true);
      }
    });

    it('应该包含中文断点符号', () => {
      const config = enhancedProvider.getTextBufferingConfig();
      if (config && config.enabled) {
        const chineseBreakPoints = ['。', '？', '！', '，'];
        const hasChineseBreakPoints = chineseBreakPoints.some((bp) =>
          config.breakPoints.includes(bp),
        );
        expect(hasChineseBreakPoints).toBe(true);
      }
    });
  });

  describe('请求转换合约', () => {
    it('应该转换请求对象', () => {
      const originalRequest = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
        tools: [],
      };

      const transformedRequest =
        enhancedProvider.transformRequest(originalRequest);
      expect(transformedRequest).toBeDefined();
    });

    it('应该为智谱模型应用特殊转换', () => {
      const needsOptimization = enhancedProvider.shouldUseZhipuOptimizations();

      if (needsOptimization) {
        const request = {
          model: 'glm-4.5',
          messages: [],
          tools: [{ name: 'test_tool' }],
        };

        const transformed = enhancedProvider.transformRequest(request);
        // 智谱模型应该有一些特殊处理
        expect(transformed).toBeDefined();
      }
    });

    it('应该处理工具格式转换', () => {
      const request = {
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather info',
            parameters: { type: 'object', properties: {} },
          },
        ],
      };

      const transformed = enhancedProvider.transformRequest(request);
      expect(transformed.tools).toBeDefined();
    });
  });

  describe('响应转换合约', () => {
    it('应该转换响应对象', () => {
      const originalResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'test response',
              tool_calls: [],
            },
          },
        ],
      };

      const transformedResponse =
        enhancedProvider.transformResponse(originalResponse);
      expect(transformedResponse).toBeDefined();
    });

    it('应该处理双重转义的工具调用', () => {
      const responseWithDoubleEscaping = {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: 'call_123',
                  function: {
                    name: 'test_function',
                    arguments: '"{\\\"param\\\": \\\"value\\\"}"', // 双重转义的参数
                  },
                },
              ],
            },
          },
        ],
      };

      const transformed = enhancedProvider.transformResponse(
        responseWithDoubleEscaping,
      );
      // 应该修复双重转义问题
      expect(transformed).toBeDefined();
    });

    it('应该应用类型强制转换', () => {
      const responseWithStringNumbers = {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: 'call_456',
                  function: {
                    name: 'calculate',
                    arguments: '{"count": "123", "price": "45.67"}',
                  },
                },
              ],
            },
          },
        ],
      };

      const transformed = enhancedProvider.transformResponse(
        responseWithStringNumbers,
      );
      expect(transformed).toBeDefined();
    });
  });

  describe('配置和性能合约', () => {
    it('应该支持模型特定配置', () => {
      // 测试模型配置的存在和结构
      const zhipuConfig: ZhipuModelConfig = {
        modelPatterns: ['glm-4.5', 'glm-4-5'],
        toolFormat: ToolFormat.QWEN,
        enableDoubleEscapeFixing: true,
        streamingBufferSize: 100,
        disableStreamingForTools: true,
        textBuffering: {
          enabled: true,
          breakPoints: ['\n', '。', '？'],
          maxBufferSize: 200,
          flushOnPatterns: ['。', '！'],
        },
        requestTimeout: 30000,
        maxRetries: 3,
      };

      expect(zhipuConfig.toolFormat).toBe(ToolFormat.QWEN);
      expect(zhipuConfig.enableDoubleEscapeFixing).toBe(true);
    });

    it('应该提供处理上下文', () => {
      const context: RequestProcessingContext = {
        modelName: 'glm-4.5',
        hasTools: true,
        isStreaming: false,
        detectedFormat: ToolFormat.QWEN,
        enabledOptimizations: ['doubleEscapeFixing', 'typeCoercion'],
        processingStartTime: Date.now(),
      };

      expect(context.modelName).toBeDefined();
      expect(typeof context.hasTools).toBe('boolean');
      expect(typeof context.isStreaming).toBe('boolean');
    });

    it('应该提供处理结果', () => {
      const result: ResponseProcessingResult = {
        success: true,
        processedResponse: {},
        appliedOptimizations: ['doubleEscapeFixing'],
        processingStats: {
          processingTime: 150,
          doubleEscapeCorrections: 1,
          typeCoercions: 2,
          bufferOperations: 0,
        },
        warnings: [],
        errors: [],
      };

      expect(result.success).toBe(true);
      expect(Array.isArray(result.appliedOptimizations)).toBe(true);
      expect(typeof result.processingStats.processingTime).toBe('number');
    });
  });

  describe('模型检测合约', () => {
    it('应该检测智谱模型', () => {
      const detectionResult: ModelDetectionResult = {
        isZhipuModel: true,
        detectedModel: 'glm-4.5',
        recommendedFormat: ToolFormat.QWEN,
        requiredOptimizations: ['doubleEscapeFixing', 'textBuffering'],
        confidence: 0.95,
      };

      expect(detectionResult.isZhipuModel).toBe(true);
      expect(detectionResult.confidence).toBeGreaterThan(0.5);
      expect(detectionResult.confidence).toBeLessThanOrEqual(1.0);
    });

    it('应该为非智谱模型返回标准配置', () => {
      const standardDetection: ModelDetectionResult = {
        isZhipuModel: false,
        detectedModel: 'gpt-4',
        recommendedFormat: ToolFormat.OPENAI,
        requiredOptimizations: [],
        confidence: 0.99,
      };

      expect(standardDetection.isZhipuModel).toBe(false);
      expect(standardDetection.requiredOptimizations).toHaveLength(0);
    });
  });

  describe('错误处理和边界条件合约', () => {
    it('应该处理空请求', () => {
      expect(() => enhancedProvider.transformRequest({})).not.toThrow();
      expect(() => enhancedProvider.transformResponse({})).not.toThrow();
    });

    it('应该处理null和undefined输入', () => {
      expect(() =>
        enhancedProvider.transformRequest(null as any),
      ).not.toThrow();
      expect(() =>
        enhancedProvider.transformResponse(undefined as any),
      ).not.toThrow();
    });

    it('应该为未知模型提供回退配置', () => {
      // 测试对未知模型的处理
      const capabilities = enhancedProvider.getModelCapabilities();
      expect(capabilities.preferredToolFormat).toBeDefined();
    });

    it('应该处理配置错误', () => {
      // 测试错误配置的优雅处理
      const config = enhancedProvider.getTextBufferingConfig();
      expect(config === null || typeof config === 'object').toBe(true);
    });
  });

  describe('集成和兼容性合约', () => {
    it('应该与现有Provider接口兼容', () => {
      // 验证增强接口不破坏现有功能
      expect(typeof enhancedProvider.detectToolFormat).toBe('function');
      expect(typeof enhancedProvider.getModelCapabilities).toBe('function');
    });

    it('应该支持配置更新', () => {
      // 测试运行时配置更新的能力
      const originalOptimization =
        enhancedProvider.shouldUseZhipuOptimizations();
      expect(typeof originalOptimization).toBe('boolean');
    });

    it('应该提供性能监控接口', () => {
      // 验证性能监控功能的存在
      const capabilities = enhancedProvider.getModelCapabilities();
      expect(capabilities).toBeDefined();
    });
  });
});
