import { Injectable, Logger } from '@nestjs/common';
import { DoubleEscapeUtils } from './doubleEscapeUtils';

/**
 * 工具调用处理器
 * 基于 llxprt-code 项目的 ToolFormatter 实现
 * 专门处理智谱/GLM模型的工具调用双重转义问题
 */
@Injectable()
export class ToolCallProcessor {
  private readonly logger = new Logger(ToolCallProcessor.name);
  private readonly doubleEscapeUtils = new DoubleEscapeUtils();

  /**
   * 安全解析工具调用参数，处理双重转义
   * 移植自 llxprt-code ToolFormatter.fromProviderFormat 方法
   */
  parseToolCallArguments(
    argumentsString: string,
    toolName: string,
    format: string = 'qwen'
  ): unknown {
    if (!argumentsString || !argumentsString.trim()) {
      return {};
    }

    // 对于 Qwen/GLM 模型，使用双重转义处理
    if (format === 'qwen' || format === 'glm') {
      return this.processQwenToolCallArguments(argumentsString, toolName);
    }

    // 对于其他格式，直接解析
    try {
      return JSON.parse(argumentsString);
    } catch (error) {
      this.logger.warn(`Failed to parse tool call arguments for ${toolName}:`, error);
      return {};
    }
  }

  /**
   * 处理 Qwen/GLM 格式的工具调用参数
   * 移植自 llxprt-code ToolFormatter 中的 Qwen 处理逻辑
   */
  private processQwenToolCallArguments(argumentsString: string, toolName: string): unknown {
    try {
      // 第一次解析
      const parsed = JSON.parse(argumentsString);

      if (typeof parsed === 'string') {
        // 参数被字符串化了，检查是否被双重字符串化
        try {
          const doubleParsed = JSON.parse(parsed);
          this.logger.warn(
            `[Qwen/GLM] Arguments appear to be double-stringified for ${toolName}`,
            {
              firstParse: parsed,
              secondParse: doubleParsed,
              originalLength: argumentsString.length,
            }
          );

          // 使用双重转义处理工具处理
          return this.doubleEscapeUtils.processToolParameters(argumentsString, toolName, 'qwen');
        } catch {
          // 不是双重字符串化，只是单重字符串化
          this.logger.debug(
            `[Qwen/GLM] Arguments are single-stringified for ${toolName}`
          );
          return JSON.parse(parsed);
        }
      }

      // 已经是对象，直接返回
      return parsed;
    } catch (error) {
      this.logger.error(
        `[Qwen/GLM] Failed to parse arguments for ${toolName}:`,
        error
      );

      // 回退到双重转义处理工具
      try {
        return this.doubleEscapeUtils.processToolParameters(argumentsString, toolName, 'qwen');
      } catch (fallbackError) {
        this.logger.error(
          `[Qwen/GLM] Fallback parsing also failed for ${toolName}:`,
          fallbackError
        );
        return {};
      }
    }
  }

  /**
   * 检测流式工具调用中的双重转义模式
   * 移植自 llxprt-code ToolFormatter.accumulateStreamingToolCall
   */
  detectDoubleEscapingInStreamChunk(chunk: string, toolName: string): boolean {
    // 检查是否包含双重转义的模式
    const hasDoubleEscaping =
      chunk.includes('\\"[') ||
      chunk.includes('\\\\"') ||
      (chunk.startsWith('"\\"') && chunk.endsWith('\\""'));

    if (hasDoubleEscaping) {
      this.logger.warn(
        `[Qwen/GLM] Detected potential double-stringification in streaming chunk for ${toolName}`,
        {
          chunk,
          pattern: 'Contains escaped quotes that suggest double-stringification',
        }
      );
    }

    return hasDoubleEscaping;
  }

  /**
   * 判断是否应该使用增强的工具调用处理
   */
  shouldUseEnhancedProcessing(model: string): boolean {
    // 智谱/GLM 模型需要特殊处理
    const zhipuPatterns = ['glm-', 'GLM-', 'zhipu-', 'chatglm-'];
    return zhipuPatterns.some(pattern =>
      model.toLowerCase().includes(pattern.toLowerCase())
    );
  }
}

// 导出处理函数，用于非依赖注入的场景
export function parseToolCallArguments(
  argumentsString: string,
  toolName: string = 'unknown',
  format: string = 'qwen'
): unknown {
  const processor = new ToolCallProcessor();
  return processor.parseToolCallArguments(argumentsString, toolName, format);
}