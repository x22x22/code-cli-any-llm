export interface OpenAIConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  timeout: number;
  extraBody?: Record<string, any>;
}

export type CodexReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';
export type CodexReasoningSummary = 'concise' | 'detailed' | 'auto';

export interface CodexReasoningConfig {
  effort?: CodexReasoningEffort;
  summary?: CodexReasoningSummary;
}

export interface CodexConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  timeout?: number;
  reasoning?: CodexReasoningConfig | null;
  textVerbosity?: 'low' | 'medium' | 'high';
}

export interface GatewayConfig {
  port: number;
  host: string;
  logLevel: string;
  logDir: string;
}

export interface GlobalConfig {
  openai: OpenAIConfig;
  codex?: CodexConfig;
  gateway: GatewayConfig;
  aiProvider: 'openai' | 'codex';
  configSource: string;
  configSources?: string[]; // 可选字段，记录所有配置来源
  isValid: boolean;
}

export interface ConfigError {
  field: string;
  message: string;
  suggestion: string;
  required: boolean;
}

export interface ConfigValidationResult {
  isValid: boolean;
  errors: ConfigError[];
  warnings: string[];
  config?: GlobalConfig;
}

export interface DefaultConfigTemplate {
  template: string;
  comments: boolean;
}
