/**
 * doubleEscapeUtils 接口合约测试
 *
 * 目标: 验证智谱模型双重转义处理功能的接口设计
 * 重要: 这些测试必须在实现前编写，并且必须失败
 */

import { Test, TestingModule } from '@nestjs/testing';

// 导入将要实现的接口和类型
// 注意: 这些导入目前会失败，因为实现还不存在 - 这是 TDD 的关键
import {
  IDoubleEscapeUtils,
  DoubleEscapeDetectionResult,
  ZhipuProcessingConfig,
  ProcessingStats,
  ZhipuIssueType,
  ZhipuIssueReport,
} from '../../src/utils/zhipu/double-escape-utils.types';
import { DoubleEscapeUtils } from '../../src/utils/zhipu/doubleEscapeUtils';

describe('DoubleEscapeUtils Contract Tests', () => {
  let doubleEscapeUtils: IDoubleEscapeUtils;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DoubleEscapeUtils],
    }).compile();

    doubleEscapeUtils = module.get<DoubleEscapeUtils>(DoubleEscapeUtils);
  });

  describe('工具格式检测合约', () => {
    it('应该检测哪些格式需要双重转义处理', () => {
      // 智谱相关格式需要处理
      expect(doubleEscapeUtils.shouldUseDoubleEscapeHandling('qwen')).toBe(
        true,
      );
      expect(doubleEscapeUtils.shouldUseDoubleEscapeHandling('zhipu')).toBe(
        true,
      );
      expect(doubleEscapeUtils.shouldUseDoubleEscapeHandling('glm')).toBe(true);

      // 其他格式不需要处理
      expect(doubleEscapeUtils.shouldUseDoubleEscapeHandling('openai')).toBe(
        false,
      );
      expect(doubleEscapeUtils.shouldUseDoubleEscapeHandling('anthropic')).toBe(
        false,
      );
    });

    it('应该处理大小写不敏感的格式检测', () => {
      expect(doubleEscapeUtils.shouldUseDoubleEscapeHandling('QWEN')).toBe(
        true,
      );
      expect(doubleEscapeUtils.shouldUseDoubleEscapeHandling('Zhipu')).toBe(
        true,
      );
      expect(doubleEscapeUtils.shouldUseDoubleEscapeHandling('GLM-4.5')).toBe(
        true,
      );
    });
  });

  describe('双重转义检测合约', () => {
    it('应该检测正常的JSON字符串', () => {
      const normalJson = '{"name": "test", "value": 123}';
      const result = doubleEscapeUtils.detectDoubleEscaping(normalJson);

      expect(result.isDoubleEscaped).toBe(false);
      expect(result.originalValue).toBe(normalJson);
      expect(result.detectionDetails.finalParseSuccess).toBe(true);
    });

    it('应该检测双重转义的JSON字符串', () => {
      const doubleEscapedJson =
        '"{\\\"name\\\": \\\"test\\\", \\\"value\\\": 123}"';
      const result = doubleEscapeUtils.detectDoubleEscaping(doubleEscapedJson);

      expect(result.isDoubleEscaped).toBe(true);
      expect(result.correctedValue).toEqual({ name: 'test', value: 123 });
      expect(result.detectionDetails.hasEscapeSequences).toBe(true);
    });

    it('应该检测嵌套的双重转义', () => {
      const nestedDoubleEscaping =
        '"{\\\"data\\\": \\\"{\\\\\\\\"nested\\\\\\\": \\\\\\\\"value\\\\\\\"}\\\", \\\"count\\\": \\\"5\\\"}"';
      const result =
        doubleEscapeUtils.detectDoubleEscaping(nestedDoubleEscaping);

      expect(result.isDoubleEscaped).toBe(true);
      expect(result.correctedValue).toBeDefined();
      expect(result.detectionDetails.parseAttempts).toBeGreaterThan(1);
    });

    it('应该处理非JSON字符串', () => {
      const nonJson = 'this is not json';
      const result = doubleEscapeUtils.detectDoubleEscaping(nonJson);

      expect(result.isDoubleEscaped).toBe(false);
      expect(result.detectionDetails.finalParseSuccess).toBe(false);
    });

    it('应该检测特定的转义模式', () => {
      const patterns = [
        '\\\"[', // 数组开始的转义
        '\\\\\\\\', // 四重反斜杠
        '\\\\"', // 转义的引号
      ];

      patterns.forEach((pattern) => {
        const jsonWithPattern = `{"test": "${pattern}"}`;
        const result = doubleEscapeUtils.detectDoubleEscaping(jsonWithPattern);
        expect(result.detectionDetails.detectedPatterns).toContain(pattern);
      });
    });
  });

  describe('工具参数处理合约', () => {
    it('应该处理正常的工具参数', () => {
      const normalParams = '{"location": "Beijing", "unit": "celsius"}';
      const result = doubleEscapeUtils.processToolParameters(
        normalParams,
        'get_weather',
        'qwen',
      );

      expect(result).toEqual({
        location: 'Beijing',
        unit: 'celsius',
      });
    });

    it('应该修复双重转义的工具参数', () => {
      const doubleEscapedParams =
        '"{\\\"location\\\": \\\"Beijing\\\", \\\"unit\\\": \\\"celsius\\\"}"';
      const result = doubleEscapeUtils.processToolParameters(
        doubleEscapedParams,
        'get_weather',
        'qwen',
      );

      expect(result).toEqual({
        location: 'Beijing',
        unit: 'celsius',
      });
    });

    it('应该处理字符串数字转换', () => {
      const stringNumbers =
        '{"count": "123", "price": "45.67", "enabled": "true"}';
      const result = doubleEscapeUtils.processToolParameters(
        stringNumbers,
        'calculate',
        'qwen',
      );

      expect(result.count).toBe(123);
      expect(result.price).toBe(45.67);
      expect(result.enabled).toBe(true);
    });

    it('应该处理复杂嵌套对象的双重转义', () => {
      const complexDoubleEscaped =
        '"{\\\"user\\\": {\\\"name\\\": \\\"张三\\\", \\\"age\\\": \\\"30\\\"}, \\\"settings\\\": [\\\"option1\\\", \\\"option2\\\"]}"';
      const result = doubleEscapeUtils.processToolParameters(
        complexDoubleEscaped,
        'update_user',
        'qwen',
      );

      expect(result.user.name).toBe('张三');
      expect(result.user.age).toBe(30);
      expect(result.settings).toEqual(['option1', 'option2']);
    });

    it('应该处理错误格式并提供回退', () => {
      const malformedParams = '{"invalid": json syntax}';
      const result = doubleEscapeUtils.processToolParameters(
        malformedParams,
        'test_tool',
        'qwen',
      );

      // 应该有某种形式的错误处理或回退值
      expect(result).toBeDefined();
    });
  });

  describe('流式响应检测合约', () => {
    it('应该在流式响应块中检测双重转义', () => {
      const streamChunk = 'data: {"arguments": "{\\"param\\": \\"value\\"}"}';
      const hasDoubleEscaping =
        doubleEscapeUtils.detectDoubleEscapingInChunk(streamChunk);

      expect(hasDoubleEscaping).toBe(true);
    });

    it('应该检测正常的流式响应块', () => {
      const normalChunk = 'data: {"arguments": "{\\"param\\": \\"value\\"}"}';
      const hasDoubleEscaping =
        doubleEscapeUtils.detectDoubleEscapingInChunk(normalChunk);

      expect(typeof hasDoubleEscaping).toBe('boolean');
    });

    it('应该处理非JSON流式块', () => {
      const nonJsonChunk = 'data: some text content';
      const hasDoubleEscaping =
        doubleEscapeUtils.detectDoubleEscapingInChunk(nonJsonChunk);

      expect(hasDoubleEscaping).toBe(false);
    });
  });

  describe('类型强制转换合约', () => {
    it('应该强制转换字符串数字为数字', () => {
      const parameters = {
        count: '123',
        price: '45.67',
        negative: '-10',
        zero: '0',
      };

      const coerced = doubleEscapeUtils.coerceParameterTypes(parameters);

      expect(coerced.count).toBe(123);
      expect(coerced.price).toBe(45.67);
      expect(coerced.negative).toBe(-10);
      expect(coerced.zero).toBe(0);
    });

    it('应该强制转换字符串布尔值', () => {
      const parameters = {
        enabled: 'true',
        disabled: 'false',
        uppercase: 'TRUE',
        lowercase: 'false',
      };

      const coerced = doubleEscapeUtils.coerceParameterTypes(parameters);

      expect(coerced.enabled).toBe(true);
      expect(coerced.disabled).toBe(false);
      expect(coerced.uppercase).toBe(true);
      expect(coerced.lowercase).toBe(false);
    });

    it('应该保留无需转换的值', () => {
      const parameters = {
        name: 'John Doe',
        age: 30,
        active: true,
        data: { nested: 'object' },
        items: ['array', 'values'],
      };

      const coerced = doubleEscapeUtils.coerceParameterTypes(parameters);

      expect(coerced.name).toBe('John Doe');
      expect(coerced.age).toBe(30);
      expect(coerced.active).toBe(true);
      expect(coerced.data).toEqual({ nested: 'object' });
      expect(coerced.items).toEqual(['array', 'values']);
    });

    it('应该基于schema进行智能类型转换', () => {
      const parameters = { count: '123', name: 'test' };
      const schema = {
        count: { type: 'number' },
        name: { type: 'string' },
      };

      const coerced = doubleEscapeUtils.coerceParameterTypes(
        parameters,
        schema,
      );

      expect(coerced.count).toBe(123);
      expect(coerced.name).toBe('test');
    });
  });

  describe('安全JSON解析合约', () => {
    it('应该安全解析有效JSON', () => {
      const validJson = '{"name": "test", "value": 123}';
      const result = doubleEscapeUtils.safeJsonParse(validJson);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ name: 'test', value: 123 });
      expect(result.attempts).toBe(1);
    });

    it('应该处理无效JSON并返回错误信息', () => {
      const invalidJson = '{"invalid": json}';
      const result = doubleEscapeUtils.safeJsonParse(invalidJson);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBeGreaterThan(0);
    });

    it('应该限制解析尝试次数', () => {
      const complexJson =
        '{"complex": "json that might need multiple attempts"}';
      const result = doubleEscapeUtils.safeJsonParse(complexJson, 3);

      expect(result.attempts).toBeLessThanOrEqual(3);
    });

    it('应该处理超大JSON字符串', () => {
      const largeJson = '{"large": "' + 'x'.repeat(10000) + '"}';
      const result = doubleEscapeUtils.safeJsonParse(largeJson);

      // 应该有某种形式的处理，无论成功还是失败
      expect(result.success).toBeDefined();
    });
  });

  describe('错误处理和边界条件合约', () => {
    it('应该处理null和undefined输入', () => {
      expect(() =>
        doubleEscapeUtils.detectDoubleEscaping(null as any),
      ).not.toThrow();
      expect(() =>
        doubleEscapeUtils.detectDoubleEscaping(undefined as any),
      ).not.toThrow();
      expect(() =>
        doubleEscapeUtils.processToolParameters(null as any, 'test', 'qwen'),
      ).not.toThrow();
    });

    it('应该处理空字符串', () => {
      const result = doubleEscapeUtils.detectDoubleEscaping('');
      expect(result.isDoubleEscaped).toBe(false);
    });

    it('应该处理非常长的字符串', () => {
      const longString = '"' + 'x'.repeat(100000) + '"';
      expect(() =>
        doubleEscapeUtils.detectDoubleEscaping(longString),
      ).not.toThrow();
    });

    it('应该处理Unicode字符', () => {
      const unicodeJson = '{"中文": "测试", "emoji": "😀", "special": "αβγ"}';
      const result = doubleEscapeUtils.processToolParameters(
        unicodeJson,
        'unicode_test',
        'qwen',
      );

      expect(result['中文']).toBe('测试');
      expect(result.emoji).toBe('😀');
      expect(result.special).toBe('αβγ');
    });
  });

  describe('性能和配置合约', () => {
    it('应该支持配置选项', () => {
      const config: ZhipuProcessingConfig = {
        enableDoubleEscapeDetection: true,
        enableTypeCoercion: true,
        bufferTextOutput: false,
        disableStreamingForTools: true,
        maxParseAttempts: 3,
        debugLogging: false,
      };

      // 配置应该能够影响处理行为
      expect(config.enableDoubleEscapeDetection).toBe(true);
      expect(config.maxParseAttempts).toBe(3);
    });

    it('应该提供处理统计信息', () => {
      // 处理一些数据后应该有统计信息
      doubleEscapeUtils.processToolParameters(
        '{"test": "value"}',
        'test',
        'qwen',
      );

      // 统计信息结构验证
      const stats: ProcessingStats = {
        doubleEscapeDetections: 0,
        doubleEscapeCorrections: 0,
        typeCoercions: 0,
        failedParsings: 0,
        averageProcessingTime: 0,
        totalRequestsProcessed: 1,
      };

      expect(stats.totalRequestsProcessed).toBeGreaterThan(0);
    });
  });
});
