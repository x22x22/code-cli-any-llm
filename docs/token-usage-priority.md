# Token 使用统计优先级优化

## 概述

此优化实现了优先使用模型提供商返回的 usage 中的 token 统计信息，而不是完全依赖本地 tiktoken 计算。

## 主要改进

### 1. 扩展了 OpenAI 流式响应模型

```typescript
export interface OpenAIStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: OpenAIStreamChoice[];
  usage?: OpenAIStreamUsage;  // 新增字段
}

export interface OpenAIStreamUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}
```

### 2. 优化了 TokenizerService

添加了新的混合计算方法 `combineUsageInfo`，支持：
- **优先使用 API 提供的完整 usage 信息**
- **如果 API 信息缺失或不完整，使用本地计算补充**
- **智能处理部分 API 数据的情况**

```typescript
combineUsageInfo(
  apiUsage: UsageInfo | null,
  localText: {
    promptText?: string;
    candidateText?: string;
    thoughtText?: string;
  },
  model?: string,
): GeminiUsageMetadataDto
```

### 3. 更新了 StreamTransformer

- 在流式响应处理中检测并保存 API 返回的 usage 信息
- 使用新的混合计算方法来生成最终的 token 统计

## 优先级逻辑

1. **API 完整数据**：如果 API 返回了完整的 `prompt_tokens`、`completion_tokens` 和 `total_tokens`，直接使用
2. **混合模式**：如果 API 只返回部分数据，使用 API 数据优先，用本地计算填补缺失部分
3. **本地计算**：如果没有 API 数据，完全使用本地 tiktoken 计算

## 使用示例

### 流式响应处理
```typescript
// API 返回带有 usage 信息的 chunk
const chunk = {
  id: 'cmpl-123',
  choices: [...],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15
  }
};

// StreamTransformer 会自动检测并优先使用这些信息
const result = streamTransformer.transformStreamChunk(chunk);
```

### 手动混合计算
```typescript
const result = tokenizerService.combineUsageInfo(
  { prompt_tokens: 10 }, // API 只提供了 prompt tokens
  { 
    candidateText: "AI response text",
    thoughtText: "Internal reasoning"
  },
  'gpt-4'
);
// 结果：prompt_tokens 使用 API 值，其他使用本地计算
```

## 优势

1. **更准确的统计**：优先使用模型提供商的官方统计，避免本地估算误差
2. **向下兼容**：如果没有 API usage 信息，自动回退到本地计算
3. **智能补充**：支持部分 API 数据的情况，最大化利用可用信息
4. **性能优化**：减少不必要的本地计算，特别是当 API 提供完整信息时

## 测试覆盖

- ✅ 完整 API usage 信息的处理
- ✅ 无 API usage 信息时的本地计算回退
- ✅ 部分 API 数据的混合处理
- ✅ 空文本和边界情况处理
- ✅ 流式响应中的 usage 信息集成
