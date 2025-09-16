export interface OpenAIConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  timeout: number;
}

export interface GatewayConfig {
  port: number;
  host: string;
  logLevel: string;
}

export interface GlobalConfig {
  openai: OpenAIConfig;
  gateway: GatewayConfig;
  configSource: string;
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
