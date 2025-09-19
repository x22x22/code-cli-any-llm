# OpenAI OAuth 与 Responses 接入调研

## claude-relay-service：OpenAI-Responses 代理设计
- 账户模型仅要求填写第三方 `baseApi` 与 `apiKey`，缺少两者会直接抛错，且保存时只加密 `apiKey` (`src/services/openaiResponsesAccountService.js:38` `src/services/openaiResponsesAccountService.js:55` `src/services/openaiResponsesAccountService.js:70`).
- 选中 `openai-responses` 账户时路由不会尝试 OAuth 令牌获取或刷新，`accessToken` 被设为 `null` 并把账户对象原样交给下游 (`src/routes/openaiRoutes.js:44` `src/routes/openaiRoutes.js:51` `src/routes/openaiRoutes.js:109`).
- 中继服务将请求直连到 `${baseApi}${req.path}`，认证头固定为 `Authorization: Bearer <apiKey>`，仅根据配置附加代理或自定义 UA (`src/services/openaiResponsesRelayService.js:47` `src/services/openaiResponsesRelayService.js:51` `src/services/openaiResponsesRelayService.js:80`).
- 管理后台对 `openai-responses` 平台只暴露 `baseApi`、`apiKey`、`userAgent` 等字段，未提供输入 OAuth 令牌或账户 ID 的入口 (`web/admin-spa/src/components/accounts/AccountForm.vue:3456`).
- 管理端路由在创建时直接调用上述服务的 `createAccount`，没有任何 OAuth 步骤 (`src/routes/admin.js:7243`).

## codex：OAuth 登录与令牌维护
- 浏览器完成授权码流程后，回调处理器用授权码换取 `id_token`、`access_token`、`refresh_token`，并尝试以 `id_token` 再交换一次 API Key (`codex-rs/login/src/server.rs:229` `codex-rs/login/src/server.rs:233` `codex-rs/login/src/server.rs:234`).
- `persist_tokens_async` 将返回的令牌写入 `$CODEX_HOME/auth.json`：解析出 `chatgpt_account_id` 填入 `TokenData.account_id`，并更新 `last_refresh` (`codex-rs/login/src/server.rs:445` `codex-rs/login/src/server.rs:468` `codex-rs/login/src/server.rs:475`).
- `TokenData` 结构持久化 `id_token`、`access_token`、`refresh_token` 与可选 `account_id`，并保留解析出的邮箱与套餐信息 (`codex-rs/core/src/token_data.rs:7` `codex-rs/core/src/token_data.rs:23`).
- 运行期通过 `CodexAuth::get_token_data` 加载并缓存 `auth.json`，若 `last_refresh` 超过 28 天会用 `refresh_token` 调用 `https://auth.openai.com/oauth/token` 刷新后重写文件 (`codex-rs/core/src/auth.rs:80` `codex-rs/core/src/auth.rs:87` `codex-rs/core/src/auth.rs:98`).
- 登录产出的 `CodexAuth` 处于 `AuthMode::ChatGPT`，`model_provider_info` 会把默认基址切换到 `https://chatgpt.com/backend-api/codex` 并指向 `/responses` (`codex-rs/core/src/auth.rs:224` `codex-rs/core/src/model_provider_info.rs:141` `codex-rs/core/src/model_provider_info.rs:160`).
- 默认的内置 `openai` provider 要求 OpenAI 认证且声明 `wire_api = responses`，确保 OAuth 模式走 Responses API (`codex-rs/core/src/model_provider_info.rs:260` `codex-rs/core/src/model_provider_info.rs:277` `codex-rs/core/src/model_provider_info.rs:299`).
- 对 Responses API 的请求会附加 `OpenAI-Beta: responses=experimental`，并在使用 ChatGPT 模式时从缓存令牌中提取 `chatgpt-account-id` 放入头部 (`codex-rs/core/src/client.rs:235` `codex-rs/core/src/client.rs:246` `codex-rs/core/src/client.rs:254`).
- 调用 ChatGPT 网关的便捷工具同样要求缓存中存在 `chatgpt-account-id`，否则提示重新登录 (`codex-rs/chatgpt/src/chatgpt_client.rs:16` `codex-rs/chatgpt/src/chatgpt_client.rs:25`).

## 关键结论
- claude-relay-service 的 `openai-responses` 账户只支持静态 API Key，不包含 OAuth 令牌字段或流程。
- codex OAuth 登录会持久化并周期性刷新 `id_token`/`access_token`/`refresh_token`，同时记录 `chatgpt_account_id` 用于请求头，且在 OAuth 模式下默认调用 ChatGPT Codex Responses 端点。
