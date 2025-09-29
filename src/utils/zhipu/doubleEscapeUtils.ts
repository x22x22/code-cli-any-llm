import { Injectable } from '@nestjs/common';

import {
  DoubleEscapeDetectionResult,
  IDoubleEscapeUtils,
} from './double-escape-utils.types';

/**
 * 双重转义处理工具
 * 基于 llxprt-code 项目的 doubleEscapeUtils 实现
 * 智谱模型可能返回双重转义的 JSON，需要特殊处理
 */
@Injectable()
export class DoubleEscapeUtils implements IDoubleEscapeUtils {
  shouldUseDoubleEscapeHandling(toolFormat: string): boolean {
    const normalized = toolFormat?.toLowerCase?.().trim() ?? '';
    if (!normalized) {
      return false;
    }
    if (normalized === 'qwen' || normalized === 'zhipu') {
      return true;
    }
    return normalized.startsWith('glm') || normalized.includes('glm');
  }

  detectDoubleEscaping(jsonString: string): DoubleEscapeDetectionResult {
    const original =
      typeof jsonString === 'string' ? jsonString : String(jsonString ?? '');
    const detectionDetails = {
      hasEscapeSequences: /\\/.test(original),
      hasDoubleQuotes: original.includes('\"'),
      parseAttempts: 0,
      finalParseSuccess: false,
      detectedPatterns: [] as string[],
    };

    const result: DoubleEscapeDetectionResult = {
      isDoubleEscaped: false,
      correctedValue: undefined,
      originalValue: original,
      detectionDetails,
    };

    if (!original.trim()) {
      return result;
    }

    const patterns = [String.raw`\"[`, String.raw`\\\\\\\\`, String.raw`\\\"`];
    for (const pattern of patterns) {
      if (original.includes(pattern)) {
        detectionDetails.detectedPatterns.push(pattern);
      }
    }

    try {
      detectionDetails.parseAttempts += 1;
      const parsed = JSON.parse(original);
      detectionDetails.finalParseSuccess = true;

      if (typeof parsed === 'string') {
        detectionDetails.parseAttempts += 1;
        try {
          const doubleParsed = JSON.parse(parsed);
          result.isDoubleEscaped = true;
          result.correctedValue = this.normalizeStructuredValue(doubleParsed);
          return result;
        } catch {
          result.correctedValue = parsed;
          return result;
        }
      }

      if (this.containsStringifiedValues(parsed)) {
        result.isDoubleEscaped = true;
        result.correctedValue = this.normalizeStructuredValue(parsed);
        return result;
      }

      result.correctedValue = parsed;
    } catch {
      // ignore parsing errors; finalParseSuccess 保持 false
    }

    return result;
  }

  processToolParameters(
    parametersString: string,
    toolName: string = 'unknown',
    format: string = 'qwen',
  ): Record<string, any> {
    if (!parametersString || !parametersString.trim()) {
      return {};
    }

    const normalizedFormat = format?.toLowerCase?.() ?? 'qwen';
    const normalizedToolName = toolName?.toLowerCase?.() ?? 'unknown';
    const needsHandling =
      this.shouldUseDoubleEscapeHandling(normalizedFormat) ||
      normalizedToolName.includes('glm') ||
      normalizedToolName.includes('qwen');

    if (!needsHandling) {
      try {
        const parsed = JSON.parse(parametersString);
        return this.ensureRecord(this.normalizeStructuredValue(parsed));
      } catch {
        return { raw: parametersString };
      }
    }

    const detection = this.detectDoubleEscaping(parametersString);

    if (
      detection.correctedValue &&
      typeof detection.correctedValue === 'object'
    ) {
      return this.ensureRecord(
        this.normalizeStructuredValue(detection.correctedValue),
      );
    }

    if (
      detection.isDoubleEscaped &&
      typeof detection.correctedValue === 'string'
    ) {
      const reparsed = this.safeJsonParse(detection.correctedValue);
      if (reparsed.success && typeof reparsed.result === 'object') {
        return this.ensureRecord(
          this.normalizeStructuredValue(reparsed.result),
        );
      }
    }

    try {
      const fallback = JSON.parse(parametersString);
      return this.ensureRecord(this.normalizeStructuredValue(fallback));
    } catch {
      return { raw: parametersString };
    }
  }

  detectDoubleEscapingInChunk(chunk: string): boolean {
    if (typeof chunk !== 'string') {
      return false;
    }

    const lines = chunk.split(/\r?\n/);
    for (const line of lines) {
      const match = line.trim().match(/^data:\s*(.*)$/i);
      if (!match) {
        continue;
      }
      const payloadRaw = match[1];
      try {
        const payload = JSON.parse(payloadRaw) as {
          arguments?: string;
        };
        if (typeof payload.arguments === 'string') {
          const detection = this.detectDoubleEscaping(payload.arguments);
          if (detection.isDoubleEscaped) {
            return true;
          }
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  coerceParameterTypes(
    parameters: Record<string, any>,
    schema?: Record<string, any>,
  ): Record<string, any> {
    if (!parameters || typeof parameters !== 'object') {
      return {};
    }

    const normalized = this.normalizeStructuredValue(parameters) as Record<
      string,
      any
    >;
    if (!schema) {
      return normalized;
    }

    const coerced: Record<string, any> = {};
    for (const [key, value] of Object.entries(normalized)) {
      coerced[key] = this.applySchemaToValue(value, schema[key]);
    }
    return coerced;
  }

  safeJsonParse(
    jsonString: string,
    maxAttempts = 1,
  ): {
    success: boolean;
    result?: any;
    error?: string;
    attempts: number;
  } {
    const attempts = Math.max(1, Math.floor(maxAttempts));
    let lastError: unknown;

    for (let index = 0; index < attempts; index += 1) {
      try {
        const parsed = JSON.parse(jsonString);
        return {
          success: true,
          result: parsed,
          attempts: index + 1,
        };
      } catch (error) {
        lastError = error;
      }
    }

    return {
      success: false,
      error: lastError ? String(lastError) : 'Unknown error',
      attempts,
    };
  }

  safeParse(jsonString: string): any {
    const result = this.safeJsonParse(jsonString);
    return result.success ? result.result : undefined;
  }

  private containsStringifiedValues(value: unknown): boolean {
    if (!value || typeof value !== 'object') {
      return false;
    }
    return Object.values(value as Record<string, unknown>).some((entry) => {
      if (typeof entry !== 'string') {
        return false;
      }
      try {
        const parsed = JSON.parse(entry);
        return typeof parsed === 'object';
      } catch {
        return false;
      }
    });
  }

  private normalizeStructuredValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^-?\d+$/.test(trimmed)) {
        const num = Number(trimmed);
        return Number.isNaN(num) ? value : num;
      }
      if (/^-?\d*\.\d+$/.test(trimmed)) {
        const num = Number(trimmed);
        return Number.isNaN(num) ? value : num;
      }
      if (/^(true|false)$/i.test(trimmed)) {
        return trimmed.toLowerCase() === 'true';
      }
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeStructuredValue(item));
    }

    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(
        value as Record<string, unknown>,
      )) {
        result[key] = this.normalizeStructuredValue(entry);
      }
      return result;
    }

    return value;
  }

  private ensureRecord(value: unknown): Record<string, any> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, any>;
    }
    return { value };
  }

  private applySchemaToValue(value: any, schema: any): any {
    if (!schema) {
      return value;
    }

    const schemaType = typeof schema === 'object' ? schema.type : schema;

    if (schemaType === 'number') {
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? value : parsed;
      }
      return value;
    }

    if (schemaType === 'boolean') {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        const lowered = value.toLowerCase();
        if (lowered === 'true' || lowered === 'false') {
          return lowered === 'true';
        }
      }
      return value;
    }

    if (schemaType === 'string') {
      return typeof value === 'string' ? value : String(value);
    }

    if (schemaType === 'object' && value && typeof value === 'object') {
      const properties = schema.properties ?? {};
      const coerced: Record<string, any> = {};
      for (const [key, entry] of Object.entries(value)) {
        coerced[key] = this.applySchemaToValue(entry, properties[key]);
      }
      return coerced;
    }

    if (schemaType === 'array' && Array.isArray(value)) {
      const itemSchema = schema.items;
      return value.map((item) => this.applySchemaToValue(item, itemSchema));
    }

    return value;
  }
}
