/**
 * doubleEscapeUtils 智谱处理接口合约
 * 基于 llxprt-code 项目的 doubleEscapeUtils 设计
 */

export interface IDoubleEscapeUtils {
  /**
   * 检测是否需要双重转义处理
   */
  shouldUseDoubleEscapeHandling(toolFormat: string): boolean

  /**
   * 检测双重JSON字符串化问题
   */
  detectDoubleEscaping(jsonString: string): DoubleEscapeDetectionResult

  /**
   * 处理工具参数，修复双重转义和类型问题
   */
  processToolParameters(
    parametersString: string,
    toolName: string,
    format: string
  ): unknown

  /**
   * 在流式响应块中检测双重转义
   */
  detectDoubleEscapingInChunk(chunk: string): boolean

  /**
   * 智能类型转换（字符串数字 → 数字等）
   */
  coerceParameterTypes(
    parameters: Record<string, any>,
    schema?: Record<string, any>
  ): Record<string, any>

  /**
   * 安全的JSON解析，带超时保护
   */
  safeJsonParse(jsonString: string, maxAttempts?: number): {
    success: boolean
    result?: any
    error?: string
    attempts: number
  }
}

export interface DoubleEscapeDetectionResult {
  isDoubleEscaped: boolean
  correctedValue?: unknown
  originalValue: string
  detectionDetails: {
    hasEscapeSequences: boolean
    hasDoubleQuotes: boolean
    parseAttempts: number
    finalParseSuccess: boolean
    detectedPatterns: string[]
  }
}

export interface ZhipuProcessingConfig {
  enableDoubleEscapeDetection: boolean
  enableTypeCoercion: boolean
  bufferTextOutput: boolean
  disableStreamingForTools: boolean
  maxParseAttempts: number
  debugLogging: boolean
}

export interface ProcessingStats {
  doubleEscapeDetections: number
  doubleEscapeCorrections: number
  typeCoercions: number
  failedParsings: number
  averageProcessingTime: number
  totalRequestsProcessed: number
}

/**
 * 智谱模型特殊问题类型枚举
 */
export enum ZhipuIssueType {
  DOUBLE_ESCAPING = 'double_escaping',
  STRING_NUMBER = 'string_number',
  MALFORMED_JSON = 'malformed_json',
  UNICODE_ISSUE = 'unicode_issue',
  BUFFER_ISSUE = 'buffer_issue'
}

export interface ZhipuIssueReport {
  type: ZhipuIssueType
  severity: 'low' | 'medium' | 'high'
  description: string
  originalValue: string
  correctedValue?: string
  automatic: boolean
}