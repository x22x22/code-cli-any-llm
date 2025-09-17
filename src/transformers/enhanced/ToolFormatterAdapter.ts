import { Injectable } from '@nestjs/common';

/**
 * 工具格式适配器
 * 支持多种工具调用格式的转换
 */
@Injectable()
export class ToolFormatterAdapter {
  /**
   * 将工具转换为指定格式
   */
  formatTool(tool: any, format: 'openai' | 'qwen' = 'openai'): any {
    if (!tool) return tool;

    switch (format) {
      case 'qwen':
        return this.toQwenFormat(tool);
      case 'openai':
      default:
        return this.toOpenAIFormat(tool);
    }
  }

  /**
   * 转换为OpenAI格式
   */
  private toOpenAIFormat(tool: any): any {
    if (tool.function_declarations) {
      // Gemini格式转OpenAI格式
      return tool.function_declarations.map((func: any) => ({
        type: 'function',
        function: {
          name: func.name,
          description: func.description,
          parameters: func.parameters,
        },
      }));
    }

    return tool;
  }

  /**
   * 转换为Qwen格式
   */
  private toQwenFormat(tool: any): any {
    if (tool.function_declarations) {
      // Gemini格式转Qwen格式
      return tool.function_declarations.map((func: any) => ({
        type: 'function',
        function: {
          name: func.name,
          description: func.description,
          parameters: func.parameters,
        },
      }));
    }

    return tool;
  }

  /**
   * 格式化工具调用响应
   */
  formatToolCall(toolCall: any, format: 'openai' | 'qwen' = 'openai'): any {
    if (!toolCall) return toolCall;

    const functionName = toolCall.function?.name || toolCall.name;
    const serializedArguments =
      typeof toolCall.function?.arguments === 'string'
        ? toolCall.function.arguments
        : JSON.stringify(
            toolCall.function?.arguments || toolCall.arguments || {},
          );

    if (format === 'qwen') {
      return {
        name: functionName,
        arguments: serializedArguments,
      };
    }

    return {
      id: toolCall.id || 'call_' + Math.random().toString(36).substring(2, 11),
      type: 'function',
      function: {
        name: functionName,
        arguments: serializedArguments,
      },
    };
  }
}
