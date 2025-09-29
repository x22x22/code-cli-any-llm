export interface IDoubleEscapeUtils {
  shouldUseDoubleEscapeHandling(toolFormat: string): boolean;
  detectDoubleEscaping(jsonString: string): DoubleEscapeDetectionResult;
  processToolParameters(
    parametersString: string,
    toolName: string,
    format: string,
  ): Record<string, any>;
  detectDoubleEscapingInChunk(chunk: string): boolean;
  coerceParameterTypes(
    parameters: Record<string, any>,
    schema?: Record<string, any>,
  ): Record<string, any>;
  safeJsonParse(
    jsonString: string,
    maxAttempts?: number,
  ): {
    success: boolean;
    result?: any;
    error?: string;
    attempts: number;
  };
}

export interface DoubleEscapeDetectionResult {
  isDoubleEscaped: boolean;
  correctedValue?: unknown;
  originalValue: string;
  detectionDetails: {
    hasEscapeSequences: boolean;
    hasDoubleQuotes: boolean;
    parseAttempts: number;
    finalParseSuccess: boolean;
    detectedPatterns: string[];
  };
}

export interface ZhipuProcessingConfig {
  enableDoubleEscapeDetection: boolean;
  enableTypeCoercion: boolean;
  bufferTextOutput: boolean;
  disableStreamingForTools: boolean;
  maxParseAttempts: number;
  debugLogging: boolean;
}

export interface ProcessingStats {
  doubleEscapeDetections: number;
  doubleEscapeCorrections: number;
  typeCoercions: number;
  failedParsings: number;
  averageProcessingTime: number;
  totalRequestsProcessed: number;
}

export enum ZhipuIssueType {
  DOUBLE_ESCAPING = 'double_escaping',
  STRING_NUMBER = 'string_number',
  MALFORMED_JSON = 'malformed_json',
  UNICODE_ISSUE = 'unicode_issue',
  BUFFER_ISSUE = 'buffer_issue',
}

export interface ZhipuIssueReport {
  type: ZhipuIssueType;
  severity: 'low' | 'medium' | 'high';
  description: string;
  originalValue: string;
  correctedValue?: string;
  automatic: boolean;
}
