import { Injectable } from '@nestjs/common';

import {
  AnthropicTool,
  IGeminiTool,
  ITool,
  IToolFormatter,
  OpenAITool,
  ResponsesTool,
  StreamingToolCall,
  ToolCallBlock,
  ToolFormat,
} from './tool-formatter.types';

/**
 * 工具参数Schema规范化工具（移植自 llxprt-code 的核心思路）
 *
 * 目标：
 * - 递归规范 Gemini 参数Schema 到标准 JSON Schema
 * - 将大写的类型枚举转为小写
 * - 将字符串数值字段（如 minLength/maxLength）安全地转换为数字
 * - 规范 items/properties 的嵌套结构
 */
@Injectable()
export class ToolFormatter implements IToolFormatter {
  convertGeminiToOpenAI(geminiTools: IGeminiTool[]): OpenAITool[] {
    return geminiTools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters ?? {
          type: 'object',
          properties: {},
        },
      },
    }));
  }

  convertGeminiToAnthropic(geminiTools: IGeminiTool[]): AnthropicTool[] {
    return geminiTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters ?? {
        type: 'object',
        properties: {},
      },
    }));
  }

  convertGeminiToFormat(
    geminiTools: IGeminiTool[],
    format: ToolFormat,
  ): unknown {
    switch (format) {
      case ToolFormat.OPENAI:
        return this.convertGeminiToOpenAI(geminiTools);
      case ToolFormat.ANTHROPIC:
        return this.convertGeminiToAnthropic(geminiTools);
      default:
        return geminiTools;
    }
  }

  fromProviderFormat(
    rawToolCall: unknown,
    format: ToolFormat,
  ): ToolCallBlock[] {
    if (!rawToolCall) {
      return [];
    }

    if (Array.isArray(rawToolCall)) {
      return rawToolCall as ToolCallBlock[];
    }

    if (format === ToolFormat.OPENAI && typeof rawToolCall === 'object') {
      const call = rawToolCall as {
        id?: string;
        function?: { name?: string; arguments?: unknown };
      };
      return [
        {
          type: 'tool_call',
          id: call.id ?? 'tool-call',
          name: call.function?.name ?? 'unknown',
          parameters: call.function?.arguments ?? {},
        },
      ];
    }

    return [];
  }

  accumulateStreamingToolCall(
    deltaToolCall: any,
    accumulatedToolCalls: Map<string, any>,
    format: ToolFormat,
  ): void {
    if (!deltaToolCall || typeof deltaToolCall !== 'object') {
      return;
    }

    const identifier = deltaToolCall.id ?? 'stream';
    const existing = accumulatedToolCalls.get(identifier) ?? {};

    if (format === ToolFormat.OPENAI) {
      const merged: StreamingToolCall = {
        id: identifier,
        name: deltaToolCall.function?.name ?? existing.name,
        parameters:
          (existing.parameters ?? '') +
          (deltaToolCall.function?.arguments ?? ''),
        isComplete: Boolean(deltaToolCall.isComplete ?? existing.isComplete),
      };
      accumulatedToolCalls.set(identifier, merged);
      return;
    }

    accumulatedToolCalls.set(identifier, {
      ...existing,
      ...deltaToolCall,
    });
  }

  toResponsesTool(tools: ITool[]): ResponsesTool[] {
    return tools.map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters ?? {},
    }));
  }

  fixParameterTypes(
    parameters: Record<string, any>,
    toolName: string,
  ): Record<string, any> {
    if (!parameters || typeof parameters !== 'object') {
      return {};
    }

    const normalized: Record<string, any> = {};
    for (const [key, value] of Object.entries(parameters)) {
      normalized[key] = this.normalizeValue(value);
    }

    if (toolName.toLowerCase().includes('weather')) {
      normalized.unit = normalized.unit ?? 'celsius';
    }

    return normalized;
  }

  /**
   * 将 Gemini 风格的参数 Schema 规范化为标准 JSON Schema
   * 注意：此方法是纯函数式转换，不修改入参对象
   */
  convertGeminiSchemaToStandard(schema: unknown): unknown {
    if (!schema || typeof schema !== 'object') return schema;

    const src = schema as Record<string, unknown>;
    const dst: Record<string, unknown> = { ...src };

    // 递归处理 properties
    if (dst.properties && typeof dst.properties === 'object') {
      const newProps: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(
        dst.properties as Record<string, unknown>,
      )) {
        newProps[k] = this.convertGeminiSchemaToStandard(v);
      }
      dst.properties = newProps;
    }

    // 递归处理 items（数组）
    if (dst.items !== undefined) {
      const items = dst.items as unknown;
      if (Array.isArray(items)) {
        dst.items = items.map((it) => this.convertGeminiSchemaToStandard(it));
      } else {
        dst.items = this.convertGeminiSchemaToStandard(items);
      }
    }

    // type: 大写 -> 小写 字符串
    if (dst.type !== undefined) {
      const typeValue = dst.type;
      if (typeof typeValue === 'string') {
        dst.type = typeValue.toLowerCase();
      } else if (Array.isArray(typeValue)) {
        dst.type = typeValue.map((v) =>
          typeof v === 'string' ? v.toLowerCase() : v,
        );
      } else if (
        typeof typeValue === 'number' ||
        typeof typeValue === 'boolean'
      ) {
        dst.type = String(typeValue).toLowerCase();
      } else {
        delete dst.type;
      }
    }

    // enum: 统一为字符串数组（保持值语义不变）
    if (Array.isArray(dst.enum)) {
      dst.enum = (dst.enum as unknown[]).map((v) => String(v));
    }

    // 将 minLength/maxLength 的字符串数值转换为数字
    if (typeof dst.minLength === 'string') {
      const n = parseInt(dst.minLength, 10);
      if (!Number.isNaN(n)) dst.minLength = n;
      else delete dst.minLength;
    }
    if (typeof dst.maxLength === 'string') {
      const n = parseInt(dst.maxLength, 10);
      if (!Number.isNaN(n)) dst.maxLength = n;
      else delete dst.maxLength;
    }

    return dst;
  }

  private normalizeValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^-?\d+$/.test(trimmed) || /^-?\d*\.\d+$/.test(trimmed)) {
        const num = Number(trimmed);
        return Number.isNaN(num) ? value : num;
      }
      if (/^(true|false)$/i.test(trimmed)) {
        return trimmed.toLowerCase() === 'true';
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeValue(item));
    }
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) {
        result[key] = this.normalizeValue(entry);
      }
      return result;
    }
    return value;
  }
}
