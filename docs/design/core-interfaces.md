# 核心接口和数据结构设计

## 概述

本文档定义了 Gemini API 网关的核心接口和数据结构，基于对 Gemini API 规范的分析以及对 LLxprt-Code 和 AionCLI 项目的研究。

## 1. 核心接口定义

### 1.1 LLM Provider 接口

```typescript
// src/providers/interfaces/llm-provider.interface.ts
export interface LLMProvider {
  // 提供商基本信息
  readonly name: string;
  readonly displayName: string;
  readonly version: string;

  // 支持的功能
  readonly capabilities: ProviderCapabilities;

  // 可用模型列表
  getModels(): Promise<LLMModel[]>;

  // 内容生成方法
  generateContent(request: GenerateContentRequest): Promise<GenerateContentResponse>;

  // 流式内容生成
  generateContentStream(request: GenerateContentRequest): Promise<AsyncIterable<GenerateContentResponse>>;

  // Token 计算
  countTokens(request: CountTokensRequest): Promise<CountTokensResponse>;

  // 嵌入向量（如果支持）
  embedContent?(request: EmbedContentRequest): Promise<EmbedContentResponse>;

  // 健康检查
  healthCheck(): Promise<ProviderHealth>;

  // 初始化和清理
  initialize(config: ProviderConfig): Promise<void>;
  dispose?(): Promise<void>;
}

export interface ProviderCapabilities {
  // 基础功能
  chat: boolean;
  streaming: boolean;
  tools: boolean;
  vision: boolean;

  // 高级功能
  jsonSchema: boolean;
  parallelTools: boolean;
  functionCalling: boolean;

  // 特殊格式
  supportsSystemMessage: boolean;
  supportsToolResponse: boolean;
}

export interface LLMModel {
  id: string;
  name: string;
  provider: string;
  capabilities: ModelCapabilities;
  contextLength: number;
  maxOutputTokens: number;
  trainingDataCutoff?: string;
  pricing?: PricingInfo;
}

export interface ModelCapabilities {
  chat: boolean;
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  jsonOutput: boolean;
}
```

### 1.2 请求转换器接口

```typescript
// src/transformers/interfaces/request-transformer.interface.ts
export interface RequestTransformer {
  // 将 Gemini 请求转换为提供商特定格式
  transformRequest(
    request: GenerateContentRequest,
    targetProvider: string
  ): Promise<ProviderRequest>;

  // 将提供商响应转换回 Gemini 格式
  transformResponse(
    response: ProviderResponse,
    sourceProvider: string
  ): Promise<GenerateContentResponse>;

  // 工具格式转换
  transformTools(
    geminiTools: Tool[],
    targetFormat: ToolFormat
  ): ToolDefinition[];

  // 流式响应转换
  transformStreamChunk(
    chunk: StreamChunk,
    sourceProvider: string
  ): GenerateContentResponse;
}

export type ToolFormat =
  | 'openai'
  | 'anthropic'
  | 'qwen'
  | 'deepseek'
  | 'gemini';

export interface ProviderRequest {
  model: string;
  messages: Message[];
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stop?: string[];
  stream?: boolean;
  // 提供商特定参数
  [key: string]: any;
}

export interface ProviderResponse {
  id: string;
  model: string;
  created: number;
  choices: Choice[];
  usage?: TokenUsage;
  // 提供商特定字段
  [key: string]: any;
}

export interface Choice {
  index: number;
  message: ResponseMessage;
  finishReason: string;
  delta?: DeltaMessage; // 用于流式响应
}
```

### 1.3 配置管理接口

```typescript
// src/config/interfaces/config.interface.ts
export interface GatewayConfig {
  // 服务器配置
  server: ServerConfig;

  // 提供商配置
  providers: ProvidersConfig;

  // 路由配置
  routing: RoutingConfig;

  // 缓存配置
  cache?: CacheConfig;

  // 监控配置
  monitoring?: MonitoringConfig;

  // 安全配置
  security?: SecurityConfig;
}

export interface ServerConfig {
  port: number;
  host: string;
  cors: CorsOptions;
  rateLimit: RateLimitConfig;
  timeout: TimeoutConfig;
}

export interface ProvidersConfig {
  // 提供商列表
  [providerName: string]: ProviderConfig;
}

export interface ProviderConfig {
  enabled: boolean;
  priority: number;
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
  models: string[];
  defaultModel?: string;
  maxRetries?: number;
  timeout?: number;
  // 提供商特定配置
  [key: string]: any;
}

export interface RoutingConfig {
  defaultProvider: string;
  modelMappings: ModelMapping[];
  loadBalancing?: LoadBalancingConfig;
  fallback?: FallbackConfig;
}

export interface ModelMapping {
  geminiModel: string;
  provider: string;
  model: string;
  capabilities?: string[];
}
```

## 2. Gemini API 数据结构

### 2.1 请求结构

```typescript
// src/types/gemini/request.types.ts
export interface GenerateContentRequest {
  // 模型标识符
  model: string;

  // 内容
  contents: Content[];

  // 工具配置
  tools?: Tool[];
  toolConfig?: ToolConfig;

  // 生成配置
  generationConfig?: GenerationConfig;

  // 系统指令
  systemInstruction?: Content | Content[];

  // 安全设置
  safetySettings?: SafetySetting[];

  // 其他元数据
  labels?: Record<string, string>;
}

export interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

export type Part =
  | { text: string }
  | { inlineData: InlineData }
  | { functionCall: FunctionCall }
  | { functionResponse: FunctionResponse };

export interface Tool {
  functionDeclarations: FunctionDeclaration[];
}

export interface FunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Schema;
}

export interface Schema {
  type: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: any[];
  format?: string;
  [key: string]: any;
}

export interface GenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  candidateCount?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  responseMimeType?: string;
  responseSchema?: Schema;
  presencePenalty?: number;
  frequencyPenalty?: number;
}
```

### 2.2 响应结构

```typescript
// src/types/gemini/response.types.ts
export interface GenerateContentResponse {
  // 响应标识
  responseId?: string;

  // 模型信息
  model?: string;

  // 生成结果
  candidates: Candidate[];

  // 使用统计
  usageMetadata?: UsageMetadata;

  // 提示反馈
  promptFeedback?: PromptFeedback;

  // 时间戳
  createTime?: string;
  version?: string;
}

export interface Candidate {
  // 内容
  content: Content;

  // 完成原因
  finishReason: FinishReason;

  // 索引
  index: number;

  // 安全评分
  safetyRatings?: SafetyRating[];

  // token 统计
  tokenLogProbs?: TokenLogProb[];

  // 基础分数
  baseScore?: number;

  // 最终分数
  finalScore?: number;
}

export type FinishReason =
  | 'FINISH_REASON_UNSPECIFIED'
  | 'STOP'
  | 'MAX_TOKENS'
  | 'SAFETY'
  | 'RECITATION'
  | 'OTHER'
  | 'BLOCKLIST';

export interface UsageMetadata {
  // 提示 token 数
  promptTokenCount: number;

  // 候选 token 数
  candidatesTokenCount: number;

  // 总 token 数
  totalTokenCount: number;

  // 缓存内容 token 数
  cachedContentTokenCount?: number;
}

export interface SafetyRating {
  category: HarmCategory;
  probability: HarmProbability;
  blocked?: boolean;
  severity?: HarmSeverity;
}

export type HarmCategory =
  | 'HARM_CATEGORY_HARASSMENT'
  | 'HARM_CATEGORY_HATE_SPEECH'
  | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
  | 'HARM_CATEGORY_DANGEROUS_CONTENT';

export type HarmProbability =
  | 'HARM_PROBABILITY_UNSPECIFIED'
  | 'NEGLIGIBLE'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH';
```

## 3. 内部数据结构

### 3.1 会话管理

```typescript
// src/session/session.types.ts
export interface SessionContext {
  id: string;
  provider: string;
  model: string;
  startTime: number;
  metadata: Record<string, any>;
}

export interface ConversationState {
  // 对话历史
  messages: StoredMessage[];

  // 工具调用状态
  toolStates: Map<string, ToolState>;

  // 流式状态
  streamState?: StreamState;

  // 元数据
  metadata: ConversationMetadata;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  toolResponses?: ToolResponse[];
}

export interface ToolState {
  name: string;
  arguments: Record<string, any>;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: any;
  error?: string;
}
```

### 3.2 缓存结构

```typescript
// src/cache/cache.types.ts
export interface CacheKey {
  provider: string;
  model: string;
  inputHash: string;
  optionsHash: string;
}

export interface CacheEntry<T> {
  key: CacheKey;
  value: T;
  createdAt: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}
```

### 3.3 监控指标

```typescript
// src/monitoring/metrics.types.ts
export interface GatewayMetrics {
  // 请求指标
  requests: {
    total: number;
    success: number;
    failed: number;
    byProvider: Record<string, ProviderMetrics>;
  };

  // 性能指标
  performance: {
    averageLatency: number;
    p95Latency: number;
    p99Latency: number;
  };

  // 使用指标
  usage: {
    totalTokens: number;
    totalCost: number;
    byModel: Record<string, ModelUsage>;
  };

  // 系统指标
  system: {
    memoryUsage: number;
    cpuUsage: number;
    activeConnections: number;
  };
}

export interface ProviderMetrics {
  requests: number;
  latency: number[];
  errors: number;
  tokensUsed: number;
  cost?: number;
}
```

## 4. 工具类型定义

### 4.1 工具调用

```typescript
// src/types/tools.types.ts
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResponse {
  toolCallId: string;
  name: string;
  content: string;
  isError?: boolean;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Schema;
  };
}

export interface ToolChoice {
  type: 'auto' | 'none' | 'required';
  function?: {
    name: string;
  };
}
```

### 4.2 执行器接口

```typescript
// src/tools/interfaces/executor.interface.ts
export interface ToolExecutor {
  // 执行工具调用
  execute(call: ToolCall): Promise<ToolResponse>;

  // 验证工具调用
  validate(call: ToolCall, definition: ToolDefinition): boolean;

  // 获取工具模式
  getSchema(name: string): Schema | null;

  // 列出可用工具
  listTools(): string[];
}
```

## 5. 错误类型定义

```typescript
// src/errors/error.types.ts
export class GatewayError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export class ProviderError extends GatewayError {
  constructor(
    message: string,
    public provider: string,
    public originalError?: any
  ) {
    super(message, 'PROVIDER_ERROR', 502, { provider });
    this.name = 'ProviderError';
  }
}

export class ValidationError extends GatewayError {
  constructor(message: string, public field?: string) {
    super(message, 'VALIDATION_ERROR', 400, { field });
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends GatewayError {
  constructor(
    message: string,
    public retryAfter?: number,
    public provider?: string
  ) {
    super(message, 'RATE_LIMIT_ERROR', 429, { retryAfter, provider });
    this.name = 'RateLimitError';
  }
}

export class TimeoutError extends GatewayError {
  constructor(message: string, public timeout: number) {
    super(message, 'TIMEOUT_ERROR', 504, { timeout });
    this.name = 'TimeoutError';
  }
}
```

## 总结

本接口设计遵循以下原则：

1. **类型安全**: 使用 TypeScript 确保编译时类型检查
2. **扩展性**: 接口设计支持未来的功能扩展
3. **一致性**: 命名和结构保持一致
4. **灵活性**: 支持不同提供商的特殊需求
5. **可测试性**: 接口易于 mock 和测试

这些接口和数据结构为 Gemini API 网关提供了坚实的基础，使其能够无缝地桥接 Gemini CLI 和各种 LLM 提供商。