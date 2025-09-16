# Phase 1: 数据模型设计 - 报文转换组件

**日期**: 2025-09-17
**范围**: llxprt-code 核心组件移植的数据结构和接口设计

## 核心实体设计

### 1. ToolFormatter 实体

#### 主要接口
```typescript
interface IToolFormatter {
  // Gemini 到其他格式的转换
  convertGeminiToOpenAI(geminiTools: IGeminiTool[]): OpenAITool[]
  convertGeminiToAnthropic(geminiTools: IGeminiTool[]): AnthropicTool[]
  convertGeminiToFormat(geminiTools: IGeminiTool[], format: ToolFormat): unknown

  // 其他格式到内部格式的转换
  fromProviderFormat(rawToolCall: unknown, format: ToolFormat): ToolCallBlock[]

  // 流式工具调用累积
  accumulateStreamingToolCall(
    deltaToolCall: any,
    accumulatedToolCalls: Map<string, any>,
    format: ToolFormat
  ): void

  // 响应API特殊格式
  toResponsesTool(tools: ITool[]): ResponsesTool[]
}
```

#### 支持的工具格式枚举
```typescript
enum ToolFormat {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  QWEN = 'qwen',
  HERMES = 'hermes',
  XML = 'xml',
  LLAMA = 'llama',
  GEMMA = 'gemma'
}
```

#### 工具调用数据结构
```typescript
interface ToolCallBlock {
  type: 'tool_call'
  id: string
  name: string
  parameters: Record<string, any>
}

interface StreamingToolCall {
  id: string
  name?: string
  parameters?: string  // 累积的JSON字符串
  isComplete: boolean
}
```

### 2. doubleEscapeUtils 实体

#### 检测结果接口
```typescript
interface DoubleEscapeDetectionResult {
  isDoubleEscaped: boolean
  correctedValue?: unknown
  originalValue: string
  detectionDetails: {
    hasEscapeSequences: boolean
    hasDoubleQuotes: boolean
    parseAttempts: number
    finalParseSuccess: boolean
  }
}
```

#### 智谱处理配置
```typescript
interface ZhipuProcessingConfig {
  enableDoubleEscapeDetection: boolean
  enableTypeCoercion: boolean
  bufferTextOutput: boolean
  disableStreamingForTools: boolean
}
```

### 3. 增强的Provider接口

#### 扩展的LLMProvider接口
```typescript
interface IEnhancedLLMProvider extends ILLMProvider {
  // 工具格式检测
  detectToolFormat(): ToolFormat

  // 模型特性检测
  getModelCapabilities(): ModelCapabilities

  // 智谱特殊处理标识
  shouldUseZhipuOptimizations(): boolean
}

interface ModelCapabilities {
  supportsToolCalls: boolean
  supportsStreaming: boolean
  hasDoubleEscapeIssues: boolean
  preferredToolFormat: ToolFormat
  bufferRequiredForChinese: boolean
}
```

### 4. 配置实体扩展

#### 智谱模型配置
```typescript
interface ZhipuModelConfig {
  // 模型识别模式
  modelPatterns: string[]  // ['glm-4.5', 'glm-4-5', 'zhipu']

  // 处理选项
  toolFormat: ToolFormat.QWEN
  enableDoubleEscapeFixing: boolean
  streamingBufferSize: number
  disableStreamingForTools: boolean

  // 文本缓冲配置
  textBuffering: {
    enabled: boolean
    breakPoints: string[]  // ['\n', '. ', '。', '？', '！']
    maxBufferSize: number  // 100
  }
}
```

#### Provider配置扩展
```typescript
interface EnhancedProviderConfig extends ProviderConfig {
  // 模型特定配置
  modelConfigs: Map<string, ZhipuModelConfig>

  // 默认工具格式
  defaultToolFormat: ToolFormat

  // 全局处理选项
  globalOptions: {
    enableAdvancedToolFormatDetection: boolean
    logToolFormatDetection: boolean
    enableAutoTypeCoercion: boolean
  }
}
```

## 数据流设计

### 1. 请求转换流程

```typescript
// 输入: Gemini格式的工具定义
interface GeminiToolInput {
  name: string
  description: string
  parameters: GeminiParameterSchema
}

// 中间处理: 统一工具格式
interface UnifiedToolFormat {
  name: string
  description: string
  parameters: Record<string, any>
  format: ToolFormat
}

// 输出: Provider特定格式
interface ProviderToolOutput {
  // OpenAI格式
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JSONSchema
  }
}
```

### 2. 响应转换流程

```typescript
// 输入: Provider响应
interface ProviderToolCallResponse {
  id: string
  type: string
  function?: {
    name: string
    arguments: string  // 可能双重转义的JSON
  }
}

// 中间处理: 转义修复
interface ProcessedToolCall {
  id: string
  name: string
  arguments: Record<string, any>  // 已修复的对象
  processingInfo: {
    wasDoubleEscaped: boolean
    hadTypeIssues: boolean
    originalArguments: string
  }
}

// 输出: Gemini格式
interface GeminiToolCallOutput {
  functionCall: {
    name: string
    args: Record<string, any>
  }
}
```

## 状态管理

### 1. 流式工具调用状态

```typescript
interface StreamingToolCallState {
  // 工具调用累积状态
  activeToolCalls: Map<string, StreamingToolCall>

  // 文本缓冲状态
  textBuffer: string
  lastFlushTime: number

  // 检测状态
  detectedFormat: ToolFormat | null
  modelCapabilities: ModelCapabilities | null
}
```

### 2. 处理统计

```typescript
interface ProcessingStats {
  // 转义处理统计
  doubleEscapeDetections: number
  doubleEscapeCorrections: number

  // 类型转换统计
  typeCoercions: number

  // 格式转换统计
  formatConversions: Map<ToolFormat, number>

  // 性能统计
  averageProcessingTime: number
  totalRequestsProcessed: number
}
```

## 验证规则

### 1. ToolFormatter验证
- 工具名称必须是有效的函数名（字母、数字、下划线）
- 参数必须符合JSON Schema规范
- 格式转换必须是可逆的（除非源格式缺失信息）

### 2. doubleEscapeUtils验证
- JSON解析必须有超时保护
- 类型转换必须有回退策略
- 检测结果必须包含原始值以便调试

### 3. 配置验证
- 模型模式必须是有效的正则表达式
- 缓冲区大小必须在合理范围内(1-1000)
- 工具格式必须在支持的枚举值内

## 错误处理策略

### 1. 格式转换错误
- 不支持的格式 → 降级到 openai 格式
- 参数解析失败 → 记录错误，返回原始字符串
- 类型转换失败 → 保持原始类型

### 2. 智谱处理错误
- 双重转义检测失败 → 跳过处理，记录警告
- JSON解析超时 → 返回原始字符串
- 类型推断失败 → 保持字符串类型

### 3. 流式处理错误
- 工具调用累积失败 → 重置状态，继续处理
- 文本缓冲溢出 → 立即输出，清空缓冲区

## 扩展点设计

### 1. 新工具格式支持
- 实现 `IToolFormatHandler` 接口
- 注册到 `ToolFormatter` 的格式映射表
- 添加对应的转换和解析逻辑

### 2. 新模型优化
- 扩展 `ModelCapabilities` 接口
- 添加模型检测模式到配置
- 实现特定的处理逻辑

### 3. 新处理算法
- 实现 `IParameterProcessor` 接口
- 集成到 `doubleEscapeUtils` 的处理流水线
- 添加相应的配置选项

这个数据模型设计确保了移植后的系统既保持现有功能的完整性，又为未来扩展提供了清晰的架构基础。