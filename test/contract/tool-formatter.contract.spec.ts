/**
 * ToolFormatter 接口合约测试
 *
 * 目标: 验证 ToolFormatter 的核心接口设计是否符合预期
 * 重要: 这些测试必须在实现前编写，并且必须失败
 */

import { Test, TestingModule } from '@nestjs/testing';

// 导入将要实现的接口和类型
// 注意: 这些导入目前会失败，因为实现还不存在 - 这是 TDD 的关键
import {
  IToolFormatter,
  ToolFormat,
  IGeminiTool,
  OpenAITool,
  AnthropicTool,
  ToolCallBlock,
} from '../../src/transformers/enhanced/tool-formatter.types';
import { ToolFormatter } from '../../src/transformers/enhanced/ToolFormatter';

describe('ToolFormatter Contract Tests', () => {
  let toolFormatter: IToolFormatter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ToolFormatter],
    }).compile();

    toolFormatter = module.get<ToolFormatter>(ToolFormatter);
  });

  describe('ToolFormat Enum Contract', () => {
    it('应该定义所有必需的工具格式', () => {
      // 验证支持的格式完整性
      expect(ToolFormat.OPENAI).toBe('openai');
      expect(ToolFormat.ANTHROPIC).toBe('anthropic');
      expect(ToolFormat.DEEPSEEK).toBe('deepseek');
      expect(ToolFormat.QWEN).toBe('qwen');
      expect(ToolFormat.HERMES).toBe('hermes');
      expect(ToolFormat.XML).toBe('xml');
      expect(ToolFormat.LLAMA).toBe('llama');
      expect(ToolFormat.GEMMA).toBe('gemma');
    });
  });

  describe('Gemini to OpenAI 转换合约', () => {
    it('应该将 Gemini 工具转换为 OpenAI 格式', () => {
      const geminiTools: IGeminiTool[] = [
        {
          name: 'get_weather',
          description: 'Get weather information',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'City name' },
              unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
            },
            required: ['location'],
          },
        },
      ];

      const result = toolFormatter.convertGeminiToOpenAI(geminiTools);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather information',
          parameters: expect.objectContaining({
            type: 'object',
            properties: expect.any(Object),
            required: ['location'],
          }),
        },
      });
    });

    it('应该处理空工具数组', () => {
      const result = toolFormatter.convertGeminiToOpenAI([]);
      expect(result).toEqual([]);
    });

    it('应该处理复杂嵌套参数', () => {
      const complexTool: IGeminiTool = {
        name: 'complex_function',
        description: 'A complex function with nested parameters',
        parameters: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                preferences: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
          },
        },
      };

      const result = toolFormatter.convertGeminiToOpenAI([complexTool]);
      expect(result[0].function.parameters.properties.user).toBeDefined();
    });
  });

  describe('Gemini to Anthropic 转换合约', () => {
    it('应该将 Gemini 工具转换为 Anthropic 格式', () => {
      const geminiTools: IGeminiTool[] = [
        {
          name: 'calculate',
          description: 'Perform calculation',
          parameters: {
            type: 'object',
            properties: {
              expression: { type: 'string' },
            },
            required: ['expression'],
          },
        },
      ];

      const result = toolFormatter.convertGeminiToAnthropic(geminiTools);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'calculate',
        description: 'Perform calculation',
        input_schema: expect.objectContaining({
          type: 'object',
          properties: expect.any(Object),
          required: ['expression'],
        }),
      });
    });
  });

  describe('通用格式转换合约', () => {
    it('应该根据指定格式转换工具', () => {
      const geminiTool: IGeminiTool = {
        name: 'test_tool',
        description: 'Test tool',
        parameters: {
          type: 'object',
          properties: { param: { type: 'string' } },
        },
      };

      // 测试不同格式转换
      const openaiResult = toolFormatter.convertGeminiToFormat(
        [geminiTool],
        ToolFormat.OPENAI,
      );
      const anthropicResult = toolFormatter.convertGeminiToFormat(
        [geminiTool],
        ToolFormat.ANTHROPIC,
      );
      const qwenResult = toolFormatter.convertGeminiToFormat(
        [geminiTool],
        ToolFormat.QWEN,
      );

      // 验证每种格式都有结果
      expect(openaiResult).toBeDefined();
      expect(anthropicResult).toBeDefined();
      expect(qwenResult).toBeDefined();
    });

    it('应该对不支持的格式抛出错误或回退', () => {
      const geminiTool: IGeminiTool = {
        name: 'test_tool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {} },
      };

      // 测试潜在的无效格式处理
      expect(() => {
        toolFormatter.convertGeminiToFormat(
          [geminiTool],
          'invalid_format' as ToolFormat,
        );
      }).not.toThrow(); // 应该有优雅的处理方式
    });
  });

  describe('Provider格式解析合约', () => {
    it('应该从 OpenAI 格式解析工具调用', () => {
      const openaiToolCall = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"location": "Beijing", "unit": "celsius"}',
        },
      };

      const result = toolFormatter.fromProviderFormat(
        openaiToolCall,
        ToolFormat.OPENAI,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'tool_call',
        id: 'call_123',
        name: 'get_weather',
        parameters: {
          location: 'Beijing',
          unit: 'celsius',
        },
      });
    });

    it('应该处理格式错误的 JSON 参数', () => {
      const malformedToolCall = {
        id: 'call_456',
        type: 'function',
        function: {
          name: 'test_function',
          arguments: '{"invalid": json}', // 故意的错误JSON
        },
      };

      // 应该优雅地处理错误
      expect(() => {
        toolFormatter.fromProviderFormat(malformedToolCall, ToolFormat.OPENAI);
      }).not.toThrow();
    });
  });

  describe('流式工具调用累积合约', () => {
    it('应该累积流式工具调用数据', () => {
      const accumulatedCalls = new Map<string, any>();

      const delta1 = {
        id: 'call_789',
        function: { name: 'stream_test' },
      };

      const delta2 = {
        id: 'call_789',
        function: { arguments: '{"param":' },
      };

      const delta3 = {
        id: 'call_789',
        function: { arguments: ' "value"}' },
      };

      // 累积流式数据
      toolFormatter.accumulateStreamingToolCall(
        delta1,
        accumulatedCalls,
        ToolFormat.OPENAI,
      );
      toolFormatter.accumulateStreamingToolCall(
        delta2,
        accumulatedCalls,
        ToolFormat.OPENAI,
      );
      toolFormatter.accumulateStreamingToolCall(
        delta3,
        accumulatedCalls,
        ToolFormat.OPENAI,
      );

      // 验证累积结果
      expect(accumulatedCalls.has('call_789')).toBe(true);
      const accumulated = accumulatedCalls.get('call_789');
      expect(accumulated.function.name).toBe('stream_test');
      expect(accumulated.function.arguments).toContain('param');
    });
  });

  describe('Responses API 格式合约', () => {
    it('应该转换为 Responses API 格式', () => {
      const tools = [
        {
          name: 'response_test',
          description: 'Test response tool',
          parameters: { type: 'object', properties: {} },
        },
      ];

      const result = toolFormatter.toResponsesTool(tools);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'function',
        name: 'response_test',
        description: 'Test response tool',
        parameters: expect.any(Object),
      });
    });
  });

  describe('参数类型修复合约', () => {
    it('应该修复工具参数中的类型问题', () => {
      const parameters = {
        count: '123', // 字符串数字
        price: '45.67', // 字符串浮点数
        enabled: 'true', // 字符串布尔值
        name: 'test', // 正常字符串
      };

      const fixed = toolFormatter.fixParameterTypes(parameters, 'test_tool');

      expect(fixed.count).toBe(123);
      expect(fixed.price).toBe(45.67);
      expect(fixed.enabled).toBe(true);
      expect(fixed.name).toBe('test');
    });
  });

  describe('边界条件合约', () => {
    it('应该处理 undefined 和 null 输入', () => {
      expect(() =>
        toolFormatter.convertGeminiToOpenAI(null as any),
      ).not.toThrow();
      expect(() =>
        toolFormatter.convertGeminiToOpenAI(undefined as any),
      ).not.toThrow();
    });

    it('应该处理空字符串和空对象', () => {
      const emptyTool: IGeminiTool = {
        name: '',
        description: '',
        parameters: { type: 'object', properties: {} },
      };

      expect(() =>
        toolFormatter.convertGeminiToOpenAI([emptyTool]),
      ).not.toThrow();
    });
  });
});
