import { Injectable } from '@nestjs/common';

/**
 * 双重转义处理工具
 * 基于 llxprt-code 项目的 doubleEscapeUtils 实现
 * 智谱模型可能返回双重转义的JSON，需要特殊处理
 */
@Injectable()
export class DoubleEscapeUtils {
  /**
   * 检测是否应该使用双重转义处理
   */
  shouldUseDoubleEscapeHandling(toolFormat: string): boolean {
    // Qwen 格式需要双重转义处理 (包括使用 qwen 格式的 GLM-4.5)
    return toolFormat === 'qwen';
  }

  /**
   * 检测JSON字符串是否被双重字符串化
   */
  detectDoubleEscaping(jsonString: string): {
    isDoubleEscaped: boolean;
    correctedValue?: unknown;
    originalValue: string;
    detectionDetails: {
      firstParse?: string;
      secondParse?: unknown;
      error?: string;
    };
  } {
    const result: {
      isDoubleEscaped: boolean;
      correctedValue?: unknown;
      originalValue: string;
      detectionDetails: {
        firstParse?: string;
        secondParse?: unknown;
        error?: string;
      };
    } = {
      isDoubleEscaped: false,
      correctedValue: undefined,
      originalValue: jsonString,
      detectionDetails: {},
    };

    try {
      const parsed = JSON.parse(jsonString);

      if (typeof parsed === 'string') {
        result.detectionDetails.firstParse = parsed;

        // 参数被字符串化了，检查是否被双重字符串化
        try {
          const doubleParsed = JSON.parse(parsed);
          result.isDoubleEscaped = true;
          result.correctedValue = doubleParsed;
          result.detectionDetails.secondParse = doubleParsed;
        } catch {
          // 不是双重字符串化，只是单重字符串化
          result.correctedValue = parsed;
        }
      } else if (typeof parsed === 'object' && parsed !== null) {
        // 检查是否是包含字符串化值的对象（常见模式）
        const hasStringifiedValues = Object.values(parsed).some((value) => {
          if (typeof value === 'string') {
            try {
              const testParse = JSON.parse(value);
              // 如果能解析且是数组或对象，可能是字符串化的
              return typeof testParse === 'object';
            } catch {
              return false;
            }
          }
          return false;
        });

        if (hasStringifiedValues) {
          // 修复字符串化的值
          const fixed = { ...parsed };
          for (const [key, value] of Object.entries(fixed)) {
            if (typeof value === 'string') {
              try {
                const testParse = JSON.parse(value);
                if (typeof testParse === 'object') {
                  fixed[key] = testParse;
                  result.isDoubleEscaped = true;
                }
              } catch {
                // 如果无法解析则保留原值
              }
            }
          }
          result.correctedValue = fixed;
        } else {
          result.correctedValue = parsed;
        }
      } else {
        // 已经正确解析
        result.correctedValue = parsed;
      }
    } catch (parseError) {
      result.detectionDetails.error = String(parseError);
    }

    return result;
  }

  /**
   * 处理工具调用参数，修复双重转义（如果检测到）
   */
  processToolParameters(
    parametersString: string,
    toolName: string = 'unknown',
    format: string = 'qwen',
  ): unknown {
    if (!parametersString.trim()) {
      return {};
    }

    const normalizedToolName = toolName?.toLowerCase?.() ?? 'unknown';
    const normalizedFormat = format?.toLowerCase?.() ?? 'qwen';
    const effectiveFormat = this.shouldUseDoubleEscapeHandling(normalizedFormat)
      ? normalizedFormat
      : normalizedToolName.includes('glm') ||
          normalizedToolName.includes('qwen') ||
          normalizedToolName.includes('double_escape')
        ? 'qwen'
        : normalizedFormat;

    // 只对需要双重转义处理的格式应用
    if (!this.shouldUseDoubleEscapeHandling(effectiveFormat)) {
      // 对于不需要双重转义处理的格式，解析JSON字符串
      try {
        return JSON.parse(parametersString);
      } catch {
        return parametersString; // 如果不是有效JSON则原样返回
      }
    }

    // 对 qwen 格式应用双重转义检测和修复
    const detection = this.detectDoubleEscaping(parametersString);

    if (detection.isDoubleEscaped) {
      // 为 qwen 格式转换字符串数字为实际数字
      return this.convertStringNumbersToNumbers(detection.correctedValue);
    } else if (detection.detectionDetails.error) {
      // 如果解析失败则原样返回字符串
      return parametersString;
    }

    // 为 qwen 格式转换字符串数字为实际数字
    return this.convertStringNumbersToNumbers(detection.correctedValue);
  }

  /**
   * 将对象中的字符串数字转换为实际数字
   * qwen 模型会将数字参数字符串化，需要这个转换
   */
  private convertStringNumbersToNumbers(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      // 检查是否是数字字符串
      if (/^-?\d+$/.test(obj)) {
        // 整数
        const num = parseInt(obj, 10);
        if (!isNaN(num)) return num;
      } else if (/^-?\d*\.?\d+$/.test(obj)) {
        // 浮点数
        const num = parseFloat(obj);
        if (!isNaN(num)) return num;
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.convertStringNumbersToNumbers(item));
    }

    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.convertStringNumbersToNumbers(value);
      }
      return result;
    }

    return obj;
  }

  /**
   * 安全解析可能存在双重转义的JSON
   * 这是一个简化的接口，使用默认参数
   */
  safeParse(jsonString: string): any {
    return this.processToolParameters(jsonString, 'unknown', 'qwen');
  }

  /**
   * 向后兼容的方法
   */
  fixDoubleEscape(jsonString: string): string {
    const result = this.processToolParameters(jsonString, 'unknown', 'qwen');
    return typeof result === 'string' ? result : JSON.stringify(result);
  }

  /**
   * 向后兼容的方法
   */
  detectDoubleEscape(jsonString: string): boolean {
    const detection = this.detectDoubleEscaping(jsonString);
    return detection.isDoubleEscaped;
  }
}
