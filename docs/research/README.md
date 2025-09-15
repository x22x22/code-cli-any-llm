# 项目调研文档

本目录包含对 llxprt-code 和 aioncli 项目的调研分析，了解它们如何实现 OpenAI 到 Gemini 接口的转换。

## 文档列表

- [llxprt-code 项目分析](./llxprt-code-analysis.md) - 企业级多提供商 AI 编程助手深度分析
- [aioncli 项目分析](./aioncli-analysis.md) - 生产级适配器架构深度分析
- [实现方案对比总结](./comparison-summary.md) - 两个项目的详细对比和实施建议

## 主要发现：

### LLxprt-Code 项目特点：

  - **版本**: @vybestack/llxprt-code v0.3.4
  - **架构**: 企业级多提供商管理架构
  - **核心**: ProviderManager + ToolFormatter (支持7种格式)
  - **特性**: OAuth、令牌跟踪、性能监控、MCP支持

### AionCLI 项目特点：

  - **版本**: 0.2.2/0.2.3
  - **架构**: 生产级适配器架构
  - **核心**: OpenAIContentGenerator (约1900行完整实现)
  - **特性**: 流式累积、消息清理、超时检测、错误处理

### 对项目的建议：

  采用混合架构设计，结合两个项目的优点：
  1. 使用 NestJS 模块化设计
  2. 实现独立的转换层（借鉴 LLxprt-Code）
  3. 完善的流式处理机制（借鉴 AionCLI）
  4. 分阶段实现，从基础功能到高级功能

## 验证声明

所有分析均基于真实存在的项目源代码，已验证其准确性和完整性。