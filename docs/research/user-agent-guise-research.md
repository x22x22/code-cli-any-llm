# 伪装 User-Agent 调研

## Codex

### 伪装示例（API Key 模式）：

```http_header
User-Agent: codex_cli_rs/0.38.0 (Ubuntu 24.04.2 LTS; x86_64) WindowsTerminal
originator: codex_cli_rs
version: 0.38.0
Authorization: Bearer sk-live-***
conversation_id: 8f1f0b18-2fb3-4c24-9a9a-000000000000
session_id: 8f1f0b18-2fb3-4c24-9a9a-000000000000
Accept: text/event-stream
```

### 请求栈概览
- 请求客户端由 `reqwest::Client` 实例化，集中在 `create_client()`，同时写入默认头部配置 `originator` 与 `User-Agent`，见 `codex-rs/core/src/default_client.rs:108`。
- Codex 将请求封装在 `ModelProviderInfo::create_request_builder()` 中，负责附加认证头、静态/环境头等逻辑，见 `codex-rs/core/src/model_provider_info.rs:117`。
- 上游模型流式调用由 `ModelClient::stream()` 分发，Responses API 走 `codex-rs/core/src/client.rs:241`，Chat Completions API 走 `codex-rs/core/src/chat_completions.rs:285`。

### 请求头构成
- `User-Agent`：格式为 `codex_cli_rs/<版本> (<OS 名称>; <架构>) <终端标识>`，由 `get_codex_user_agent()` 生成，并支持可选后缀清洗，见 `codex-rs/core/src/default_client.rs:107`。
- `originator: codex_cli_rs`：所有请求都会携带，便于后端识别来源，见 `codex-rs/core/src/default_client.rs:112`。
- `version: <CARGO_PKG_VERSION>`：内置 OpenAI 提供方默认追加版本号，见 `codex-rs/core/src/model_provider_info.rs:255`。
- `Authorization: Bearer <token>`：`ModelProviderInfo::create_request_builder()` 会根据 API Key 自动写入，见 `codex-rs/core/src/model_provider_info.rs:121`。
- Responses API 专属：附加 `OpenAI-Beta: responses=experimental`、`conversation_id`、`session_id`、`Accept: text/event-stream`，见 `codex-rs/core/src/client.rs:246`。
- Chat Completions 回退：仅保留 `Accept: text/event-stream` 等通用头，逻辑在 `codex-rs/core/src/chat_completions.rs:289`。
- Base URL：默认指向 `https://api.openai.com/v1`，当 `WireApi::Responses` 时访问 `/responses`，当 `WireApi::Chat` 时访问 `/chat/completions`；可通过 `OPENAI_BASE_URL` 或配置覆盖，见 `codex-rs/core/src/model_provider_info.rs:255`。

### 身份识别关键头（API Key 模式）
- `User-Agent`：编码 Codex 版本、宿主 OS、终端，可直接定位到 CLI 客户端形态。
- `originator`：固定值 `codex_cli_rs`，作为 Codex CLI 的来源标签。
- `version`：再一次携带二进制版本号，便于区分发布迭代。
- `Authorization`：`Bearer` API Key 与工作区绑定，后端可追踪到具体凭据。
- `conversation_id` / `session_id`：与 CLI 会话一一对应，有助于把请求映射回终端交互记录。

### 上游代理的 Codex 判定逻辑
- `claude-relay-service` 利用请求体里的 `instructions` 文本判断是否来自 Codex CLI：`req.body?.instructions?.startsWith('You are a coding agent running in the Codex CLI')`（`../claude-relay-service/src/routes/openaiRoutes.js:154`）。
- 一旦未命中该前缀，代理会清理请求体多余字段并覆盖成内置的 Codex 专用 instructions，以保持与官方 Codex Harness 一致的提示语。

```javascript
// ../claude-relay-service/src/routes/openaiRoutes.js
const isCodexCLI = req.body?.instructions?.startsWith(
  'You are a coding agent running in the Codex CLI'
)

if (!isCodexCLI) {
  // ...剔除额外字段
  req.body.instructions = 'You are a coding agent running in the Codex CLI, ...'
}
```

### 实测结论：仅伪装 UA 不足以复刻 Codex
- 直接手工调用 `https://chatgpt.com/backend-api/codex/responses` 需要完整遵循 Codex payload 规范：包括长段系统 instructions、`input` 中的结构化 `ResponseItem`，以及工具列表字段（`tools`、`tool_choice` 等）。
- 仓库脚本 `scripts/test-codex-responses.sh` 将 Codex CLI 的指令模板和工具 JSON 完整带入，再通过 `https://us2.ctok.ai/openai/v1/responses` 成功复现；若仅替换 `User-Agent`/`originator` 而缺少这些字段，则上游返回 `Instructions are not valid` 或 `Missing required parameter`。
- 因此，要模拟 Codex，除了 UA/头部，还必须使用专门的 Provider 逻辑进行报文转换（如 `claude-relay-service` 的 `openaiRoutes`），让请求体符合 Codex Responses API 的契约。

### 代码摘录

```rust
// codex-rs/core/src/default_client.rs
pub fn create_client() -> reqwest::Client {
    use reqwest::header::HeaderMap;

    let mut headers = HeaderMap::new();
    headers.insert("originator", ORIGINATOR.header_value.clone());
    let ua = get_codex_user_agent();

    reqwest::Client::builder()
        .user_agent(ua)
        .default_headers(headers)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}
```

```rust
// codex-rs/core/src/model_provider_info.rs
let mut builder = client.post(url);

if let Some(auth) = effective_auth.as_ref() {
    builder = builder.bearer_auth(auth.get_token().await?);
}

Ok(self.apply_http_headers(builder))
```

```rust
// codex-rs/core/src/model_provider_info.rs
http_headers: Some(
    [("version".to_string(), env!("CARGO_PKG_VERSION").to_string())]
        .into_iter()
        .collect(),
),
```

```rust
// codex-rs/core/src/client.rs
let mut req_builder = self
    .provider
    .create_request_builder(&self.client, &auth)
    .await?;

req_builder = req_builder
    .header("OpenAI-Beta", "responses=experimental")
    .header("conversation_id", self.conversation_id.to_string())
    .header("session_id", self.conversation_id.to_string())
    .header(reqwest::header::ACCEPT, "text/event-stream")
    .json(&payload_json);
```

### SDK 与依赖
- Codex 没有使用官方 OpenAI SDK，HTTP 层完全基于 `reqwest 0.12`（启用 `json`、`stream` 特性），见 `codex-rs/core/Cargo.toml:35`。
- 终端信息由 `terminal::user_agent()` 根据环境变量推断，例如 Windows Terminal 会产生 `WindowsTerminal` 标识，见 `codex-rs/core/src/terminal.rs:5`。

## Claude Code

### 伪装示例（API Key 模式）：

```http_header
User-Agent: claude-cli/1.0.117 (external, undefined)
x-app: cli
X-Stainless-Lang: js
X-Stainless-Package-Version: 0.60.0
X-Stainless-OS: Linux
X-Stainless-Arch: x64
X-Stainless-Runtime: node
X-Stainless-Runtime-Version: v22.19.0
anthropic-version: 2023-06-01
anthropic-dangerous-direct-browser-access: true
Accept: application/json
Content-Type: application/json
X-Stainless-Retry-Count: 0
X-Stainless-Timeout: 600
Authorization: Bearer sk-ant-***
```

> 说明：`CLAUDE_CODE_ENTRYPOINT` 未设置时，`User-Agent` 括号部分回落为 `undefined`；若通过环境变量指定入口名，会被拼接进 UA 字符串。

### 请求栈概览
- CLI 入口集中在 `@anthropic-ai/claude-code/cli.js`，`fV()` 负责实例化 `Anthropic` 客户端并注入默认头（`x-app`、`User-Agent`、`X-Stainless-*` 等），参见 `cli.js:1019-1030`。
- `Anthropic` 基类（Stainless 生成）在 `buildHeaders()` 中合成请求头，追加 `anthropic-version`、`anthropic-dangerous-direct-browser-access`、`X-Stainless-Retry-Count`、鉴权头等，参见 `cli.js:1009-1018`。
- `buildRequest()` / `makeRequest()` 统一封装超时、重试、`X-Stainless-Timeout` 等逻辑，是所有 `/v1/messages`、`/v1/messages/stream` 等调用的最终出口，参见 `cli.js:1009-1014`。

### 请求头构成
- `User-Agent`：`claude-cli/<版本> (external, <ENTRYPOINT>)`，由 `WM()` 生成；`ENTRYPOINT` 缺省为 `process.env.CLAUDE_CODE_ENTRYPOINT`，参见 `cli.js:1013`。
- `x-app: cli`：在 `fV()` 中硬编码，作为 CLI 身份标签，参见 `cli.js:1020`。
- `X-Stainless-*`：`FS9()` 按运行时采样语言、SDK 版本（0.60.0）、OS、架构、运行时版本，统一写入 `X-Stainless-Lang/X-Stainless-OS/...`，参见 `cli.js:992-1008`。
- `anthropic-version: 2023-06-01` & `anthropic-dangerous-direct-browser-access: true`：Stainless SDK 默认值，`buildHeaders()` 每次请求都会携带，参见 `cli.js:1009-1016`。
- 超时与重试：`X-Stainless-Timeout` 表示秒级超时，`X-Stainless-Retry-Count` 记录重试次数，初始为 `0`，参见 `cli.js:1009-1015`。
- 可选定制：`ANTHROPIC_CUSTOM_HEADERS` 支持通过换行分隔的 `Header: Value` 字串追加自定义头，参见 `cli.js:1020-1025`。
- 鉴权：优先尝试 OAuth `Authorization: Bearer <token>`，否则回落到 `X-Api-Key`，逻辑在 `apiKeyAuth()`/`bearerAuth()`，参见 `cli.js:1009-1012`。

### 身份识别关键头（API Key 模式）
- `User-Agent`：直接暴露 `claude-cli/<版本>` 与入口名，可唯一定位 CLI 客户端。
- `x-app: cli`：Anthropic 内部用于区分产品线的标志。
- `X-Stainless-*`：Stainless 生成的运行环境指纹（OS、arch、runtime version），便于后端分析访问信息。
- `anthropic-version` / `anthropic-dangerous-direct-browser-access`：Stainless JS SDK 特有组合，表明由 Node 环境直接访问官方 API。
- `Authorization` / `X-Api-Key`：绑定到 Anthropic 账户或 OAuth 会话，是追踪凭据的核心。

### 代码摘录

```ts
// node_modules/@anthropic-ai/claude-code/cli.js
function WM(){
  return `claude-cli/${{ISSUES_EXPLAINER:"report the issue at https://github.com/anthropics/claude-code/issues",PACKAGE_URL:"@anthropic-ai/claude-code",README_URL:"https://docs.anthropic.com/s/claude-code",VERSION:"1.0.117"}.VERSION} (external, ${process.env.CLAUDE_CODE_ENTRYPOINT})`;
}

async function fV({ apiKey, maxRetries = 0, model, isNonInteractiveSession, isSmallFastModel = false }) {
  const headers = { "x-app": "cli", "User-Agent": WM(), ...D_6() };
  if (await rm(), !b2()) z_6(headers);

  const baseOptions = {
    defaultHeaders: headers,
    maxRetries,
    timeout: parseInt(process.env.API_TIMEOUT_MS || String(600000), 10),
    dangerouslyAllowBrowser: true,
    fetchOptions: DX2(),
  };

  if (process.env.CLAUDE_CODE_USE_BEDROCK) {
    return new ey1({ /* 省略：Bedrock 客户端封装 */ });
  }
  if (process.env.CLAUDE_CODE_USE_VERTEX) {
    return new lk1({ /* 省略：Vertex 客户端封装 */ });
  }

  const client = {
    apiKey: b2() ? null : apiKey || aJ(isNonInteractiveSession),
    authToken: b2() ? l3()?.accessToken : void 0,
    ...baseOptions,
    ...Mg() && { logger: _D0() },
  };
  return new AP(client);
}
```

```ts
// node_modules/@anthropic-ai/claude-code/cli.js
async buildHeaders({ options, method, bodyHeaders, retryCount }) {
  const base = {
    Accept: "application/json",
    "User-Agent": this.getUserAgent(),
    "X-Stainless-Retry-Count": String(retryCount),
    ...this._options.dangerouslyAllowBrowser && { "anthropic-dangerous-direct-browser-access": "true" },
    "anthropic-version": "2023-06-01",
  };
  const auth = await this.authHeaders(options);
  return s5([base, auth, this._options.defaultHeaders, bodyHeaders, options.headers]).values;
}
```

### SDK 与依赖
- `@anthropic-ai/claude-code` 内置 `@anthropic-ai/sdk`（Stainless 生成的 Node SDK）版本 `0.60.0`，通过 `fetch` 与 `AbortController` 实现 HTTP 层。
- AWS Bedrock / Vertex 模式由 `CLAUDE_CODE_USE_BEDROCK`、`CLAUDE_CODE_USE_VERTEX` 控制，分别封装在 `ey1`、`lk1` 客户端中，但默认路径为 first-party 直连。
- 终端信息不会写入头部，只在 CLI 日志与交互逻辑中使用；伪装 User-Agent 时主要关注上述 `x-app`、`X-Stainless-*`、`anthropic-*` 等字段。
