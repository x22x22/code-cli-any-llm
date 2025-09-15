# Gemini API 网关实现方案

## 项目目标

为 Gemini CLI 提供访问非 Gemini 模型的路由服务，实现无缝、无侵入式地连接和使用其他大语言模型提供商的 API。

## 设计原则

1. **完全兼容**: 100% 兼容 Gemini API 接口
2. **无侵入性**: Gemini CLI 无需任何修改
3. **易于部署**: 单个可执行文件或简单服务
4. **可扩展**: 支持添加新的 LLM 提供商
5. **高性能**: 低延迟，支持流式传输

## 整体架构设计

### 系统架构图

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Gemini CLI    │    │  Gemini Gateway  │    │  LLM Providers  │
│                 │    │                  │    │                 │
│  - gemini ask   │───▶│  - /v1/models/*  │───▶│  - OpenAI       │
│  - gemini chat  │    │  - /v1beta/models │    │  - Anthropic    │
│                 │    │                  │    │  - Qwen         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Management    │
                       │                 │
                       │  - /health      │
                       │  - /providers   │
                       │  - /config      │
                       └─────────────────┘
```

### 核心组件设计

#### 1. API 路由层 (Controllers)
- **GeminiController**: 处理所有 Gemini API 兼容的请求
- **HealthController**: 健康检查和监控
- **ManagementController**: 提供商和配置管理

#### 2. 提供商抽象层 (Providers)
```typescript
// 核心接口
export interface LLMProvider {
  name: string;
  models: string[];

  // 内容生成
  generateContent(request: GenerateContentRequest): Promise<GenerateContentResponse>;
  generateContentStream(request: GenerateContentRequest): AsyncIterable<GenerateContentResponse>;

  // 工具支持
  supportsTools(): boolean;
  formatTools(tools: GeminiTool[]): any;

  // 流式支持
  supportsStreaming(): boolean;
}
```

#### 3. 请求转换器 (Transformers)
```typescript
export interface RequestTransformer {
  // 将 Gemini 请求转换为提供商格式
  toProviderFormat(request: GeminiRequest, provider: string): ProviderRequest;

  // 将提供商响应转换为 Gemini 格式
  toGeminiFormat(response: ProviderResponse, provider: string): GeminiResponse;

  // 工具格式转换
  convertTools(geminiTools: GeminiTool[], providerFormat: string): any;
}
```

#### 4. 配置管理 (Config)
```typescript
export interface GatewayConfig {
  // 服务器配置
  server: {
    port: number;
    host: string;
    cors: boolean;
  };

  // 提供商配置
  providers: {
    [key: string]: {
      enabled: boolean;
      apiKey?: string;
      baseUrl?: string;
      models: string[];
      defaultModel?: string;
    };
  };

  // 路由配置
  routing: {
    defaultProvider: string;
    modelMappings: {
      [geminiModel: string]: {
        provider: string;
        model: string;
      };
    };
  };
}
```

## 详细设计方案

### 1. Gemini API 兼容性

#### 支持的端点
- `POST /v1/models/{model}:generateContent` - 生成内容
- `POST /v1beta/models/{model}:generateContent` - 生成内容（beta）
- `POST /v1/models/{model}:streamGenerateContent` - 流式生成
- `GET /v1/models` - 列出可用模型
- `GET /v1/models/{model}` - 获取模型信息

#### 请求/响应格式转换

**Gemini 格式到 OpenAI 格式**：
```typescript
// 请求转换
{
  "contents": [{ "role": "user", "parts": [{ "text": "Hello" }] }],
  "tools": [{ "functionDeclarations": [...] }],
  "generationConfig": { "temperature": 0.7 }
}
// ↓ 转换为
{
  "messages": [{ "role": "user", "content": "Hello" }],
  "tools": [{ "type": "function", "function": {...} }],
  "temperature": 0.7
}
```

### 2. 提供商实现

#### OpenAI 兼容提供商
```typescript
@Injectable()
export class OpenAICompatibleProvider implements LLMProvider {
  name = 'openai-compatible';

  constructor(
    private config: OpenAIConfig,
    private transformer: OpenAITransformer
  ) {}

  async generateContent(request: GenerateContentRequest): Promise<GenerateContentResponse> {
    const openaiRequest = this.transformer.toOpenAIFormat(request);
    const response = await this.client.chat.completions.create(openaiRequest);
    return this.transformer.toGeminiFormat(response);
  }

  async *generateContentStream(request: GenerateContentRequest): AsyncIterable<GenerateContentResponse> {
    const openaiRequest = this.transformer.toOpenAIFormat(request);
    const stream = await this.client.chat.completions.create({
      ...openaiRequest,
      stream: true
    });

    for await (const chunk of stream) {
      yield this.transformer.streamChunkToGemini(chunk);
    }
  }
}
```

### 3. 流式处理实现

借鉴 AionCLI 的流式累积机制：
```typescript
@Injectable()
export class StreamManager {
  private streamingToolCalls = new Map<number, Partial<ToolCall>>();

  async *processStream(stream: AsyncIterable<any>): AsyncIterable<GenerateContentResponse> {
    for await (const chunk of stream) {
      const response = new GenerateContentResponse();

      // 处理文本内容
      if (chunk.choices?.[0]?.delta?.content) {
        response.candidates = [{
          content: { parts: [{ text: chunk.choices[0].delta.content }], role: 'model' },
          finishReason: FinishReason.FINISH_REASON_UNSPECIFIED
        }];
      }

      // 处理工具调用累积
      if (chunk.choices?.[0]?.delta?.tool_calls) {
        this.accumulateToolCalls(chunk.choices[0].delta.tool_calls);
      }

      // 完成时发送工具调用
      if (chunk.choices?.[0]?.finish_reason) {
        const toolCalls = this.finalizeToolCalls();
        if (toolCalls.length > 0) {
          response.candidates[0].content.parts.push(...toolCalls);
        }
      }

      yield response;
    }
  }
}
```

### 4. 工具调用支持

基于 LLxprt-Code 的 ToolFormatter 设计：
```typescript
@Injectable()
export class ToolTransformer {
  // 支持多种工具格式
  convertTools(geminiTools: GeminiTool[], format: 'openai' | 'anthropic' | 'qwen'): any {
    switch (format) {
      case 'openai':
      case 'qwen':
        return this.convertToOpenAIFunctions(geminiTools);
      case 'anthropic':
        return this.convertToAnthropicTools(geminiTools);
      default:
        throw new Error(`Unsupported tool format: ${format}`);
    }
  }

  private convertToOpenAIFunctions(geminiTools: GeminiTool[]): OpenAITool[] {
    return geminiTools.flatMap(tool =>
      tool.functionDeclarations.map(func => ({
        type: 'function' as const,
        function: {
          name: func.name,
          description: func.description,
          parameters: this.convertSchema(func.parameters)
        }
      }))
    );
  }
}
```

## 实现计划

### 第一阶段：MVP (4周)
**目标**: 基本的 OpenAI 兼容支持

1. **Week 1**: 项目搭建
   - [ ] 初始化 NestJS 项目
   - [ ] 设计核心接口和数据结构
   - [ ] 实现基础的 API 路由
   - [ ] 配置管理系统

2. **Week 2**: OpenAI 兼容实现
   - [ ] 实现 OpenAI 兼容提供商
   - [ ] 基本的请求/响应转换
   - [ ] 非流式内容生成
   - [ ] 错误处理

3. **Week 3**: 模型管理
   - [ ] 模型列表接口
   - [ ] 模型映射配置
   - [ ] 健康检查接口
   - [ ] 基础日志

4. **Week 4**: 测试和文档
   - [ ] 单元测试
   - [ ] 集成测试
   - [ ] 使用文档
   - [ ] Docker 支持

### 第二阶段：功能增强 (3周)
**目标**: 流式支持和工具调用

1. **Week 5-6**: 流式支持
   - [ ] 流式响应实现
   - [ ] Server-Sent Events
   - [ ] 流式工具调用累积
   - [ ] 超时和重试机制

2. **Week 7**: 工具调用
   - [ ] 函数调用格式转换
   - [ ] 多种工具格式支持
   - [ ] 工具响应处理
   - [ ] 边界情况处理

### 第三阶段：企业级特性 (2周)
**目标**: 生产就绪

1. **Week 8**: 监控和可观测性
   - [ ] 指标收集
   - [ ] 分布式追踪
   - [ ] 性能监控
   - [ ] 告警机制

2. **Week 9**: 部署和运维
   - [ ] 配置热更新
   - [ ] 负载均衡
   - [ ] 缓存支持
   - [ ] 部署脚本

## 部署方案

### 开发环境
```bash
# 本地运行
pnpm install
pnpm run start:dev

# 访问 http://localhost:3000
```

### 生产环境
```bash
# Docker
docker build -t gemini-gateway .
docker run -p 3000:3000 gemini-gateway

# Docker Compose
docker-compose up -d
```

### Gemini CLI 配置
```bash
# 设置环境变量指向网关
export GEMINI_API_ENDPOINT=http://localhost:3000/v1

# 或者在 .gemini 配置文件中
echo 'api_endpoint: "http://localhost:3000/v1"' >> ~/.config/gemini/config.yaml
```

## 配置示例

```yaml
# config/gateway.yaml
server:
  port: 3000
  host: 0.0.0.0
  cors: true

providers:
  openai:
    enabled: true
    apiKey: ${OPENAI_API_KEY}
    baseUrl: https://api.openai.com/v1
    models:
      - gpt-4
      - gpt-4-turbo
      - gpt-3.5-turbo
    defaultModel: gpt-4

  qwen:
    enabled: true
    apiKey: ${QWEN_API_KEY}
    baseUrl: https://dashscope.aliyuncs.com/compatible-mode/v1
    models:
      - qwen-turbo
      - qwen-plus
      - qwen-max

  deepseek:
    enabled: true
    apiKey: ${DEEPSEEK_API_KEY}
    baseUrl: https://api.deepseek.com
    models:
      - deepseek-chat
      - deepseek-coder

routing:
  defaultProvider: openai
  modelMappings:
    gemini-pro: { provider: openai, model: gpt-4 }
    gemini-1.5-pro: { provider: qwen, model: qwen-max }
    gemini-1.5-flash: { provider: qwen, model: qwen-turbo }
```

## 扩展指南

### 添加新的提供商
1. 实现 `LLMProvider` 接口
2. 创建对应的转换器
3. 在配置中添加提供商定义
4. 注册到提供商注册表

### 添加新的工具格式
1. 在 `ToolTransformer` 中添加新的转换逻辑
2. 更新支持的格式列表
3. 添加相应的测试

## 风险和挑战

1. **API 兼容性风险**
   - 缓解措施：完整的测试套件，兼容性测试

2. **性能风险**
   - 缓解措施：连接池、缓存、异步处理

3. **安全风险**
   - 缓解措施：API 密钥加密、请求验证、访问控制

## 总结

本设计方案借鉴了 LLxprt-Code 的模块化架构和 AionCLI 的生产级实现细节，提供了一个完整的 Gemini API 网关解决方案。通过分阶段实现，可以快速交付 MVP 并逐步增强功能，最终实现一个高性能、可扩展、生产就绪的 API 网关服务。