# 数据模型设计

## 概述

本文档定义了 Gemini API 网关服务的核心数据模型，基于对功能规格和研究成果的分析。

## 核心实体

### 1. 配置实体

#### GatewayConfig
网关的基础配置。

```typescript
interface GatewayConfig {
  port: number;              // 服务端口
  host: string;             // 服务主机
  cors: CorsOptions;         // CORS 配置
  timeout: number;           // 请求超时时间 (ms)
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
```

#### ProviderConfig
OpenAI 兼容提供商的配置。

```typescript
interface ProviderConfig {
  apiKey: string;           // API 密钥
  baseURL: string;          // API 基础 URL
  model: string;           // 模型名称
  organization?: string;    // 组织 ID (可选)
  headers?: Record<string, string>;  // 自定义请求头
}
```

### 2. API 请求/响应实体

#### GeminiRequest
Gemini API 标准请求格式。

```typescript
interface GeminiRequest {
  contents: GeminiContent[];
  tools?: GeminiTool[];
  toolConfig?: GeminiToolConfig;
  generationConfig?: GeminiGenerationConfig;
  safetySettings?: GeminiSafetySetting[];
  systemInstruction?: GeminiContent | string;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: GeminiFunctionResponse;
  inlineData?: { mimeType: string; data: string };
  fileData?: { mimeType: string; fileUri: string };
}
```

#### OpenAIRequest
OpenAI API 兼容请求格式。

```typescript
interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  tools?: OpenAITool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string | string[];
}
```

#### GeminiResponse
Gemini API 标准响应格式。

```typescript
interface GeminiResponse {
  candidates: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  promptFeedback?: GeminiPromptFeedback;
}

interface GeminiCandidate {
  content: GeminiContent;
  finishReason: 'FINISH_REASON_UNSPECIFIED' | 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
  index: number;
  safetyRatings?: GeminiSafetyRating[];
}
```

#### OpenAIResponse
OpenAI API 兼容响应格式。

```typescript
interface OpenAIResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: OpenAIUsage;
}

interface OpenAIChoice {
  index: number;
  message: OpenAIMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}
```

### 3. 工具调用实体

#### GeminiTool
Gemini 工具定义。

```typescript
interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[];
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: GeminiSchema;
}
```

#### OpenAITool
OpenAI 工具定义。

```typescript
interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;  // JSON Schema
  };
}
```

### 4. 流式响应实体

#### GeminiStreamChunk
Gemini 流式响应块。

```typescript
interface GeminiStreamChunk {
  candidates: Array<{
    content: GeminiContent;
    finishReason?: string;
    index: number;
  }>;
}
```

#### OpenAIStreamChunk
OpenAI 流式响应块。

```typescript
interface OpenAIStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string;
  }>;
}
```

## 转换器实体

### RequestTransformer
负责将 Gemini 请求转换为 OpenAI 格式。

```typescript
interface RequestTransformer {
  // 转换核心请求
  transformRequest(request: GeminiRequest): OpenAIRequest;

  // 转换工具定义
  transformTools(geminiTools: GeminiTool[]): OpenAITool[];

  // 转换消息历史
  transformMessages(contents: GeminiContent[]): OpenAIMessage[];

  // 转换生成配置
  transformGenerationConfig(config: GeminiGenerationConfig): Partial<OpenAIRequest>;
}
```

### ResponseTransformer
负责将 OpenAI 响应转换为 Gemini 格式。

```typescript
interface ResponseTransformer {
  // 转换响应
  transformResponse(response: OpenAIResponse): GeminiResponse;

  // 转换使用统计
  transformUsage(usage: OpenAIUsage): GeminiUsageMetadata;

  // 转换完成原因
  transformFinishReason(reason: string): string;
}
```

### StreamTransformer
处理流式响应的双向转换。

```typescript
interface StreamTransformer {
  // 流式请求转换
  transformStreamChunk(chunk: OpenAIStreamChunk): GeminiStreamChunk;

  // 工具调用累积
  accumulateToolCall(delta: any, accumulated: Map<number, any>): Map<number, any>;

  // 完成信号处理
  handleStreamFinish(accumulated: Map<number, any>): GeminiPart[];
}
```

## 验证规则

### 请求验证
- 必须包含至少一条消息
- 最后一条消息必须是用户消息
- 工具名称必须符合正则表达式 `^[a-zA-Z0-9_-]+$`
- API 密钥不能为空

### 响应验证
- 候选者数量必须大于 0
- 内容部分不能为空
- 完成原因必须在允许的值范围内

## 错误模型

### GatewayError
网关标准错误格式。

```typescript
interface GatewayError {
  code: string;              // 错误代码
  message: string;           // 错误消息
  details?: any;            // 错误详情
  timestamp: number;         // 时间戳
  requestId?: string;        // 请求 ID
}
```

### 错误代码映射
- `INVALID_REQUEST`: 请求格式错误
- `AUTHENTICATION_ERROR`: 认证失败
- `RATE_LIMIT_ERROR`: 速率限制
- `PROVIDER_ERROR`: 提供商错误
- `TIMEOUT_ERROR`: 请求超时
- `INTERNAL_ERROR`: 内部错误

## 扩展性考虑

### 1. 提供商扩展
- 定义 `Provider` 接口支持未来添加更多提供商
- 使用工厂模式创建提供商实例
- 配置驱动的提供商注册

### 2. 中间件支持
- 请求/响应拦截器
- 自定义验证器
- 指标收集器

### 3. 缓存策略
- 请求缓存
- 响应缓存
- 工具定义缓存