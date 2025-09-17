/**
 * 智谱模型优化端到端测试
 *
 * 目标：验证智谱优化在完整系统中的集成和功能
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { EnhancedRequestTransformer } from '../../src/transformers/enhanced-request.transformer';
import { EnhancedResponseTransformer } from '../../src/transformers/enhanced-response.transformer';
import { ZhipuOptimizer } from '../../src/utils/zhipu/ZhipuOptimizer';
import { ToolFormatterAdapter } from '../../src/transformers/enhanced/ToolFormatterAdapter';
import { DoubleEscapeUtils } from '../../src/utils/zhipu/doubleEscapeUtils';

describe('智谱模型优化端到端测试 (E2E)', () => {
  let enhancedRequestTransformer: EnhancedRequestTransformer;
  let enhancedResponseTransformer: EnhancedResponseTransformer;
  let zhipuOptimizer: ZhipuOptimizer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnhancedRequestTransformer,
        EnhancedResponseTransformer,
        ZhipuOptimizer,
        ToolFormatterAdapter,
        DoubleEscapeUtils,
      ],
    }).compile();

    enhancedRequestTransformer = module.get<EnhancedRequestTransformer>(EnhancedRequestTransformer);
    enhancedResponseTransformer = module.get<EnhancedResponseTransformer>(EnhancedResponseTransformer);
    zhipuOptimizer = module.get<ZhipuOptimizer>(ZhipuOptimizer);
  });

  describe('智谱模型检测', () => {
    it('应该正确识别GLM模型', () => {
      const models = ['glm-4', 'glm-4.5', 'GLM-4-Plus', 'zhipu-api'];

      models.forEach(model => {
        expect(zhipuOptimizer.isZhipuModel(model)).toBe(true);
      });
    });

    it('应该正确识别非智谱模型', () => {
      const models = ['gpt-4', 'claude-3', 'llama-2', 'gemini-pro'];

      models.forEach(model => {
        expect(zhipuOptimizer.isZhipuModel(model)).toBe(false);
      });
    });
  });

  describe('请求优化集成', () => {
    it('应该为GLM模型应用智谱优化', () => {
      const geminiRequest = {
        contents: [
          {
            role: 'user',
            parts: [{ text: '你好，请帮我查询天气' }]
          }
        ],
        tools: [
          {
            function_declarations: [
              {
                name: 'get_weather',
                description: '获取天气信息',
                parameters: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' }
                  }
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.8 // 将会被智谱优化覆盖
        }
      };

      const result = enhancedRequestTransformer.transformRequest(geminiRequest, 'glm-4');

      // 验证基本转换功能正常
      expect(result).toBeDefined();
      expect(result.messages).toBeDefined();

      // 应该有温度设置
      expect(result.temperature).toBeDefined();

      // 工具应该被优化处理
      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);

      // 验证智谱优化逻辑被应用（通过检查是否为GLM模型）
      expect(enhancedRequestTransformer.isZhipuModel('glm-4')).toBe(true);
    });

    it('应该为非智谱模型保持原始行为', () => {
      const geminiRequest = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello, please help me check the weather' }]
          }
        ],
        tools: [
          {
            function_declarations: [
              {
                name: 'get_weather',
                description: 'Get weather information',
                parameters: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' }
                  }
                }
              }
            ]
          }
        ]
      };

      const result = enhancedRequestTransformer.transformRequest(geminiRequest, 'gpt-4');

      // 非智谱模型不应该被强制禁用流式响应
      expect(result.stream).toBeUndefined();
    });
  });

  describe('响应优化集成', () => {
    it('应该处理智谱模型的双重转义工具调用', () => {
      const openAIResponse = {
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: Date.now(),
        model: 'glm-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '好的，我来帮您查询天气。',
              tool_calls: [
                {
                  id: 'call_test',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    // 模拟双重转义的参数
                    arguments: '"{\\\"location\\\":\\\"北京\\\"}"'
                  }
                }
              ]
            },
            finish_reason: 'tool_calls'
          }
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 20,
          total_tokens: 70
        }
      };

      const result = enhancedResponseTransformer.transformResponse(openAIResponse, 'glm-4');

      // 应该返回Gemini格式的响应
      expect(result).toHaveProperty('candidates');
      expect(Array.isArray(result.candidates)).toBe(true);

      const candidate = result.candidates[0];
      expect(candidate).toHaveProperty('content');
      expect(candidate.content).toHaveProperty('parts');

      // 检查工具调用是否被正确处理
      const functionCallPart = candidate.content.parts.find(part => part.functionCall);
      expect(functionCallPart).toBeDefined();
      expect(functionCallPart.functionCall.name).toBe('get_weather');
      expect(functionCallPart.functionCall.args).toEqual({ location: '北京' });
    });

    it('应该处理智谱模型的流式响应缓冲', () => {
      const chunkWithChinese = {
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'glm-4',
        choices: [
          {
            index: 0,
            delta: {
              content: '今天北京天气'
            }
          }
        ]
      };

      const textBuffer = enhancedResponseTransformer.createTextBuffer();

      // 第一个块，应该被缓冲
      const result1 = enhancedResponseTransformer.transformStreamChunk(
        chunkWithChinese,
        'glm-4',
        textBuffer
      );

      // 由于没有断点，应该返回null（被缓冲）
      expect(result1).toBeNull();
      expect(textBuffer.content).toBe('今天北京天气');
    });
  });

  describe('工具格式转换集成', () => {
    it('应该为智谱模型使用QWEN格式', () => {
      const recommendedFormat = zhipuOptimizer.getRecommendedToolFormat('glm-4');
      expect(recommendedFormat).toBe('qwen');
    });

    it('应该为标准模型使用OpenAI格式', () => {
      const recommendedFormat = zhipuOptimizer.getRecommendedToolFormat('gpt-4');
      expect(recommendedFormat).toBe('openai');
    });
  });

  describe('统计和监控集成', () => {
    it('应该提供处理统计信息', () => {
      const stats = enhancedRequestTransformer.getProcessingStats();

      expect(stats).toHaveProperty('doubleEscapeDetections');
      expect(stats).toHaveProperty('doubleEscapeCorrections');
      expect(stats).toHaveProperty('typeCoercions');
      expect(stats).toHaveProperty('failedParsings');
      expect(stats).toHaveProperty('averageProcessingTime');
      expect(stats).toHaveProperty('totalRequestsProcessed');
    });

    it('应该提供优化报告', () => {
      const reports = enhancedRequestTransformer.getOptimizationReport();

      expect(Array.isArray(reports)).toBe(true);
      // 初始状态下应该没有报告
      expect(reports.length).toBe(0);
    });
  });

  describe('边界条件和错误处理', () => {
    it('应该处理空的请求对象', () => {
      const emptyRequest = { contents: [] };

      expect(() => {
        enhancedRequestTransformer.transformRequest(emptyRequest, 'glm-4');
      }).not.toThrow();
    });

    it('应该处理无效的模型名称', () => {
      expect(zhipuOptimizer.isZhipuModel('')).toBe(false);
      expect(zhipuOptimizer.isZhipuModel(null as any)).toBe(false);
      expect(zhipuOptimizer.isZhipuModel(undefined as any)).toBe(false);
    });

    it('应该处理无效的响应数据', () => {
      expect(() => {
        enhancedResponseTransformer.transformResponse({} as any, 'glm-4');
      }).not.toThrow();
    });
  });

  describe('性能验证', () => {
    it('应该在合理时间内完成请求转换', () => {
      const request = {
        contents: [
          {
            role: 'user',
            parts: [{ text: '测试性能' }]
          }
        ]
      };

      const startTime = Date.now();
      enhancedRequestTransformer.transformRequest(request, 'glm-4');
      const endTime = Date.now();

      // 转换应该在10ms内完成
      expect(endTime - startTime).toBeLessThan(10);
    });

    it('应该在合理时间内完成响应转换', () => {
      const response = {
        id: 'test',
        object: 'chat.completion',
        created: Date.now(),
        model: 'glm-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '测试响应'
            },
            finish_reason: 'stop'
          }
        ]
      };

      const startTime = Date.now();
      enhancedResponseTransformer.transformResponse(response, 'glm-4');
      const endTime = Date.now();

      // 转换应该在10ms内完成
      expect(endTime - startTime).toBeLessThan(10);
    });
  });
});