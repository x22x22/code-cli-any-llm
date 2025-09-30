# Code CLI Any LLM

> 让 Gemini、opencode、crush、Qwen Code 等 CLI 无缝切换任意 LLM 提供商

> English version: [README.md](./README.md)

## 🎯 项目简介

Code CLI Any LLM（简称 CAL）是一个多面向网关，既可以冒充 Gemini CLI，也可以切换为 opencode 或 crush，同时将请求代理到任意兼容 OpenAI 协议的后端（如 Claude Code、Codex、OpenAI、智谱AI、千问等）。借助 CAL，您可以保留熟悉的 CLI 体验，又能灵活重定向底层模型或混合多家供应商。

**核心特性**：
- 🔄 **多AI Code CLI 工具网关** —— 保持默认 Gemini 体验，也可通过 `--cli-mode gemini/opencode/crush/qwencode` 切换其它 CLI
- 🔌 **提供商无关** —— 一次配置即可代理 Claude Code、Codex、OpenAI、智谱AI、千问等任何兼容服务
- ⚡ **流式与工具** —— 保留原生 SSE 流式输出、工具调用、思维链等扩展能力
- 🧩 **自动配置** —— 自动生成/合并 AI Code CLI Tool 配置（含 `~/.config/opencode`、`~/.config/crush` 与 `~/.qwen/settings.json`、`~/.qwen/.env`），刷新 `gateway.apiMode/cliMode` 并在变更后重启网关
- 🛡️ **运维助力** —— 内置 restart/kill、健康检查与 PID 自动恢复，便于部署与排障

## 🚀 快速开始

### 安装步骤

1. **（可选）安装 Gemini CLI**（若需要沿用 Gemini AI Code CLI 工具）
```bash
npm install -g @google/gemini-cli@latest --registry https://registry.npmmirror.com
npm install -g @google/gemini-cli-core@latest --registry https://registry.npmmirror.com
```

2. **（可选）安装其它 CLI AI Code CLI 工具**
```bash
# opencode
npm install -g opencode-ai@latest

# crush
brew install charmbracelet/tap/crush   # 或参考 crush 官方文档

# qwen-code
npm install -g @qwen-code/qwen-code@latest
```

3. **安装网关本体**
```bash
npm install -g @kdump/code-cli-any-llm@latest --registry https://registry.npmmirror.com
```

### 首次使用

直接运行以下命令开始使用：

```bash
cal code --cli-mode opencode
# cal code --cli-mode crush
# cal code --cli-mode qwencode
# cal code # 默认是gemini
```

- 向导会要求选择主要 Provider（`claudeCode` / `codex` / `openai`），并填写 Base URL、默认模型、认证方式和 API Key 等信息
- 若使用 `--cli-mode opencode` / `--cli-mode crush` / `--cli-mode qwencode`，会自动生成对应 AI Code CLI Tool 配置并写入 `~/.config/opencode` / `~/.config/crush` / `~/.qwen/settings.json` 和 `~/.qwen/.env`
- 配置保存后，CLI 会自动执行 `cal restart` 重启网关，使 `gateway.apiMode / gateway.cliMode` 与所选AI Code CLI 工具保持一致
- 当 `gateway.apiKey` 缺失而选择 `qwencode` 时，系统会在 `~/.qwen/.env` 写入占位符并提示补齐，确保 Qwen Code CLI 能够顺利连接网关
- 网关健康检查通过后会启动目标 CLI AI Code CLI 工具（默认 Gemini，可随时利用 `--cli-mode` 切换）

> 💡 **Codex ChatGPT 模式**：若在向导中选择 `Codex + ChatGPT`，首次请求时会提示在浏览器完成 OAuth 登录，登录链接将在终端显示。认证成功后令牌将保存到 `~/.code-cli-any-llm/codex/auth.json`，后续请求会自动刷新，无需重复登录。

### 重新配置

如需重新配置或切换AI提供商：

```bash
cal auth
```

## 💡 使用示例

### 基本对话

```bash
# 开始对话
cal code "请用TypeScript写一个HTTP服务"

# 解释代码
cal code "解释一下这段代码的作用"

# 优化建议
cal code "帮我优化这个算法"
```

### 传递文件内容

```bash
# 分析当前目录下的代码文件
cal code "请帮我分析这个项目的架构"

# 请求代码审查
cal code "请审查一下我的代码并提出改进建议"
```

### 查看更多选项

```bash
# 查看 gemini CLI 的所有选项
cal code --help

# 使用其他 gemini CLI 参数
cal code --temperature 0.7 "写一个创意故事"

# 切换为其他 CLI 体验
cal code --cli-mode opencode
cal code --cli-mode crush
cal code --cli-mode qwencode
```

## 📖 使用指南

### 命令概述

`cal` 提供以下主要命令：

- **`cal code [prompt]`** - 与 AI 助手对话（主要功能）
- **`cal auth`** - 配置 AI 服务认证信息
- **`cal start`** - 手动启动后台网关服务
- **`cal stop`** - 停止后台网关服务
- **`cal restart`** - 重启网关服务
- **`cal status`** - 查看网关运行状态
- **`cal kill`** - 强制终止异常进程（故障排除）
- **`cal update`** - 手动检查并安装最新版本
- **`cal version`** - 查看当前版本
- **`cal --help`** - 查看帮助信息

### 自动更新

- 每次交互式 `cal` 命令都会检查 `~/.code-cli-any-llm/version.json` 中的缓存，后台每隔 20 小时刷新一次，检查失败不会阻塞网关启动。
- 执行 `cal code` 时若发现新版本，会在启动 Gemini 体验前暂停，并提供 `y`（立即更新）、`n`（暂不更新）、`skip`（跳过本次版本）和 `off`（关闭自动检查并重启网关）四种选项。
- 随时运行 `cal update` 可以同步刷新缓存并安装最新发布的包。
- 如需彻底关闭自动检测，可设置 `CAL_DISABLE_UPDATE_CHECK=1`（也可以在提示中选择 `off`）。

### Codex ChatGPT (OAuth) 模式

1. 运行 `cal auth`，在向导中选择 **Codex** 作为提供商，并将认证模式设为 **ChatGPT**。
2. 首次执行 `cal code` 或 `cal start` 等命令时，终端会打印一条 `https://auth.openai.com/oauth/authorize?...` 的链接，请复制到浏览器完成登录。
3. 登录过程中 CLI 会在本地 `127.0.0.1:1455` 启动临时回调服务；若端口被占用，可先释放端口或再次尝试（CLI 会自动重试并提示失败原因）。
4. 授权成功后窗口会提示“登录成功，可以返回终端”，令牌将写入 `~/.code-cli-any-llm/codex/auth.json`，包含 `access_token`、`refresh_token`、`id_token` 以及刷新时间戳。
5. 之后网关会自动刷新令牌，不需要重复登录；若手动清理或移动 `auth.json`，再次发起请求时会重新触发浏览器登录。

> 如需自定义令牌目录，可设置环境变量 `CODEX_HOME` 指向目标路径（默认为 `~/.code-cli-any-llm/codex`）。

### 配置管理

系统支持灵活的配置层次结构，优先级如下（高优先级覆盖低优先级）：

1. **项目配置** (`./config/config.yaml`) - 最高优先级，项目特定配置
2. **全局配置** (`~/.code-cli-any-llm/config.yaml`) - 中等优先级，用户默认配置  
3. **环境变量** - 最低优先级，作为基础配置

### 网关模式

- `gateway.apiMode`：决定网关对外暴露的 API 形态（`gemini` 或 `openai`）。设置为 `openai` 时会开启 `/api/v1/openai/v1/...` 兼容接口。
- `gateway.cliMode`：控制 `cal code` 默认启动的 CLI（`gemini` / `opencode` / `crush` / `qwencode`），可通过 `--cli-mode` 临时覆盖。
- `gateway.apiKey`：可选的访问密钥，用于 OpenAI 兼容伪装层，可通过环境变量（如 `CODE_CLI_API_KEY`）传递给 opencode/crush。

当 `gateway.apiMode=openai` 时，网关会提供：
- `GET /api/v1/openai/v1/models`
- `POST /api/v1/openai/v1/chat/completions`
- `POST /api/v1/openai/v1/responses`

### 支持的提供商

| 提供商 | Base URL | 推荐模型 |
| --- | --- | --- |
| Codex | `https://chatgpt.com/backend-api/codex` | `gpt-5-codex` |
| Claude Code | `https://open.bigmodel.cn/api/anthropic`<br>（或自建 Relay 的 `/api` 根路径） | `claude-sonnet-4-5-20250929`, `claude-3.5-sonnet-20241022` |
| **智谱AI**（默认） | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.5` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4`, `gpt-4o` |
| 千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus`, `qwen-turbo` |
| 其他兼容 OpenAI API 的服务 | 自定义 URL | 对应模型名 |

### 环境变量配置

支持通过环境变量进行配置（作为基础配置，优先级最低）：

```bash
# 选择主提供商（支持 claudeCode / codex / openai）
export CAL_AI_PROVIDER="codex"

# Codex 配置
# 认证模式可选 apikey / chatgpt（默认 apikey）
export CAL_CODEX_AUTH_MODE="chatgpt"
# 当选择 ApiKey 模式时填写 API Key；ChatGPT 模式可留空
export CAL_CODEX_API_KEY="your-codex-api-key"
export CAL_CODEX_BASE_URL="https://chatgpt.com/backend-api/codex"
export CAL_CODEX_MODEL="gpt-5-codex"
export CAL_CODEX_TIMEOUT="1800000"
# 可选：推理参数与输出冗长度控制
export CAL_CODEX_REASONING='{"effort":"medium"}'
export CAL_CODEX_TEXT_VERBOSITY="medium"
# 可选：自定义 OAuth 令牌目录（默认为 ~/.code-cli-any-llm/codex）
export CODEX_HOME="$HOME/.custom-codex"

# Claude Code 配置
export CAL_CLAUDE_CODE_API_KEY="your-claude-code-api-key"
export CAL_CLAUDE_CODE_BASE_URL="https://open.bigmodel.cn/api/anthropic"   # 或自建 relay 的 /api 根路径
export CAL_CLAUDE_CODE_MODEL="claude-sonnet-4-5-20250929"
export CAL_CLAUDE_CODE_TIMEOUT="1800000"
export CAL_CLAUDE_CODE_VERSION="2023-06-01"
export CAL_CLAUDE_CODE_BETA="claude-code-20250219,interleaved-thinking-2025-05-14"
export CAL_CLAUDE_CODE_USER_AGENT="claude-cli/1.0.119 (external, cli)"
export CAL_CLAUDE_CODE_X_APP="cli"
export CAL_CLAUDE_CODE_DANGEROUS_DIRECT="true"
export CAL_CLAUDE_CODE_MAX_OUTPUT="64000"

# OpenAI/兼容服务配置
export CAL_OPENAI_API_KEY="your-api-key"
export CAL_OPENAI_BASE_URL="https://api.openai.com/v1"
export CAL_OPENAI_MODEL="gpt-4"
export CAL_OPENAI_TIMEOUT="1800000"
# 可选：OpenAI 组织 ID
export CAL_OPENAI_ORGANIZATION="org-xxxxxx"

# 网关配置
export CAL_PORT="23062"
export CAL_HOST="0.0.0.0"
export CAL_LOG_LEVEL="info"
export CAL_GATEWAY_LOG_DIR="~/.code-cli-any-llm/logs"
#（可选）网关AI Code CLI 工具控制
export CAL_GATEWAY_API_MODE="openai"
export CAL_GATEWAY_CLI_MODE="opencode"
export CAL_GATEWAY_API_KEY="shared-demo-key"
export CAL_DISABLE_UPDATE_CHECK="1"            # 关闭自动更新提示

# 通用高级配置
export CAL_RATE_LIMIT_MAX="100"                # API 限流上限（每15分钟）
export CAL_REQUEST_TIMEOUT="3600000"           # 请求超时时间（毫秒，默认1小时）
export CAL_ALLOWED_ORIGINS="http://localhost:3000,http://localhost:8080"  # CORS 允许的来源
export CAL_LOG_DIR="/custom/log/path"          # 自定义日志目录
```

### 项目特定配置

如需为特定项目使用不同的模型或配置，在项目目录下创建：

```bash
mkdir config
cat > config/config.yaml << EOF
openai:
  apiKey: "project-specific-key"
  model: "gpt-4"
  baseURL: "https://api.openai.com/v1"
  timeout: 1800000
gateway:
  port: 23062
  host: "0.0.0.0"
  logLevel: "info"
  logDir: "./logs"
EOF
```

若要将 Codex 作为项目默认提供商，可在同一文件中写入：

```yaml
aiProvider: codex
codex:
  authMode: ApiKey
  apiKey: "project-codex-key"
  baseURL: "https://chatgpt.com/backend-api/codex"
  model: "gpt-5-codex"
  timeout: 1800000
  # 可选：自定义推理强度与输出冗长度
  reasoning:
    effort: medium
  textVerbosity: medium
```

如需使用 OAuth 登录，可改为：

```yaml
aiProvider: codex
codex:
  authMode: ChatGPT
  baseURL: "https://chatgpt.com/backend-api/codex"
  model: "gpt-5-codex"
  timeout: 1800000
  reasoning:
    effort: medium
    summary: auto
  textVerbosity: medium
```

## 🔧 详细配置说明

### API 配置项

- **`aiProvider`** - 主提供商类型，可选 `openai` 或 `codex`
- **`codex.authMode`** - Codex 认证模式，支持 `ApiKey`（静态密钥）或 `ChatGPT`（OAuth 登录，默认自动刷新令牌）
- **`openai.apiKey`** - OpenAI 或兼容服务的 API 密钥（使用 `openai` 时必需）
- **`openai.baseURL`** - OpenAI 兼容 API 端点地址（默认：智谱AI）
- **`openai.model`** - 默认使用的模型名称（默认：`glm-4.5`）
- **`openai.timeout`** - 请求超时时间，毫秒（默认：1800000 ≈ 30 分钟）
- **`codex.apiKey`** - Codex 的 API 密钥（仅 `ApiKey` 模式必需，`ChatGPT` 模式可省略）
- **`codex.baseURL`** - Codex API 端点地址（默认：`https://chatgpt.com/backend-api/codex`）
- **`codex.model`** - Codex 模型名称（默认：`gpt-5-codex`）
- **`codex.timeout`** - Codex 请求超时时间，毫秒（默认：1800000 ≈ 30 分钟）
- **`codex.reasoning`** - Codex 推理配置，遵循 Codex Responses API 的 JSON 结构
- **`codex.textVerbosity`** - Codex 文本冗长度，支持 `low`/`medium`/`high`

### 网关配置项

- **`gateway.port`** - 服务端口（默认：23062）
- **`gateway.host`** - 绑定地址（默认：0.0.0.0）
- **`gateway.logLevel`** - 日志级别：`debug`/`info`/`warn`/`error`（默认：info）
- **`gateway.logDir`** - 日志目录（默认：`~/.code-cli-any-llm/logs`）

## 🛠️ 故障排除

### AI 助手无响应

**现象**：执行 `cal code` 后无响应或长时间卡住

**解决方案**：
```bash
# 1. 清理异常进程
cal kill

# 2. 重新尝试对话
cal code "你好"
```

### 认证失败

**现象**：提示 API Key 无效或认证失败

**解决方案**：
```bash
# 重新配置认证信息
cal auth
```

**检查项**：
- 确保 API Key 正确且有效
- 验证 baseURL 与提供商匹配
- 确认账户有足够配额

### 服务启动失败

**现象**：网关启动失败或健康检查异常

**解决方案**：
```bash
# 1. 检查服务状态
cal status

# 2. 手动重启服务
cal restart

# 3. 如果仍有问题，强制清理
cal kill
cal start
```

**检查项**：
- 检查网络连接到 AI 提供商
- 确认端口 23062 未被占用
- 验证配置文件格式正确

### 端口冲突

**现象**：提示端口 23062 已被占用

**解决方案**：
1. 修改配置文件中的端口：
```yaml
# ~/.code-cli-any-llm/config.yaml
gateway:
  port: 23063  # 改为其他可用端口
```

2. 或通过环境变量指定：
```bash
export PORT=23063
```

### 配置问题

**现象**：配置校验失败

**解决方案**：
1. 检查配置文件语法：`~/.code-cli-any-llm/config.yaml`
2. 确保所有必需字段已填写
3. 验证文件权限（应为 600）

### 权限问题

**现象**：无法读写配置文件

**解决方案**：
```bash
# 确保目录权限正确
chmod 700 ~/.code-cli-any-llm
chmod 600 ~/.code-cli-any-llm/config.yaml
```

### 网络连接问题

**现象**：连接超时或网络错误

**解决方案**：
1. 检查网络连接
2. 尝试使用不同的 `baseURL`（如国内镜像服务）
3. 增加超时时间：
```yaml
openai:
  timeout: 1800000  # 30 分钟
```

### 查看日志

如需调试，可以查看详细日志：

```bash
# 查看网关日志
tail -n 300 -f ~/.code-cli-any-llm/logs/gateway-{日期-时间}.log

# 启用调试模式
export LOG_LEVEL=debug
cal restart
```

## ❓ 常见问题 (FAQ)

### Q: 提示输入长度超出范围怎么办？

**现象**：
- 在 Gemini CLI 中显示："Model stream ended with an invalid chunk or missing finish reason."
- 在网关日志(~/.code-cli-any-llm/logs/)中可见详细错误，例如：
```
InternalError.Algo.InvalidParameter: Range of input length should be [1, 98304]
```

**原因**：输入的 token 数量超过了模型的默认限制

**解决方案**：
1. 通过配置 `extraBody.max_input_tokens` 增加输入限制：
```yaml
# ~/.code-cli-any-llm/config.yaml 或项目配置文件
openai:
  apiKey: "your-api-key"
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
  model: "qwen-plus-latest"
  extraBody:
    max_input_tokens: 200000  # 增加输入token限制
```

2. 不同模型的默认限制：
   - `qwen-plus-latest`: 默认 129,024，可扩展到 1,000,000
   - `qwen-plus-2025-07-28`: 默认 1,000,000
   - 其他模型请查阅相应文档

### Q: 如何切换到其他 AI 提供商？

**解决方案**：
```bash
# 重新配置认证信息
cal auth
```

在向导中选择想要使用的提供商，也可以通过环境变量 `CAL_AI_PROVIDER`（取值 `openai` 或 `codex`）提前指定。

常见配置示例：
- **OpenAI**: `https://api.openai.com/v1` + `gpt-4` 或 `gpt-4o`
- **千问**: `https://dashscope.aliyuncs.com/compatible-mode/v1` + `qwen-plus` 或 `qwen-turbo`
- **智谱AI**: `https://open.bigmodel.cn/api/paas/v4` + `glm-4.5`
- **Codex**: `https://chatgpt.com/backend-api/codex` + `gpt-5-codex`

### Q: 如何为特定项目使用不同的模型？

**解决方案**：
在项目根目录创建 `config/config.yaml` 文件：
```yaml
openai:
  apiKey: "project-specific-key"
  model: "gpt-4"
  baseURL: "https://api.openai.com/v1"
  timeout: 1800000
gateway:
  logLevel: "debug"  # 项目开发时使用调试模式
```

项目配置优先级最高，会覆盖全局配置。

### Q: 服务启动后无法访问或响应缓慢？

**解决方案**：
1. 检查服务状态：
```bash
cal status
```

2. 检查网络连接到 AI 提供商
3. 尝试增加超时时间：
```yaml
openai:
  timeout: 1800000  # 30 分钟
```

4. 如果仍有问题，重启服务：
```bash
cal restart
```

## 📚 更多资源

- 📋 [开发手册](./DEVELOPMENT.md) - 开发环境设置和构建说明
- 🧠 [架构文档](./CLAUDE.md) - 详细的技术架构和开发指南
- 🧪 [测试说明](./CLAUDE.md#testing-architecture) - 测试架构和运行方式

### 自动更新

- 每个交互式 `cal` 命令都会检查 `~/.code-cli-any-llm/version.json`，并在后台每隔 20 小时刷新缓存，网络错误不会阻塞网关。
- 当运行 `cal code` 时，若检测到新版本会在进入 Gemini 体验前提示四个选项：`y`（立即更新）、`n`（暂不更新）、`skip`（跳过本次版本）或 `off`（关闭自动检查并重启网关）。
- 随时运行 `cal update` 可以同步刷新缓存并安装最新发布的版本。
- 如需永久关闭自动检测，可设置 `CAL_DISABLE_UPDATE_CHECK=1`（与提示中的 `off` 选项效果相同）。

## 🙏 致谢

本项目复刻、借鉴了 [claude-code-router](https://github.com/musistudio/claude-code-router)、[llxprt-code](https://github.com/acoliver/llxprt-code) 与 [aio-cli](https://github.com/adobe/aio-cli) 的实现方式与代码，在此向这些优秀的开源项目与贡献者表示诚挚感谢。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

Apache License 2.0
# Qwen Code 配置目录（可选，默认使用 ~/.qwen）
export CAL_QWEN_HOME="$HOME/.qwen"
