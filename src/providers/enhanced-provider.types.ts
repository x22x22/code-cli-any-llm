import { ToolFormat } from '@/transformers/enhanced/tool-formatter.types';

export interface IEnhancedLLMProvider {
  detectToolFormat(): ToolFormat;
  getModelCapabilities(): ModelCapabilities;
  shouldUseZhipuOptimizations(): boolean;
  shouldDisableStreamingForTools(): boolean;
  getTextBufferingConfig(): TextBufferingConfig | null;
  transformRequest(request: any): any;
  transformResponse(response: any): any;
}

export interface ModelCapabilities {
  supportsToolCalls: boolean;
  supportsStreaming: boolean;
  hasDoubleEscapeIssues: boolean;
  preferredToolFormat: ToolFormat;
  bufferRequiredForChinese: boolean;
  maxTokens?: number;
  supportedLanguages: string[];
  knownIssues: string[];
}

export interface TextBufferingConfig {
  enabled: boolean;
  breakPoints: string[];
  maxBufferSize: number;
  flushOnPatterns: string[];
}

export interface ZhipuModelConfig {
  modelPatterns: string[];
  toolFormat: ToolFormat;
  enableDoubleEscapeFixing: boolean;
  streamingBufferSize: number;
  disableStreamingForTools: boolean;
  textBuffering: TextBufferingConfig;
  requestTimeout: number;
  maxRetries: number;
}

export interface EnhancedProviderConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  modelConfigs: Map<string, ZhipuModelConfig>;
  defaultToolFormat: ToolFormat;
  globalOptions: {
    enableAdvancedToolFormatDetection: boolean;
    logToolFormatDetection: boolean;
    enableAutoTypeCoercion: boolean;
    enablePerformanceMetrics: boolean;
  };
  zhipuOptimizations: {
    enabled: boolean;
    autoDetectGLMModels: boolean;
    bufferChineseOutput: boolean;
    fixDoubleEscaping: boolean;
  };
}

export interface ModelDetectionResult {
  isZhipuModel: boolean;
  detectedModel: string;
  recommendedFormat: ToolFormat;
  requiredOptimizations: string[];
  confidence: number;
}

export interface RequestProcessingContext {
  modelName: string;
  hasTools: boolean;
  isStreaming: boolean;
  detectedFormat: ToolFormat;
  enabledOptimizations: string[];
  processingStartTime: number;
}

export interface ResponseProcessingResult {
  success: boolean;
  processedResponse: any;
  appliedOptimizations: string[];
  processingStats: {
    processingTime: number;
    doubleEscapeCorrections: number;
    typeCoercions: number;
    bufferOperations: number;
  };
  warnings: string[];
  errors: string[];
}
