# Claude Code Provider 调研记录

## 1. llxprt-code 中 Gemini CLI ↔ Claude 报文转换实现

- 核心实现位于 `packages/core/src/providers/anthropic/AnthropicProvider.ts`：
  - `generateChatCompletion()` 将内部 `IContent` 历史记录直接转换成 Claude Messages 请求体，并处理工具调用、工具结果归组、首条消息必须为 user 等规范（参见 `llxprt-code/packages/core/src/providers/anthropic/AnthropicProvider.ts:587-812`）。
  - `toolFormatter.convertGeminiToFormat()` 将 Gemini 工具定义转成 `anthropic` 规范；随后把转换结果挂载到请求体 `tools` 字段（`AnthropicProvider.ts:819-888`）。
  - `this.anthropic.messages.create(...)` 调用官方 SDK 发送请求，并区分流式 / 非流式响应。流式下依次解析 `content_block_delta`、`input_json_delta`、`message_delta` 等事件并重新组装为 `IContent`（`AnthropicProvider.ts:900-1025`）。
  - 工具 ID 在多协议之间统一格式：`normalizeToAnthropicToolId()`、`normalizeToHistoryToolId()` 分别把历史 ID、OpenAI 样式 ID（`call_` 前缀）转换为 Anthropic `toolu_` 或回写到历史 `hist_tool_`（`AnthropicProvider.ts:536-580`）。
  - `updateClientWithResolvedAuth()` 根据 OAuth Token / API Key 重新实例化 SDK 客户端，并在 OAuth 模式下强制写入 `system` 字段伪装为 “Claude Code 官方 CLI”（`AnthropicProvider.ts:104-209`, `AnthropicProvider.ts:854-884`）。
- 工具参数的“双重转义”在 `processToolParameters()` / `logDoubleEscapingInChunk()` 中处理，确保 Qwen/Anthropic 之间 JSON 序列化一致（`AnthropicProvider.ts:905-1004`）。

## 2. llxprt-code 使用的 Claude API 接口

- **Messages**：通过 `anthropic.messages.create` 对应 `POST /v1/messages`，与仓库内 `docs/research/messages.openapi.claude.documented.md`、`messages-examples.openapi.claude.documented.md` 描述一致。
- **Models**：`for await (const model of this.anthropic.beta.models.list())` 对应 `GET /v1/models`，契合 `docs/research/models-list.openapi.claude.documented.md`。
- 未找到 `messages.count_tokens` 或其他接口调用，说明当下实现仅依赖 `messages` 与 `models` 两个端点。

## 3. 官方 Claude Code 抓包日志（`logs/proxy-20250919-233412.log`）要点

- 端点：出现 `POST /proxy/v1/messages`、`POST /proxy/v1/messages?beta=true`、`GET /proxy/health`。主体转发到 `https://us015alcyurrp.imds.ai/api`，与 `messages`/健康检查一致。
- 认证：
  - 基础调用使用 `x-api-key: cr_...`。
  - `beta=true` 调用改用 `Authorization: Bearer cr_...` 并附带 `anthropic-beta: claude-code-20250219, interleaved-thinking-2025-05-14, fine-grained-tool-streaming-2025-05-14`。
- 伪装相关头部：
  - `user-agent: claude-cli/1.0.119 (external, cli)`（起始请求为 `1.0.93`，随后升级）。
  - `x-app: cli`、`anthropic-dangerous-direct-browser-access: true`、`x-stainless-*`（`lang`, `package-version`, `runtime`, `timeout` 等）来自官方 SDK。
  - 通用头：`anthropic-version: 2023-06-01`、`accept: application/json`、`sec-fetch-mode: cors` 等。
- 请求体结构：
  - 与 `messages` 文档完全一致，`messages` 为数组，元素包含 `role`, `content`（混合 text / tool_use / tool_result 块），可选 `system`（数组版 system prompt）、`metadata.user_id`、`stream`, `max_tokens`, `temperature` 等。
  - 某些请求体嵌入 `<system-reminder>`、`<CCR-SUBAGENT-MODEL>` 等来自 Claude Code Router 的内嵌提示。
- SSE 响应：
  - 事件顺序 `message_start` → `content_block_start` → 多个 `content_block_delta` → `content_block_stop` → `message_delta` (含 `usage`) → `message_stop`。
  - `content_block_delta` 中 `text_delta` 拼装 JSON，需逐块汇总；`message_delta` 给出 `stop_reason` 与用量统计。
- 结合官方文档，可确认需要完整兼容 Messages SSE 协议，且工具调用须匹配 `tool_use`/`tool_result` 一一对应。

## 4. Claude Code Router 中的模型选项

- 样例配置 `claude-code-router/ui/config.example.json` 给出了可映射的内部模型标识：
  - `Providers` 节允许把各云厂商模型映射为可供 Claude Code 选择的名称（示例包含 `anthropic/claude-sonnet-4`, `anthropic/claude-3.5-sonnet`, `deepseek/deepseek-chat-v3-0324`, `google/gemini-2.5-pro-preview` 等）。
  - `Router` 段定义了 `default`、`background`、`think`、`longContext`、`webSearch` 等场景使用的“内部模型”字符串，格式为 `provider,model`，如 `gemini-cli,gemini-2.5-pro`、`openrouter,anthropic/claude-3.5-sonnet`。
- `src/utils/router.ts` 逻辑说明：
  - 当请求 `req.body.model` 带逗号时直接解析 `provider,model`；否则根据 token 数量、工具使用情况自动切换到 `Router.longContext`、`Router.background`、`Router.think` 等（`claude-code-router/src/utils/router.ts:18-137`）。
  - 对于官方 `claude-3-5-haiku` 这类字符串，会路由到 `Router.background` 指定的模型，提示我们在 provider 层需要把 Claude CLI 输入的模型名映射到后端真实模型列表。
- 结合抓包日志与 llxprt-code 默认值，当前 Claude Code 原生可选的官方模型至少包含：`claude-3-5-haiku-20241022`、`claude-sonnet-4-5-20250929`（原默认 `claude-sonnet-4-20250514`），并支持 `claude-3.7-*` / `claude-4-latest` 等别名（参考 `AnthropicProvider.getModels()` 测试，`AnthropicProvider.test.ts:210-233`）。

## 5. 本项目 Provider 规范回顾

- 配置管道：
  - `ConfigModule.forRoot()` 读取环境变量 → `~/.code-cli-any-llm/config.yaml` → `config/config.yaml`，定义字段在 `src/config/config.schema.ts`，当前包含 `openai`, `codex` 两块配置，对应 `aiProvider` 选择哪个实现。
  - 新增 provider 需更新 `config.schema.ts`、`config/config.example.yaml`、`README` 等以暴露可配置项。
- Provider 架构：
  - `OpenAIProvider`、`CodexProvider` 均实现 `OnModuleInit`，在 `src/app.module.ts` 注入，并通过 `GeminiController` 根据 `aiProvider` 路由调用。
  - 请求转换通过 `RequestTransformer`（Gemini → OpenAI 兼容）及增强版 transformer 完成，provider 层负责与目标厂商 API 通信、流式解析。
  - `CodexProvider` 中已有完整的流式解析、工具调用缓冲逻辑，可作为实现 Claude Code provider 时的参考结构。
- 现有日志、错误处理规范：使用 Nest `Logger`，关键步骤打印调试信息，严格处理流式情况下的异常与重试。

## 6. 调研结论与稽核

- Claude Code 官方 CLI 主要通过 `POST /v1/messages`（含 SSE 流式）与 `GET /v1/models` 协议工作，header 需伪装 `claude-cli` User-Agent，并附带 `anthropic-beta` 等标记以启用 Claude Code 专属能力。
- llxprt-code 已实现完善的 Gemini ↔ Anthropic 转换逻辑，可作为本项目实现 Claude Code provider 的直接蓝本。需重点复刻：
  - IContent → Claude Messages 的分支逻辑、工具结果配对、占位 user 消息补齐；
  - 流式事件与工具参数的 JSON 拼装；
  - Tool ID 归一化与 OAuth / API Key 双模式支持（当前只需 API Key，可相应精简）。
- Claude Code Router 提示内部模型约束：我们需要维护“Claude CLI 可见模型名单”并与后台真实模型映射保持一致，默认可选项包括最新的 Claude 3.5/4 系列。
- 后续开发应：
  1. 在配置层新增 `claudeCode` 节并允许通过 `aiProvider=claude-code` 切换；
  2. 参考 llxprt-code 的转换逻辑实现新的 provider，确保 header 伪装、`anthropic-beta`、`x-app` 等必选头；
  3. 对接现有 transformer / controller，补充测试（至少单元 + 流式模拟）。
- 风险点：
  - 官方 `anthropic-beta` 标头可能随版本变化，需要在配置中可覆盖。
  - 日志显示请求体巨大（>70KB），需确认 Nest body parser / 超时已覆盖（`TimeoutMiddleware` 默认 60s，可能需调整）。
  - 仅实现 API Key 模式时要确保拒绝 OAuth 配置并给出清晰错误。
