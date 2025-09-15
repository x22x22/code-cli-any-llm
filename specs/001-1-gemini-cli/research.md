# Phase 0: 研究发现

## 研究概述

基于对 LLxprt-Code (v0.3.4) 和 AionCLI (v0.2.2/0.2.3) 两个项目的深度分析，我们发现了实现 Gemini API 网关的核心技术方案。

## 核心发现

### 1. LLxprt-Code 项目的贡献

**项目位置**: `/home/kdump/llm/project/llxprt-code`

**架构设计**:
- ProviderManager 模式统一管理多个 LLM 提供商
- IProvider 接口确保所有提供商实现统一规范
- ToolFormatter 类支持7种不同的工具调用格式转换

**关键代码文件**:

1. **ProviderManager** - `/home/kdump/llm/project/llxprt-code/packages/core/src/providers/ProviderManager.ts`
   - 提供商注册和切换逻辑
   - 动态能力比较功能

2. **IProvider 接口** - `/home/kdump/llm/project/llxprt-code/packages/core/src/providers/IProvider.ts`
   - 统一的提供商接口定义
   - 支持流式和非流式生成

3. **ToolFormatter** - `/home/kdump/llm/project/llxprt-code/packages/core/src/tools/ToolFormatter.ts`
   - 7种格式的工具转换 (openai, qwen, deepseek, gemma, anthropic, hermes, xml)
   - 流式工具调用累积方法

4. **OpenAIProvider** - `/home/kdump/llm/project/llxprt-code/packages/core/src/providers/openai/OpenAIProvider.ts`
   - OpenAI 提供商的具体实现
   - 请求/响应转换示例

**关键代码模式**:
```typescript
// 来自: /home/kdump/llm/project/llxprt-code/packages/core/src/providers/IProvider.ts
export interface IProvider {
  name: string;
  models: string[];
  initialize(config: ProviderConfig): Promise<void>;
  generateContent(request: GenerateContentRequest): Promise<GenerateContentResponse>;
  generateContentStream(request: GenerateContentRequest): AsyncIterable<GenerateContentResponse>;
}

// 来自: /home/kdump/llm/project/llxprt-code/packages/core/src/tools/ToolFormatter.ts
export class ToolFormatter {
  convertGeminiToFormat(geminiTools: any[], format: string): any[] {
    switch (format) {
      case 'openai':
      case 'qwen':
      case 'deepseek':
        return this.convertGeminiToOpenAI(geminiTools);
      // ...
    }
  }
}
```

### 2. AionCLI 项目的贡献

**项目位置**: `/home/kdump/llm/project/aioncli`

**OpenAIContentGenerator** (约1900行完整实现):
- 完整的双向 API 格式转换逻辑
- 生产级的错误处理和重试机制
- 流式工具调用的 Map 累积机制

**关键代码文件**:

1. **OpenAIContentGenerator** - `/home/kdump/llm/project/aioncli/packages/core/src/core/openaiContentGenerator.ts`
   - 核心转换逻辑 (约1900行)
   - 消息格式转换、工具调用转换
   - 流式处理和错误处理

2. **ContentGenerator 接口** - `/home/kdump/llm/project/aioncli/packages/core/src/core/contentGenerator.ts`
   - 定义内容生成器接口
   - AuthType 枚举支持多种认证方式

3. **消息转换方法** - `/home/kdump/llm/project/aioncli/packages/core/src/core/openaiContentGenerator.ts:79-133`
   - `convertToOpenAIFormat()`: Gemini 转 OpenAI 格式
   - 系统指令处理
   - 角色映射逻辑

4. **工具调用转换** - `/home/kdump/llm/project/aioncli/packages/core/src/core/openaiContentGenerator.ts:194-228`
   - `convertGeminiToolsToOpenAI()`: 工具定义转换
   - 参数类型转换逻辑
   - CallableTool 处理

5. **流式处理** - `/home/kdump/llm/project/aioncli/packages/core/src/core/openaiContentGenerator.ts:366-440
   - `streamingToolCalls`: 流式工具调用累积
   - Map 结构管理并行调用
   - 完成时发送完整工具调用

6. **消息清理** - `/home/kdump/llm/project/aioncli/packages/core/src/core/openaiContentGenerator.ts:139-186
   - `cleanOrphanedToolCalls()`: 清理孤立工具调用
   - `mergeConsecutiveAssistantMessages()`: 合并连续消息

**关键技术实现**:
```typescript
// 来自: /home/kdump/llm/project/aioncli/packages/core/src/core/openaiContentGenerator.ts:367-374
// 流式工具调用累积
private streamingToolCalls: Map<number, {
  id?: string;
  name?: string;
  arguments: string;
}> = new Map();

// 来自: /home/kdump/llm/project/aioncli/packages/core/src/core/openaiContentGenerator.ts:139-186
// 消息清理机制
private cleanOrphanedToolCalls(messages: OpenAI.Chat.ChatCompletionMessageParam[]) {
  // 清理没有对应响应的工具调用
  // 合并连续的助手消息
}
```

## 技术决策

### 1. 框架选择: NestJS
**决策**: 使用 NestJS 作为开发框架
**理由**:
- 企业级架构，支持依赖注入和模块化
- 内置验证、拦截器和中间件支持
- 适合构建 API 网关服务

### 2. 核心依赖
- **OpenAI SDK**: ^4.0.0 (兼容多种提供商)
- **class-validator**: 请求验证
- **rxjs**: 流式响应处理

### 3. 实现策略
**最小工作量原则**: 只复刻核心的 API 转换逻辑，忽略非功能性代码

**HTTP 服务项目注意事项**:
- AionCLI 和 LLxprt-Code 是本地进程项目，包含大量 CLI 相关代码
- 重点只参考 API 格式转换的核心逻辑
- 忽略配置管理、日志、遥测、认证等非核心功能
- 在 HTTP 服务中，使用 NestJS 的内置功能替代

**核心代码复刻计划** (仅限转换逻辑):

1. **消息格式转换** (来自 AionCLI)
   - 参考 `/home/kdump/llm/project/aioncli/packages/core/src/core/openaiContentGenerator.ts`：
     - `convertToOpenAIFormat()` - 消息格式转换逻辑
     - `convertToGeminiFormat()` - 响应格式转换逻辑
   - 移除所有日志、遥测、配置相关代码

2. **工具调用转换** (来自 AionCLI)
   - `convertGeminiToolsToOpenAI()` - 工具定义转换
   - 流式工具调用累积的 Map 结构
   - 只保留核心的数据结构操作

3. **参数类型转换** (来自 AionCLI)
   - `convertGeminiParametersToOpenAI()` - 参数 Schema 转换
   - 简化类型映射逻辑

4. **错误处理** (简化版)
   - 只保留基本的错误类型映射
   - 使用 HTTP 状态码替代错误处理逻辑
   - 利用 NestJS 的异常过滤器

**避免复刻的非功能性代码**:
- ❌ CLI 命令处理
- ❌ 配置文件系统
- ❌ 日志记录和遥测
- ❌ OAuth 认证
- ❌ 本地缓存机制
- ❌ 性能监控
- ❌ MCP 协议支持

**使用 NestJS 内置功能替代**:
- ✅ 使用 `@nestjs/config` 管理环境变量
- ✅ 使用 `class-validator` 进行请求验证
- ✅ 使用 NestJS 拦截器处理 CORS、日志等
- ✅ 使用 NestJS 异常过滤器统一错误处理

## 关键技术挑战 (最小化实现)

### 1. API 格式转换 (核心)
- **输入**: Gemini `contents[]` → OpenAI `messages[]`
- **角色映射**: `model` → `assistant`, `user` → `user`
- **内容转换**: `parts[]` → `content` 字符串或工具调用对象

### 2. 流式处理 (简化版)
- **流式转发**: 直接转发 OpenAI 的 SSE 流
- **工具调用累积**: 只在流式结束时处理完整的工具调用
- **最小实现**: 不需要复杂的增量累积逻辑

### 3. 工具调用转换 (基础版)
- **定义转换**: Gemini `functionDeclarations` → OpenAI `tools`
- **参数类型**: 基本的 JSON Schema 转换
- **调用响应**: OpenAI `tool_calls` → Gemini `functionCall`

### 4. 错误处理 (HTTP 友好)
- **错误映射**: OpenAI 错误 → Gemini 错误格式
- **状态码**: 使用合适的 HTTP 状态码
- **简化**: 不需要重试机制，让客户端处理

## 架构概要 (最小化)

```
Gemini CLI → NestJS Controller → Transformer → OpenAI SDK → 提供商
    ↓              ↓              ↓            ↓           ↓
 Gemini API    HTTP 路由     格式转换    HTTP 请求    响应返回
```

### 最小组件架构
1. **Controller**: 处理 HTTP 请求路由
2. **Transformer**: 纯函数式转换逻辑
3. **Service**: 调用 OpenAI SDK
4. **DTO**: 请求/响应数据结构

## 性能考虑

- 使用流式处理减少延迟
- 避免不必要的序列化/反序列化
- 实现连接池管理
- 添加请求/响应缓存选项

## 安全考虑

- API 密钥安全存储
- 请求验证和清理
- 错误信息过滤
- 访问日志记录

## 下一步计划

1. 基于研究发现设计数据模型
2. 定义 API 契约
3. 创建实现任务列表
4. 按照测试驱动开发原则实现核心功能

## 总结

本研究成功识别了实现 Gemini API 网关的最小化技术方案。通过分析 LLxprt-Code 和 AionCLI，我们确定了：

**核心参考**:
- 只参考 **API 转换逻辑**，忽略所有非功能性代码
- AionCLI 的 `openaiContentGenerator.ts` 包含完整的转换实现
- 使用 NestJS 内置功能替代本地项目的复杂架构

**最小化实现策略**:
1. **只复刻转换逻辑**: 消息格式、工具调用、响应转换
2. **使用 NestJS 生态**: 配置、验证、异常处理等使用框架内置功能
3. **避免功能发散**: 不实现缓存、监控、认证等非核心功能
4. **代码量最小**: 预计核心转换代码不超过 500 行

**关键优势**:
- 借鉴经过验证的转换逻辑，减少调试时间
- HTTP 服务架构简单，易于维护
- 专注核心功能，快速交付