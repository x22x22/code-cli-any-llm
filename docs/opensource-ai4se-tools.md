# Open-Source AI4SE 工具调研总结

本文记录 `code-cli-any-llm` 网关针对开源 AI 编程工具的兼容性调研，聚焦 opencode 与 crush 两个 CLI，并梳理实现 `claude code` / `codex` 伪装的必要增强项。

## 最新进展概览
- **OpenAI 接口就绪**：新增 `OpenAIController` 挂载 `/api/v1/openai/v1/{models,chat/completions,responses}`，统一伪装 `claude code`、`codex` 和 OpenAI Provider；`LlmProviderResolverService` 负责在 Gemini/OpenAI 控制器之间共享 Provider 解析。
- **Provider 能力补齐**：`ClaudeCodeProvider` 现支持 OpenAI 结构的同步/流式响应与模型列表，为伪装层直接复用提供基础。
- **配置强化**：`gateway` 增加 `apiMode`、`cliMode`、`apiKey` 三字段并写入校验逻辑，向导与健康检查均可展示当前模式；当 CLI 选择 `opencode/crush` 时自动切换为 `openai` 模式。
- **CLI 扩展**：`gal code` 支持 `--cli-mode` 参数，可自动生成/合并 `opencode.json`、`crush.json`（含 `@ai-sdk/openai-compatible` 与模型映射）并为 CLI 注入 `OPENAI_BASE_URL=/api/v1/openai/v1`；配置更新后自动写回 YAML 并调用 `gal restart`。
- **运维体验**：`gal restart` 若发现 PID 缺失会执行 `gal kill` 逻辑清理残留进程；状态输出会复用原 PID 或重新探测端口并回写 `gateway.pid.json`。
- **文档同步**：README（中/英）、quick-start 及本指南已补齐新路由、配置字段、CLI 示例及 opencode/crush 集成说明。

## 网关现状
- **协议转换**：当前所有流量聚合在 `/api/v1` 下，由 `GeminiController` 把 Gemini 请求转换为 OpenAI 结构，再交由 `OpenAIProvider`、`CodexProvider`、`ClaudeCodeProvider` 对接真实模型，实现 Gemini → OpenAI → 目标模型的链路。
- **转换组件**：`RequestTransformer`、`ResponseTransformer`、`StreamTransformer` 和 `ToolCallProcessor` 负责消息/流式/工具调用等细节处理，`TokenizerService` 负责 token 统计。
- **配置体系**：`GlobalConfigService` 支持层级化加载配置，当前仅能选择底层 `aiProvider`（openai/codex/claudeCode），尚未区分 CLI 或 API 形态。
- **CLI 能力**：`gal code` 默认启动 Gemini CLI，只注入 `GOOGLE_GEMINI_BASE_URL`、`GEMINI_API_KEY`，缺乏 opencode/crush 的快捷配置与命令切换。

## 新增目标
> 让本网关既能代理 Gemini CLI，又能代理任意 OpenAI 兼容 CLI（opencode、crush 等），并在上游伪装成 `claude code` 与 `codex`。

- **路由分层**：
  - 新增 `/openai/v1` 前缀实现 `GET /models`、`POST /chat/completions`、`POST /responses`。
  - 原 Gemini 入口整体迁移到 `/gemini/v1/...`，保留兼容提示。
- **Provider 复用**：沿用现有 Transformer/Provider，将 OpenAI 控制器输出统一伪装成 `claude code` 或 `codex` 风格，保持流式与工具调用体验一致。
- **模式配置**：引入 `gateway.apiMode`（区分 Gemini/OpenAI）与 `gateway.cliMode`（决定 `gal code` 默认启动 CLI：gemini/opencode/crush）。

## opencode 调研
- **配置路径**：`packages/opencode/src/global/index.ts` 将默认配置存放在 `~/.config/opencode`；CLI 亦支持通过 `OPENCODE_CONFIG_CONTENT` 注入 JSON。
- **Provider 能力**：
  - `packages/opencode/src/config/config.ts` 的 `provider` 字段允许为任何 OpenAI 兼容服务设置 `baseURL`、`apiKey`、`timeout` 等；`model` 字段可指定默认模型（格式 `provider_id/model_id`）。
  - `Provider` 模块支持自定义 provider，并自动合并 models.dev 的模型清单。
- **实际需求**：为网关新增 OpenAI 前缀后，只需把 `baseURL` 指向 `http://<host>:<port>/api/v1/openai`，并提供一个“虚拟 API Key”即可完成对接。
- **缺口**：`gal code` 尚未提供生成/合并 opencode 配置的能力，也不会自动把目标模型设为 `claude code`/`codex` 伪装版本。

### 面向 opencode 的集成计划
1. `gal code` 在选择 `cliMode=opencode` 时：
   - 自动在 `~/.config/opencode/opencode.json(c)` 中注入/更新 provider（示例 ID：`code-cli`），设置 `baseURL`/`apiKey`。
   - 支持写入默认模型（如 `code-cli/claude-code` 或 `code-cli/codex`）。
   - 如果用户不希望持久化，可改用 `OPENCODE_CONFIG_CONTENT` 临时注入。
2. 启动 CLI 时调整环境：允许配置 `OPENCODE_BIN_PATH`、`OPENCODE_CONFIG`，并以 `spawn('opencode', ...)` 代替现有的 Gemini CLI。
3. 在文档与交互向导中加入 opencode 使用说明。

## crush 调研
- **配置方式**：`crush` 通过 `.crush.json` → `crush.json` → `~/.config/crush/crush.json` 三层优先级读取配置，结构定义在 `internal/config/config.go` 与 `schema.json`。
- **Provider 模型**：`providers` 节对每个 OpenAI 兼容源设置 `type="openai"`、`base_url`、`api_key`；可在 `models` 数组中声明名称、上下文窗口、费用等信息。Crush 运行时允许使用 `CRUSH_<KEY>` 环境变量覆盖真实值。
- **默认模型选择**：`Config.defaultModelSelection` 会选取首个可用 provider 的默认模型；若要伪装 `claude code`/`codex`，需在配置中写入对应 `models` 并设为默认。
- **缺口**：缺少 `gal code` 对 Crush 的配置生成能力，无法自动把上游基地址改为网关，也未注入所需 API Key。

### 面向 crush 的集成计划
1. 为 `gal code` 增加 `cliMode=crush`：
   - 自动检测/创建用户配置文件，在 `providers` 中写入示例项（ID 如 `code-cli`，`type=openai`）。
   - 写入 `models` 列表（例如 `claude-code`、`codex`）并设置 `models.large`/`models.small`。
   - 允许通过环境变量模式（`CRUSH_PROVIDER_*`）临时覆盖，避免修改用户现有配置。
2. 启动 CLI 时，`spawn('crush', ...)` 并注入 `CRUSH_<ENV>`，如需要可共享 CLI 日志目录。
3. 文档中新增 Crush 对接指南，说明默认配置路径与恢复方法。

## 交付与测试建议
- **网关端**：
  - 实现 `/openai/v1/models|chat/completions|responses`，复用现有 Provider，并覆盖流式、错误处理与工具调用。
  - 调整 `/gemini/v1/...` 路由与健康检查，让 `aiProvider` 与 `apiMode` 在日志/健康响应中可见。
- **CLI 工具**：
  - 新增模式切换向导，首次切换时提示并生成示例配置文件。
  - 在 `gal code` 中抽象一层 CLI 启动适配器，便于后续扩展其它 OpenAI 兼容工具。
- **测试**：
  - 单元：路由控制器、配置生成器、CLI 启动流程。
  - 集成：模拟 opencode/crush 请求，验证 `/openai/v1` 端点的流式/非流式行为及伪装效果。
  - 文档：更新 `README`、`quick-start`、新加入的 CLI 章节。

## 后续关注
- 扩展 `/openai/v1/responses` 以支持批量请求、工具回调等高级能力。
- 在 CLI 中提供一键切换默认模型、查看当前模式/路由的便捷命令。
- 评估对更多开源 AI4SE 工具（如 cursor、cline 等）的接入可能性，复用同一套网关与配置模式。

## 详细执行步骤

### 1. 网关层
1. **配置拓展**：
   - 在 `src/config/config.schema.ts`、`global-config.interface.ts`、`global-config.service.ts` 中新增 `gateway.apiMode: 'gemini' | 'openai'`（默认 `gemini`）与 `gateway.cliMode: 'gemini' | 'opencode' | 'crush'`。
   - `ConfigModule` 加载逻辑与 `~/.code-cli-any-llm/config.yaml` 模板同步更新，并在 CLI 向导（`gal-gateway`）中收集新字段。
   - 健康检查响应体与日志记录新增 `apiMode`、`cliMode` 字段。
2. **路由拆分**：
   - 新建 `OpenAIController`，挂载至 `/openai/v1`，实现 `GET /models`、`POST /chat/completions`、`POST /responses`，内部复用 Provider 层；流式输出遵循 OpenAI SSE（含 `[DONE]`）。
   - 调整 `GeminiController` 路径至 `/gemini/v1/...`，旧路由通过中间件兼容并输出弃用提示。
   - 在 `main.ts` 根据 `apiMode` 动态注册路由（支持双模式共存）。
3. **Provider 能力**：
   - 为 `ClaudeCodeProvider` 提供 `generateFromOpenAI`、`streamFromOpenAI` 快捷方法；必要时抽象 `LLMProvider` 接口统一 `generateContent`/`generateContentStream`。
   - Provider 内根据目标伪装模型（`claude code`/`codex`）配置默认模型 ID 与额外 headers。

### 2. CLI 与配置生成
1. **`gal code` 模式切换**：解析 `cliMode`，提供 `--cli-mode` 参数与交互式选择，首次切换时展示配置差异与确认。
2. **opencode 集成**：
   - 检查 `~/.config/opencode/opencode.json(c)`，若不存在即生成，若存在则 JSON 合并保留用户字段。
   - 注入 provider `code-cli`：
     ```jsonc
     {
       "provider": {
         "code-cli": {
           "options": {
             "baseURL": "http://<host>:<port>/api/v1/openai",
             "apiKey": "${CODE_CLI_API_KEY}"
           },
           "models": {
             "claude-code-proxy": { "options": { "thinking": { "type": "enabled" } } },
             "codex-proxy": {}
           }
         }
       },
       "model": "code-cli/claude-code-proxy"
     }
     ```
   - 允许 `OPENCODE_CONFIG_CONTENT` 模式覆盖；运行 CLI 前 `spawn('opencode', ...)` 并设置 `OPENCODE_CONFIG`、`CODE_CLI_API_KEY` 等环境变量。
3. **crush 集成**：
   - 递归寻找 `.crush.json` / `crush.json` / `~/.config/crush/crush.json`，必要时创建；合并 `providers` 字段。
   - 写入：
     ```json
     {
       "providers": {
         "code-cli": {
           "type": "openai",
           "base_url": "http://<host>:<port>/api/v1/openai",
           "api_key": "$CODE_CLI_API_KEY",
           "models": [
             { "id": "claude-code-proxy", "name": "Claude Code (Gateway)" },
             { "id": "codex-proxy", "name": "Codex (Gateway)" }
           ]
         }
       },
       "models": {
         "large": { "provider": "code-cli", "model": "claude-code-proxy" },
         "small": { "provider": "code-cli", "model": "codex-proxy" }
       }
     }
     ```
   - 运行 CLI 前设置 `CRUSH_DISABLE_PROVIDER_AUTO_UPDATE=1`、`CODE_CLI_API_KEY` 等环境变量。
4. **API Key 管理**：在网关配置中新增 `gateway.apiKey` 供 CLI 调用校验；`gal code` 在第一次切换模式时提示生成并写入示例配置。

### 3. 文档与帮助
- 更新 `README`、`docs/quick-start.md` 增加 OpenAI 模式章节。
- 在 `opensource-ai4se-tools.md` 或独立文档补充操作向导、常见问题、回滚步骤。
- `gal code --help` 添加参数说明，提示配置文件位置。

### 4. 测试
- **单元**：OpenAI 控制器响应格式、Provider 新接口、配置生成器。
- **集成**：在 `apiMode=openai` 下验证 `/openai/v1` 流式/非流式；模拟 CLI 运行，检查生成配置与环境变量。
- **端到端**：通过真实 opencode/crush CLI 指向本地网关，确认能获取伪装响应、工具调用。

## 样例配置与命令

### 网关 `config.yaml`
```yaml
gateway:
  host: 0.0.0.0
  port: 23062
  apiMode: openai
  cliMode: opencode
  apiKey: code-cli-demo-key
openai:
  apiKey: ${REAL_OPENAI_KEY}
  baseURL: https://api.openai.com/v1
aiProvider: claudeCode
claudeCode:
  apiKey: ${REAL_ANTHROPIC_KEY}
  baseURL: https://api.anthropic.com/v1
```

### opencode `opencode.json`
```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "code-cli": {
      "options": {
        "baseURL": "http://localhost:23062/api/v1/openai",
        "apiKey": "code-cli-demo-key"
      },
      "models": {
        "claude-code-proxy": {
          "options": {
            "thinking": {
              "type": "enabled",
              "budgetTokens": 12000
            }
          }
        },
        "codex-proxy": {}
      }
    }
  },
  "model": "code-cli/claude-code-proxy"
}
```

### crush `crush.json`
```json
{
  "$schema": "https://charm.land/crush.json",
  "providers": {
    "code-cli": {
      "name": "Code CLI Gateway",
      "type": "openai",
      "base_url": "http://localhost:23062/api/v1/openai",
      "api_key": "$CODE_CLI_API_KEY",
      "models": [
        {
          "id": "claude-code-proxy",
          "name": "Claude Code (Gateway)",
          "context_window": 200000,
          "default_max_tokens": 16000
        },
        {
          "id": "codex-proxy",
          "name": "Codex (Gateway)",
          "context_window": 120000,
          "default_max_tokens": 12000
        }
      ]
    }
  },
  "models": {
    "large": { "provider": "code-cli", "model": "claude-code-proxy" },
    "small": { "provider": "code-cli", "model": "codex-proxy" }
  }
}
```

### CLI 启动示例
```bash
# 启动网关
pnpm run start:prod

# 使用 opencode 模式
pnpm run gal code --cli-mode opencode

# 使用 crush 模式
pnpm run gal code --cli-mode crush
```

以上调研结果及执行要点可作为后续实现 OpenAI 伪装与多 CLI 支持的指导依据。
