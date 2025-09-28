# CLI 模式扩展开发者手册

## 背景与目标
- `code-cli-any-llm` 通过 `cal code` 命令为多款 AI Code CLI 工具提供统一入口，并在后端网关之间切换 Gemini/OpenAI 兼容协议。
- `--cli-mode` 参数允许开发者切换 `gemini`、`opencode`、`crush`、`qwencode` 等外观体验，本手册系统梳理其实现方式，并给出新增 CLI 模式时的开发流程。
- 目标是帮助开发者快速理解参数解析、配置联动、CLI 启动以及服务侧依赖，确保新增工具遵循既有规范与文档要求。

## 架构总览
- **控制层**：`src/controllers/` 下的 `GeminiController`、`OpenAIController` 与 `HealthController` 提供 HTTP 入口；`HealthController` 会回显当前 `gateway.apiMode` 与 `gateway.cliMode`。
- **服务与 Provider**：`src/services/llm-provider-resolver.service.ts` 根据 `aiProvider` 与 `gateway.apiMode` 选择 `providers/` 下的 `openai`、`codex`、`claude-code` 实现，负责路由模型请求。
- **配置体系**：`GlobalConfigService` 将 `~/.code-cli-any-llm/config.yaml`、仓库模板与环境变量合并；`src/config/config.schema.ts`、`global-config.interface.ts`、`global-config.service.ts` 约束 `gateway.apiMode`、`gateway.cliMode` 等字段。
- **CLI 命令**：`src/cli/cal-code.ts` 管理 `cal code` 主流程，含参数解析、配置写回、CLI 启动；`cal-gateway.ts` 负责首次配置向导与守护进程管理；帮助文案位于 `help-text.txt` / `help-text-cn.txt`。

## `--cli-mode` 工作流程
### 参数解析
- `extractCliModeFromArgs` 会识别 `--cli-mode value` 或 `--cli-mode=value`，并通过 `parseCliModeValue` 校验输入是否属于 `CLI_MODE_VALUES`（默认 `gemini`、`opencode`、`crush`、`qwencode`）。
- 非法值会立即在终端报错并退出，确保 CLI 模式枚举稳定。

### 配置载入与写回
- `prepareGatewayContext` 使用 `GlobalConfigService` 读取配置文件，归一化 `gateway.cliMode` 与 `gateway.apiMode`。
- 当 `cliMode` 选择 OpenAI 兼容工具（`opencode`、`crush`、`qwencode`）时：
  - 自动将 `gateway.apiMode` 调整为 `openai`，并写回配置文件。
  - 若配置首次生成或被修正，命令结束前会触发 `cal restart` 确保网关重启生效。
- 对于 `gemini` 模式，则保持 Gemini 网关设置，可选地校验或生成 Gemini CLI 所需的 `settings.json`。

### CLI 启动
- `runGalCode` 根据最终 `cliMode` 分支执行：
  - `launchGeminiCLI`：注入 `GOOGLE_GEMINI_BASE_URL`、`GEMINI_API_KEY` 后启动 `gemini` CLI。
  - `launchOpencodeCLI`：在运行前调用 `prepareOpencodeConfig` 写入 `~/.config/opencode/opencode.json(c)`，并通过 `OPENAI_BASE_URL`、`CODE_CLI_API_KEY` 连接网关。
  - `launchCrushCLI`：借助 `prepareCrushConfig` 合并 `~/.config/crush/crush.json`，注入 `CRUSH_DISABLE_PROVIDER_AUTO_UPDATE` 等环境变量。
- CLI 启动前会检测网关健康度，必要时调用 `startGatewayProcess` 拉起后台服务并轮询 `/api/v1/health`。

### 后端依赖
- `gateway.apiMode` 控制 `OpenAIController` 是否暴露 `/api/v1/openai/v1/*` 端点，OpenAI 兼容 CLI 必须设置为 `openai`。
- `LlmProviderResolverService` 结合 `aiProvider` 与 `gateway.apiMode` 选择上游 Provider，并在健康检查中提供当前模式状态。
- 新增 CLI 模式需要确认后端是否需要额外路由或 Transformers 支持，若工具依赖特殊协议需同步扩展。

## 已有 CLI 模式实现要点
- **Gemini**：保持默认体验，仅要求可用的 `GEMINI_API_KEY`/`settings.json`；适用于 `gateway.apiMode=gemini`。
- **opencode**：
  - 自动生成 `provider.code-cli`，指向 `http://<host>:<port>/api/v1/openai/v1`，并配置 `@ai-sdk/openai-compatible`。
  - 写入 `models.claude-code-proxy`、`models.codex-proxy` 及默认 `model`，保留用户自定义字段。
- **crush**：
  - 写入 `providers.code-cli` 与模型元数据，设置 `models.large`/`models.small` 对应 `claude-code-proxy`、`codex-proxy`。
  - 通过环境变量关闭 provider 自动更新并传递 `CODE_CLI_API_KEY`。
- **qwencode**：
  - 自动合并 `~/.qwen/settings.json` 与 `~/.qwen/.env`，确保 `security.auth.selectedType='openai'` 并注入 `OPENAI_BASE_URL`/`OPENAI_API_KEY`/`OPENAI_MODEL`。
  - 启动前写入 `QWEN_DEFAULT_AUTH_TYPE=openai`，若缺少 `gateway.apiKey` 会在 `.env` 中写入占位符并提示用户补全。
  - 通过设置 `CAL_QWEN_HOME` 可以覆盖默认的 `~/.qwen` 配置目录，便于测试或自定义安装路径。

## 新增 CLI 模式开发流程
1. **扩展枚举与校验**
   - 在 `src/cli/cal-code.ts` 更新 `CliMode`、`CLI_MODE_VALUES`、`parseCliModeValue`、`normalizeCliMode`。
   - 同步修改 `src/cli/cal-gateway.ts` 的 `normalizeGatewayCliMode` 与配置向导提示文案。
2. **配置层改动**
   - 更新 `src/config/global-config.interface.ts`、`src/config/config.schema.ts`、`src/config/global-config.service.ts`，让 `gateway.cliMode` 支持新枚举并正确归一化。
   - 调整 `src/controllers/health.controller.ts` 对 CLI 模式的归一化逻辑；同步更新 `config/config.example.yaml`、`docs/quick-start.md` 等模板。
3. **CLI 适配逻辑**
   - 在 `cal-code.ts` 中新增 `prepare<NewTool>Config` 负责生成/合并目标配置文件，保证与现有工具一致的 JSON 合并策略与权限设置。
   - 新增 `launch<NewTool>CLI`，使用 `spawn` 注入所需环境变量或可执行路径，处理退出码与错误提示。
   - 若工具要求特定 `gateway.apiMode`、API Key 或额外资源，在 `prepareGatewayContext` 中补充写回逻辑与合法性校验。
4. **文档与帮助**
   - 更新 `README.md`、`README_CN.md`、`docs/opensource-ai4se-tools.md`、`docs/quick-start.md`，补充新模式说明、示例命令与配置样例。
   - 调整 `src/cli/help-text.txt`、`help-text-cn.txt`，加入新的 `--cli-mode` 选项说明。
5. **测试与验证**
   - 增加针对配置生成函数的单元测试，或在既有测试目录下补充 CLI 模式切换的集成测试。
   - 执行 `pnpm run lint`、`pnpm run test`，必要时记录手动验证步骤到 `specs/`。
   - 若需要网络 CLI 联调，可在本地运行新工具指向 `http://localhost:<port>/api/v1` 并记录日志。

## 开发提示
- 保持配置合并操作的幂等性，避免覆盖用户自定义字段；写入文件时统一使用 `mode: 0o600`。
- 当 `gateway.apiKey` 缺失而新 CLI 需要认证时，应提示用户在配置向导或文档中补齐密钥。
- 若新工具依赖 Gemini 协议，可选择保留 `gateway.apiMode=gemini`，但仍需更新健康检查与配置 schema，使枚举完整。
- 任何新增配置字段需同步更新 `config/config.example.yaml`、`docs` 与可能的校验逻辑，遵循仓库“配置需双向同步”的规范。

## 文件与目录索引
- `src/cli/cal-code.ts`：`cal code` 主入口、CLI 模式解析、配置生成与 CLI 启动。
- `src/cli/cal-gateway.ts`：全局配置向导、网关生命周期管理、`normalizeGatewayCliMode`。
- `src/config/config.schema.ts` / `global-config.service.ts` / `global-config.interface.ts`：配置验证、默认值与类型定义。
- `src/controllers/health.controller.ts`：健康检查接口，展示当前网关模式。
- `docs/opensource-ai4se-tools.md`：opencode/crush 集成调研参考。
- `config/config.example.yaml`、`docs/quick-start.md`：示例配置与新模式文档需同步的模板。

## 后续行动建议
- 在正式开发新 CLI 模式前，确认目标工具协议（Gemini/OpenAI/其他）与配置文件格式，以便选择合适的适配方案。
- 开发完成后更新 README 的“多 AI Code CLI 工具网关”章节，保持用户文档与开发者手册一致。
- 若需要跨团队协同，可将本手册作为 PR 描述的参考附件，方便评审快速了解实现要点。
