# OpenAI 兼容扩展行动指南

## 总体目标
- **路由分层**：新建 `openai` 网关前缀，提供 `/openai/v1/models`、`/openai/v1/chat/completions`、`/openai/v1/responses` 三个兼容端点；现有 Gemini 兼容接口整体迁移到 `/gemini/v1/...`。
- **多形态伪装**：在原有 Gemini→LLM 伪装基础上，新增 OpenAI API → LLM 的伪装能力，首批覆盖 `claude codex` 与 `codex` 两条链路。
- **配置可切换**：网关支持通过配置选择 CLI 暴露模式（OpenAI / Gemini），默认仍为 Gemini，并保留对后端 provider（openai/codex/claudeCode）的原有选择逻辑。
- **代码复用优先**：复用现有 `RequestTransformer`、`ResponseTransformer`、`StreamTransformer` 以及 Provider 中的 OpenAI 数据结构，避免重复实现。

## 现有能力复用
- **消息转换链路**：`RequestTransformer`/`ResponseTransformer` 已稳定处理 Gemini<->OpenAI 的消息转换，OpenAI 控制器可以直接复用其产出的 `OpenAIRequest` 结构。
- **流式管线**：`StreamTransformer` 已实现 OpenAI 流式分块到 Gemini SSE 的转换逻辑，可抽象为共享工具，在 OpenAI SSE 输出时同样负责 `[DONE]` 终止符与工具调用拆分。
- **Provider 数据模型**：`OpenAIProvider`、`CodexProvider`、`ClaudeCodeProvider` 均以 `OpenAIRequest`/`OpenAIResponse` 为核心，OpenAI 接口层可以直接串接，不需要新增模型定义。
- **配置加载器**：`GlobalConfigService`、`ConfigModule` 已实现 YAML/环境变量合并，可在其基础上扩展 `gateway.apiMode` 字段。

## 架构与配置调整
- **新增 `gateway.apiMode`**：
  - 类型：`'gemini' | 'openai'`，默认 `'gemini'`。
  - 在 `src/config/global-config.interface.ts`、`config.schema.ts`、`global-config.service.ts` 中声明、校验、落盘，并更新 `config/config.yaml` 模板及 CLI 向导（`cal-gateway`）。
  - 健康检查与日志输出中加入当前 `apiMode`，方便运维识别。
- **启动流程适配**：
  - 在 `main.ts` 引入一个 `ApiModeService`（或直接从 `ConfigService` 读取）用于决定注册哪些控制器路由。
  - 按模式注入路由前缀：Gemini 模式保持 `/api/v1` 下的 `/gemini/...`，OpenAI 模式启用 `/api/v1/openai/...`，同时保留内部路由复用。
- **CLI/文档同步**：调整 `README`、`docs/quick-start.md` 等文件，增加 OpenAI 模式环境变量示例（`OPENAI_BASE_URL=http://host:port/api/v1/openai`）。

## 路由与接口落地
- **OpenAI 端点**：
  - `GET /openai/v1/models`：列出当前 `aiProvider` 下的模型（来自 provider 的配置/接口），返回符合 OpenAI 模型列表格式。
  - `POST /openai/v1/chat/completions`：接受标准 Chat Completions 请求，支持 `stream=true` 流式返回（SSE），利用共享的 provider 层产生输出。
  - `POST /openai/v1/responses`：接受 Responses API 结构，内部可复用 Chat Completions 逻辑（将 inputs/messages 展平成 `OpenAIRequest`），并维持工具调用、思维链字段。
  - 所有接口补充 `OpenAI` 风格错误结构与 `[DONE]` 终止标记。
- **Gemini 端点迁移**：将原有 `/api/v1/models/...` 改写为 `/api/v1/gemini/models/...`（含 generate、stream、countTokens 等），在入口处兼容旧路径并输出弃用提醒。
- **中间件调整**：更新 `main.ts` 的 path rewrite 逻辑，确保 `/api/v1beta`、`/gemini`、`/openai` 共存且互不冲突。

## Provider 改造与抽象
- **统一接口**：为 `CodexProvider`、`ClaudeCodeProvider`、`OpenAIProvider` 补充 `generateContentStream`（若尚未导出）等统一签名，抽象出 `LLMProvider` 接口，供 Gemini / OpenAI 控制器共享。
- **Claude 复用**：`ClaudeCodeProvider` 新增 `generateFromOpenAI` / `streamFromOpenAI`，直接套用现有 `buildClaudePayload`、`convertClaudeResponseToOpenAI`，减少重复转换。
- **工具调用适配**：继续沿用 `ToolCallProcessor` 处理函数调用参数解析，避免多份实现。

## 实施步骤建议
1. **配置层改造**：扩展 `gateway.apiMode` 字段，更新 CLI 与默认配置文件；健康检查输出模式信息。
2. **路由分层**：在 `main.ts` / `AppModule` 中增加 `/gemini`、`/openai` 前缀映射；为旧路径保留短期内的兼容重定向。
3. **OpenAI 控制器**：实现 `OpenAIController`，覆盖 `models`、`chat/completions`、`responses` 三个端点，流式路径复用 `StreamTransformer`。
4. **Provider 接口统一**：对 `ClaudeCodeProvider` 与其他 Provider 补齐 OpenAI 请求入口，并抽象公共服务，用于 Gemini 与 OpenAI 两类控制器。
5. **Gemini 控制器迁移**：调整现有 `GeminiController` 的路径前缀，并校验流式、工具调用与思维链逻辑仍可工作。
6. **测试补充**：
   - 单元：`ApiModeService`、新控制器、Provider 新接口。
   - 集成：分别在 `apiMode=openai` 和 `apiMode=gemini` 下验证路由及流式输出结构。
7. **文档更新**：同步修改 `README`、`docs/quick-start.md`、`docs/configuration.md`，给出两种模式配置/调用示例。

## 验证与交付
- **自动化测试**：执行 `pnpm run lint && pnpm run test`，新增的 e2e/contract 测试覆盖 `/openai` 与 `/gemini` 新路由。
- **手动验证**：通过 OpenAI CLI（`OPENAI_BASE_URL` 指向网关）与 Gemini CLI （`GEMINI_BASE_URL` 指向 `/gemini`）分别验证；收集日志确认代理模式记录正确。
- **发布事项**：在发布说明中标注路由变更与兼容窗口，提示旧路径将逐步下线，并附带配置迁移指南。

## 后续展望
- 扩展 `/openai/v1/responses` 对多请求批处理的支持。
- 如需支持第三种 CLI 形态，可沿用 `apiMode` 扩展为多枚举并继续复用 Provider 层。
- 观察 OpenAI Responses API 的工具执行回调需求，考虑加入 Webhook/回调队列。
