/**
 * 增强的Provider接口合约
 * 扩展现有 LLMProvider 以支持工具格式检测和智谱优化
 */

import { ToolFormat } from './tool-formatter.interface'

export interface IEnhancedLLMProvider {
  /**
   * 检测当前配置的工具格式
   */
  detectToolFormat(): ToolFormat

  /**
   * 获取模型能力特性
   */
  getModelCapabilities(): ModelCapabilities

  /**
   * 是否需要智谱特殊优化
   */
  shouldUseZhipuOptimizations(): boolean

  /**
   * 是否需要禁用流式响应（针对工具调用）
   */
  shouldDisableStreamingForTools(): boolean

  /**
   * 获取文本缓冲配置
   */
  getTextBufferingConfig(): TextBufferingConfig | null

  /**
   * 处理模型特定的请求转换
   */
  transformRequest(request: any): any

  /**
   * 处理模型特定的响应转换
   */
  transformResponse(response: any): any
}

export interface ModelCapabilities {
  supportsToolCalls: boolean
  supportsStreaming: boolean
  hasDoubleEscapeIssues: boolean
  preferredToolFormat: ToolFormat
  bufferRequiredForChinese: boolean
  maxTokens?: number
  supportedLanguages: string[]
  knownIssues: string[]
}

export interface TextBufferingConfig {
  enabled: boolean
  breakPoints: string[]  // ['\n', '. ', '。', '？', '！']
  maxBufferSize: number
  flushOnPatterns: string[]
}

export interface ZhipuModelConfig {
  // 模型识别
  modelPatterns: string[]

  // 工具格式配置
  toolFormat: ToolFormat
  enableDoubleEscapeFixing: boolean

  // 流式响应配置
  streamingBufferSize: number
  disableStreamingForTools: boolean

  // 文本缓冲配置
  textBuffering: TextBufferingConfig

  // 性能配置
  requestTimeout: number
  maxRetries: number
}

export interface EnhancedProviderConfig {
  // 基础配置
  baseURL: string
  apiKey: string
  model: string

  // 模型特定配置
  modelConfigs: Map<string, ZhipuModelConfig>

  // 默认设置
  defaultToolFormat: ToolFormat

  // 全局选项
  globalOptions: {
    enableAdvancedToolFormatDetection: boolean
    logToolFormatDetection: boolean
    enableAutoTypeCoercion: boolean
    enablePerformanceMetrics: boolean
  }

  // 智谱优化选项
  zhipuOptimizations: {
    enabled: boolean
    autoDetectGLMModels: boolean
    bufferChineseOutput: boolean
    fixDoubleEscaping: boolean
  }
}

/**
 * 模型检测结果
 */
export interface ModelDetectionResult {
  isZhipuModel: boolean
  detectedModel: string
  recommendedFormat: ToolFormat
  requiredOptimizations: string[]
  confidence: number  // 0-1
}

/**
 * 请求处理上下文
 */
export interface RequestProcessingContext {
  modelName: string
  hasTools: boolean
  isStreaming: boolean
  detectedFormat: ToolFormat
  enabledOptimizations: string[]
  processingStartTime: number
}

/**
 * 响应处理结果
 */
export interface ResponseProcessingResult {
  success: boolean
  processedResponse: any
  appliedOptimizations: string[]
  processingStats: {
    processingTime: number
    doubleEscapeCorrections: number
    typeCoercions: number
    bufferOperations: number
  }
  warnings: string[]
  errors: string[]
}