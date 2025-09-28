# Qwencode CLI 模式扩展计划

## 背景
- `code-cli-any-llm` 需要新增 `--cli-mode=qwencode`，以统一入口启动 Qwen Code CLI，并复用现有网关的 OpenAI 兼容接口。
- 现有实现已支持 `gemini`、`opencode`、`crush` 模式；本计划在此基础上扩展新的模式，保持配置体系、网关模式与 CLI 启动逻辑的一致性。
- 参考资料：`docs/cli-mode-extension-guide.md`、`src/cli/cal-code.ts`、`src/cli/cal-gateway.ts`、`src/config/*`，以及 `/home/kdump/llm/project/qwen-code/` 源码中关于 OpenAI 兼容配置与鉴权的实现。

## 目标
- 在 CLI 层新增 `--cli-mode=qwencode` 的解析、归一化与校验。
- 自动写回全局配置：当选择 `qwencode` 时强制 `gateway.apiMode=openai`、`gateway.cliMode=qwencode`。
- 为 Qwen Code 准备所需的配置/环境变量（`~/.qwen/settings.json`、`~/.qwen/.env` 等），并在缺失凭证时给出明确提示。
- 启动 `qwen` CLI 进程并注入必要环境变量，保持与现有模式一致的健康检查与错误处理。
- 同步更新相关文档、示例配置与帮助文案，确保用户可查阅新模式使用方式。
- 补充必要的自动化测试，覆盖配置写入与模式归一化逻辑。

## 范围与不在范围
- ✅ 覆盖 CLI 参数解析、配置层、健康检查、文档与测试。
- ✅ 复用现有网关 OpenAI 兼容实现，无需新增后端 Provider。
- ❌ 不涉及对 Qwen Code upstream 仓库的修改，仅依赖其 CLI 行为。
- ❌ 不扩展 `gateway.apiMode` 以外的后端协议。

## 工作分解与状态

### 1. CLI 入口扩展
- [x] 更新 `src/cli/cal-code.ts`：
  - 扩展 `CliMode`/`CLI_MODE_VALUES`/`parseCliModeValue` 支持 `qwencode`。
  - `prepareGatewayContext` 在 `qwencode` 下强制写回 `gateway.apiMode=openai` 与 `gateway.cliMode=qwencode`。
  - `runGalCode` 新增分支：调用 `prepareQwencodeConfig` 与 `launchQwencodeCLI`。
- [x] 实现 `prepareQwencodeConfig`：
  - 写入 `~/.qwen/settings.json`，确保 `security.auth.selectedType='openai'`（保留 `useExternal` 等其他字段）。
  - 写入 `~/.qwen/.env`，注入 `OPENAI_BASE_URL=http://<host>:<port>/api/v1/openai/v1`、`OPENAI_API_KEY`（优先 `config.gateway.apiKey`，缺失时使用占位符并提示）、`OPENAI_MODEL`（优先 `config.openai.model`，回退 `'codex-proxy'`）。
  - 合并现有配置，避免覆盖用户自定义内容，写入权限保持 `0o600`。
- [x] 实现 `launchQwencodeCLI`：
  - 调用 `runCliCommand('qwen', args, env)`，在 `env` 内设置 `OPENAI_*` 变量与 `QWEN_DEFAULT_AUTH_TYPE=openai`。
  - 捕获 `ENOENT` 等错误并给出“请确保已安装 qwen CLI”提示。

### 2. 网关向导与配置层
- [x] `src/cli/cal-gateway.ts`：
  - `normalizeGatewayCliMode` 与交互向导提示新增 `qwencode`。
  - 写回配置时保持 `qwencode` 与 `openai` 的联动。
- [x] `src/config/global-config.interface.ts`、`config.schema.ts`：
  - 类型枚举增加 `qwencode`；校验 `@IsIn` 范围同步扩展。
- [x] `src/config/global-config.service.ts`：
  - 归一化逻辑识别 `qwencode` 并自动将 `gateway.apiMode` 设置为 `openai`。
  - 其他与 CLI 模式相关的默认值/警告逻辑同步更新。
- [x] `src/config/config.module.ts`（如读取枚举处）同步更新默认值。

### 3. 控制层与健康检查
- [x] `src/controllers/health.controller.ts`：
  - CLI 模式归一化支持 `qwencode`，确保健康检查返回正确值。

- [x] `config/config.example.yaml`：示例配置增加 `cliMode: qwencode` 使用场景。
- [x] 帮助文本 `src/cli/help-text.txt`、`src/cli/help-text-cn.txt` 增加模式说明与示例命令。
- [x] 其他文档（`README.md`/`README_CN.md`、`docs/quick-start.md`、`docs/opensource-ai4se-tools.md` 等）补充使用指南（需与项目维护者确认范围）。

### 5. 测试与验证
- [ ] 新增/更新单元测试：
  - [x] 针对 `prepareQwencodeConfig` 的合并逻辑。
  - [x] `global-config.service`/`cal-gateway` 归一化测试覆盖 `qwencode`。
  - [x] 健康检查返回值包含 `qwencode`。
- [x] 运行 `pnpm run lint`、`pnpm run test` 验证。
- [ ] 手动验证：设置 `gateway.apiKey` 后运行 `pnpm run cal code -- --cli-mode=qwencode`，确认 Qwen CLI 成功调用 `http://<host>:<port>/api/v1/openai/v1`。

### 6. 发布准备
- [ ] 更新变更日志/PR 说明，列出新模式、配置影响与验证步骤。
- [ ] 与项目维护者确认是否需要额外截图或录屏演示。

## 关键决策记录
- 采用环境变量注入优先于修改 Qwen CLI 源码；`OPENAI_*` 变量由网关提供。
- `OPENAI_MODEL` 默认使用 `config.openai.model`，若为空则回退至 `codex-proxy`，与网关现有模型代理一致。
- 缺失 `gateway.apiKey` 时仍允许启动，但使用占位符提醒用户补全，避免硬失败。
- `QWEN_DEFAULT_AUTH_TYPE=openai` 用于跳过 Qwen CLI 首次弹出的授权模式选择，保持无交互体验。

## 依赖与风险
- 依赖用户环境已安装 `qwen` CLI 并可通过 PATH 调用；需在文档中明确说明。
- 若用户已有自定义 `~/.qwen/settings.json`/`.env`，需确保合并策略不覆盖关键字段；实现时务必做深拷贝/合并。
- Qwen CLI 未来版本若调整配置路径或鉴权逻辑，需同步更新 plan 与实现。

## 里程碑
1. **准备阶段**：完成代码阅读与方案定稿（✅）。
2. **开发阶段**：按上述任务实现功能并自测。
3. **验证阶段**：补充测试、完善文档并通过 lint/test。
4. **交付阶段**：提交 PR，附验证记录与后续建议。

## 进度备注
- 如需随时更新，请直接在本文件的复选框中标记完成情况，并追加日期/说明，保持计划与实际进度同步。
