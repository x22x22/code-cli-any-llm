# Code CLI Any LLM

> A single gateway AI Code CLI tool for Gemini, opencode, and crush CLIs

> 中文版请见 [README_CN.md](./README_CN.md)

## 🎯 Project Overview

Code CLI Any LLM (CAL) is a universal proxy that can impersonate the Gemini CLI, opencode CLI, or crush CLI while routing traffic to any OpenAI-compatible backend (Claude Code, Codex, OpenAI, ZhipuAI, Qwen, ...). You keep using the CLI experience you already know, but gain the freedom to switch providers or fan out across several vendors with consistent tooling.

**Core Features**:
- 🔄 **Multi-facade gateway** – continue using Gemini (`cal code`), or switch to opencode/crush via `--cli-mode`
- 🔌 **Provider agnostic** – proxy to Claude Code, Codex, OpenAI, ZhipuAI, Qwen, or any OpenAI-compatible service
- ⚡ **Streaming & tools** – preserve SSE streaming, tool-calling, and reasoning output per AI Code CLI tool
- 🧩 **Auto configuration** – generate AI Code CLI tool configs, refresh `gateway.apiMode/cliMode`, and restart gateway automatically
- 🛡️ **Operational helpers** – built-in restart/kill utilities, health reporting, PID auto-recovery

## 🚀 Quick Start

### Installation

1. *(Optional)* **Install Gemini CLI** (if you plan to use the Gemini AI Code CLI tool):
   ```bash
   npm install -g @google/gemini-cli@latest --registry https://registry.npmmirror.com
   npm install -g @google/gemini-cli-core@latest --registry https://registry.npmmirror.com
   ```

2. *(Optional)* **Install其他 AI Code CLI tool 工具**（如需体验 opencode 或 crush）：
   ```bash
   # opencode
   npm install -g opencode-ai@latest

   # crush
   brew install charmbracelet/tap/crush   # 或按照 crush 官方文档安装
   ```

3. **安装网关本体**：
   ```bash
   npm install -g @kdump/code-cli-any-llm@latest --registry https://registry.npmmirror.com
   ```

### First Run

Run the following command to get started:

```bash
cal code
```

**First-run flow**
- 向导会收集主要 Provider（`claudeCode` / `codex` / `openai`）以及连接信息：
  - **Base URL**（默认已填，可按需修改）
  - **默认模型**
  - **认证模式**（Codex 支持 `ApiKey` / `ChatGPT`）
  - **API Key**（按 Provider 要求填写）
- 支持同时生成 AI Code CLI tool 配置：首次使用 `--cli-mode opencode` / `--cli-mode crush` 会自动写入 `~/.config/opencode/opencode.json` 或 `~/.config/crush/crush.json`
- 新配置保存后，CLI 会自动重启网关（等价于执行 `cal restart`）并等待健康检查通过
- 重启成功后会启动对应 AI Code CLI tool（默认 Gemini，可通过 `--cli-mode` 切换）

> 💡 **Codex ChatGPT mode**: If you choose `Codex + ChatGPT` in the wizard, the first request will prompt you to finish OAuth login in a browser. The login link appears in the terminal. After a successful login, the token is stored in `~/.code-cli-any-llm/codex/auth.json`. Tokens refresh automatically so you don’t need to log in again.

### Reconfigure

Run this when you need to reconfigure or switch providers:

```bash
cal auth
```

## 💡 Usage Examples

### Basic conversation

```bash
# Start a conversation
cal code "Write an HTTP service in TypeScript"

# Explain code
cal code "Explain what this code does"

# Optimization tips
cal code "Help me optimize this algorithm"
```

### Pass file content

```bash
# Analyze the code files in the current directory
cal code "Please analyze the architecture of this project"

# Request a code review
cal code "Please review my code and suggest improvements"
```

### More options

```bash
# View all Gemini CLI options
cal code --help

# Use other Gemini CLI parameters
cal code --temperature 0.7 "Write a creative story"

# Launch alternative CLI experiences
cal code --cli-mode opencode
cal code --cli-mode crush
```

## 📖 User Guide

### Command overview

`cal` provides the following primary commands:

- **`cal code [prompt]`** - Chat with the AI assistant (main feature)
- **`cal auth`** - Configure AI service credentials
- **`cal start`** - Manually start the background gateway service
- **`cal stop`** - Stop the gateway service
- **`cal restart`** - Restart the gateway service
- **`cal status`** - Check the gateway status
- **`cal kill`** - Force-kill stuck processes (for troubleshooting)
- **`cal update`** - Manually check for a new release and install it
- **`cal version`** - Display the current version
- **`cal --help`** - Show help information

### Codex ChatGPT (OAuth) mode

1. Run `cal auth`, choose **Codex** as the provider, and set the auth mode to **ChatGPT** in the wizard.
2. The first time you run `cal code` or `cal start`, the terminal prints a `https://auth.openai.com/oauth/authorize?...` link. Copy it into a browser to complete the login.
3. During login the CLI spins up a temporary callback service on `127.0.0.1:1455`. If the port is taken, free it or try again (the CLI retries automatically and shows error reasons).
4. After the authorization succeeds you’ll see “Login successful, you may return to the terminal.” Tokens are saved to `~/.code-cli-any-llm/codex/auth.json`, including `access_token`, `refresh_token`, `id_token`, and the refresh timestamp.
5. The gateway refreshes tokens automatically afterwards, so you don’t need to log in again. If you delete or move `auth.json`, the browser login will be triggered the next time you send a request.

> To customize the token directory, set the `CODEX_HOME` environment variable (defaults to `~/.code-cli-any-llm/codex`).

### Configuration management

The system supports a flexible configuration hierarchy. Higher priority values override lower ones:

1. **Project configuration** (`./config/config.yaml`) - Highest priority, project-specific
2. **Global configuration** (`~/.code-cli-any-llm/config.yaml`) - Medium priority, user defaults  
3. **Environment variables** - Lowest priority, baseline settings

### Gateway modes

- `gateway.apiMode`: selects which API surface the gateway exposes (`gemini` or `openai`). Set to `openai` to enable `/api/v1/openai/v1/...` endpoints.
- `gateway.cliMode`: controls which CLI the `cal code` command launches by default (`gemini`, `opencode`, or `crush`). You can override per run with `--cli-mode`.
- `gateway.apiKey`: optional shared key forwarded to the OpenAI-compatible AI Code CLI tool. Inject it into opencode/crush configs or expose it via environment variables such as `CODE_CLI_API_KEY`.

When `gateway.apiMode` is set to `openai`, the gateway serves:
- `GET /api/v1/openai/v1/models`
- `POST /api/v1/openai/v1/chat/completions`
- `POST /api/v1/openai/v1/responses`

### Supported providers

| Provider | Base URL | Recommended models |
| --- | --- | --- |
| Codex | `https://chatgpt.com/backend-api/codex` | `gpt-5-codex` |
| Claude Code | `https://open.bigmodel.cn/api/anthropic`<br>(or a relay endpoint such as `https://<host>/api`) | `claude-sonnet-4-20250514`, `claude-3.5-sonnet-20241022` |
| **ZhipuAI** (default) | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.5` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4`, `gpt-4o` |
| Qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus`, `qwen-turbo` |
| Other OpenAI-compatible services | Custom URL | Matching model name |

### Environment variable configuration

You can also configure settings with environment variables (baseline settings with the lowest priority):

```bash
# Choose the primary provider (supports claudeCode / codex / openai)
export GAL_AI_PROVIDER="codex"

# Codex configuration
# Auth mode can be apikey / chatgpt (default apikey)
export GAL_CODEX_AUTH_MODE="chatgpt"
# Provide the API Key when using ApiKey mode; leave empty for ChatGPT mode
export GAL_CODEX_API_KEY="your-codex-api-key"
export GAL_CODEX_BASE_URL="https://chatgpt.com/backend-api/codex"
export GAL_CODEX_MODEL="gpt-5-codex"
export GAL_CODEX_TIMEOUT="1800000"
# Optional: reasoning parameters and output verbosity control
export GAL_CODEX_REASONING='{"effort":"medium"}'
export GAL_CODEX_TEXT_VERBOSITY="medium"
# Optional: custom OAuth token directory (defaults to ~/.code-cli-any-llm/codex)
export CODEX_HOME="$HOME/.custom-codex"

# Claude Code configuration
export GAL_CLAUDE_CODE_API_KEY="your-claude-code-api-key"
export GAL_CLAUDE_CODE_BASE_URL="https://open.bigmodel.cn/api/anthropic"   # 或自建 relay 的 /api 根路径
export GAL_CLAUDE_CODE_MODEL="claude-sonnet-4-20250514"
export GAL_CLAUDE_CODE_TIMEOUT="1800000"
export GAL_CLAUDE_CODE_VERSION="2023-06-01"
export GAL_CLAUDE_CODE_BETA="claude-code-20250219,interleaved-thinking-2025-05-14"
export GAL_CLAUDE_CODE_USER_AGENT="claude-cli/1.0.119 (external, cli)"
export GAL_CLAUDE_CODE_X_APP="cli"
export GAL_CLAUDE_CODE_DANGEROUS_DIRECT="true"
export GAL_CLAUDE_CODE_MAX_OUTPUT="64000"

# OpenAI / compatible service configuration
export GAL_OPENAI_API_KEY="your-api-key"
export GAL_OPENAI_BASE_URL="https://api.openai.com/v1"
export GAL_OPENAI_MODEL="gpt-4"
export GAL_OPENAI_TIMEOUT="1800000"
# Optional: OpenAI organization ID
export GAL_OPENAI_ORGANIZATION="org-xxxxxx"

# Gateway configuration
export GAL_PORT="23062"
export GAL_HOST="0.0.0.0"
export GAL_LOG_LEVEL="info"
export GAL_GATEWAY_LOG_DIR="~/.code-cli-any-llm/logs"
# Optional gateway AI Code CLI tool controls
export GAL_GATEWAY_API_MODE="openai"
export GAL_GATEWAY_CLI_MODE="opencode"
export GAL_GATEWAY_API_KEY="shared-demo-key"
export GAL_DISABLE_UPDATE_CHECK="1"            # Disable automatic update prompts

# General advanced configuration
export GAL_RATE_LIMIT_MAX="100"                # API rate limit cap (per 15 minutes)
export GAL_REQUEST_TIMEOUT="3600000"           # Request timeout in milliseconds (default 1 hour)
export GAL_ALLOWED_ORIGINS="http://localhost:3000,http://localhost:8080"  # Allowed origins for CORS
export GAL_LOG_DIR="/custom/log/path"          # Custom log directory
```

### Project-specific configuration

If you want different models or settings for a given project, create the following in the project directory:

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

To make Codex the default provider for the project, add:

```yaml
aiProvider: codex
codex:
  authMode: ApiKey
  apiKey: "project-codex-key"
  baseURL: "https://chatgpt.com/backend-api/codex"
  model: "gpt-5-codex"
  timeout: 1800000
  # Optional: customize reasoning effort and output verbosity
  reasoning:
    effort: medium
  textVerbosity: medium
```

For OAuth login, switch to:

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

## 🔧 Detailed Configuration

### API settings

- **`aiProvider`** - Primary provider type, choose `openai` or `codex`
- **`codex.authMode`** - Codex auth mode, supports `ApiKey` (static key) or `ChatGPT` (OAuth login with automatic refresh)
- **`openai.apiKey`** - API key for OpenAI or compatible services (required when using `openai`)
- **`openai.baseURL`** - Endpoint URL for OpenAI-compatible APIs (default: ZhipuAI)
- **`openai.model`** - Default model name (default: `glm-4.5`)
- **`openai.timeout`** - Request timeout in milliseconds (default: 1800000 ≈ 30 minutes)
- **`codex.apiKey`** - Codex API key (required only in `ApiKey` mode, optional in `ChatGPT` mode)
- **`codex.baseURL`** - Codex API endpoint URL (default: `https://chatgpt.com/backend-api/codex`)
- **`codex.model`** - Codex model name (default: `gpt-5-codex`)
- **`codex.timeout`** - Codex request timeout in milliseconds (default: 1800000 ≈ 30 minutes)
- **`codex.reasoning`** - Codex reasoning configuration, follows the Codex Responses API JSON schema
- **`codex.textVerbosity`** - Codex text verbosity, supports `low`/`medium`/`high`

### Gateway settings

- **`gateway.port`** - Service port (default: 23062)
- **`gateway.host`** - Bind address (default: 0.0.0.0)
- **`gateway.logLevel`** - Log level: `debug`/`info`/`warn`/`error` (default: info)
- **`gateway.logDir`** - Log directory (default: `~/.code-cli-any-llm/logs`)

## 🛠️ Troubleshooting

### AI assistant not responding

**Symptom**: `cal code` hangs or shows no response

**Solution**:
```bash
# 1. Clean up stuck processes
cal kill

# 2. Try the conversation again
cal code "Hello"
```

### Authentication failure

**Symptom**: API Key is rejected or authentication fails

**Solution**:
```bash
# Reconfigure credentials
cal auth
```

**Checklist**:
- Make sure the API Key is correct and still valid
- Verify that the baseURL matches the provider
- Confirm that the account has sufficient quota

### Service fails to start

**Symptom**: Gateway fails to boot or health check reports errors

**Solution**:
```bash
# 1. Check service status
cal status

# 2. Restart the service manually
cal restart

# 3. If issues persist, force clean up
cal kill
cal start
```

**Checklist**:
- Check network connectivity to the AI provider
- Ensure port 23062 is free
- Verify the configuration file format is correct

### Port conflict

**Symptom**: Port 23062 is already in use

**Solution**:
1. Change the port in the configuration file:
```yaml
# ~/.code-cli-any-llm/config.yaml
gateway:
  port: 23063  # Switch to another available port
```

2. Or set it via environment variables:
```bash
export PORT=23063
```

### Configuration issues

**Symptom**: Configuration validation fails

**Solution**:
1. Check the syntax in `~/.code-cli-any-llm/config.yaml`
2. Make sure all required fields are filled in
3. Validate file permissions (should be 600)

### Permission issues

**Symptom**: Unable to read or write configuration files

**Solution**:
```bash
# Ensure the directory permissions are correct
chmod 700 ~/.code-cli-any-llm
chmod 600 ~/.code-cli-any-llm/config.yaml
```

### Network connectivity issues

**Symptom**: Connection times out or reports network errors

**Solution**:
1. Check your network connection
2. Try another `baseURL` (for example, a local mirror)
3. Increase the timeout:
```yaml
openai:
  timeout: 1800000  # 30 minutes
```

### View logs

To debug, inspect detailed logs:

```bash
# Tail gateway logs
tail -n 300 -f ~/.code-cli-any-llm/logs/gateway-{date-time}.log

# Enable debug mode
export LOG_LEVEL=debug
cal restart
```

## ❓ FAQ

### Q: What should I do when the input length exceeds the limit?

**Symptom**:
- Gemini CLI shows: "Model stream ended with an invalid chunk or missing finish reason."
- Gateway logs (`~/.code-cli-any-llm/logs/`) contain errors such as:
```
InternalError.Algo.InvalidParameter: Range of input length should be [1, 98304]
```

**Cause**: The number of input tokens exceeds the default limit of the model

**Solution**:
1. Increase the input limit via `extraBody.max_input_tokens`:
```yaml
# ~/.code-cli-any-llm/config.yaml or a project configuration file
openai:
  apiKey: "your-api-key"
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
  model: "qwen-plus-latest"
  extraBody:
    max_input_tokens: 200000  # Increase the input token limit
```

2. Default limits for common models:
   - `qwen-plus-latest`: default 129,024, expandable to 1,000,000
   - `qwen-plus-2025-07-28`: default 1,000,000
   - Refer to vendor manuals for other models

### Q: How can I switch to another AI provider?

**Solution**:
```bash
# Reconfigure credentials
cal auth
```

In the wizard, choose the provider you need. You can also preselect it with the environment variable `GAL_AI_PROVIDER` (`openai` or `codex`).

Common configuration examples:
- **OpenAI**: `https://api.openai.com/v1` + `gpt-4` or `gpt-4o`
- **Qwen**: `https://dashscope.aliyuncs.com/compatible-mode/v1` + `qwen-plus` or `qwen-turbo`
- **ZhipuAI**: `https://open.bigmodel.cn/api/paas/v4` + `glm-4.5`
- **Codex**: `https://chatgpt.com/backend-api/codex` + `gpt-5-codex`

### Q: How do I use a different model for a specific project?

**Solution**:
Create a `config/config.yaml` file in the project root:
```yaml
openai:
  apiKey: "project-specific-key"
  model: "gpt-4"
  baseURL: "https://api.openai.com/v1"
  timeout: 1800000
gateway:
  logLevel: "debug"  # Use debug mode during project development
```

Project configuration has the highest priority and overrides global settings.

### Q: The service is unreachable or slow after it starts?

**Solution**:
1. Check the service status:
```bash
cal status
```

2. Verify the network connection to the AI provider
3. Consider increasing the timeout:
```yaml
openai:
  timeout: 1800000  # 30 minutes
```

4. If the issue persists, restart the service:
```bash
cal restart
```

## 📚 More Resources

- 📋 [Development Guide](./DEVELOPMENT.md) - Development environment setup and build instructions
- 🧠 [Architecture Guide](./CLAUDE.md) - Detailed technical architecture and development notes
- 🧪 [Testing Guide](./CLAUDE.md#testing-architecture) - Testing architecture and run instructions

### Automatic updates

- Every interactive `cal` command checks `~/.code-cli-any-llm/version.json` and refreshes the cache in the background every 20 hours. Network errors during the check never block the gateway.
- When you run `cal code`, the CLI pauses before launching the Gemini experience if a newer version exists and offers four options: `y` (update now), `n` (skip for this run), `skip` (ignore this release), or `off` (disable future checks and restart the gateway).
- Run `cal update` at any time to synchronously refresh the cache and install the latest published package.
- Set `GAL_DISABLE_UPDATE_CHECK=1` if you need to permanently opt out of automatic checks (also available through the `off` option in the prompt).

## 🙏 Acknowledgements

This project draws inspiration from [claude-code-router](https://github.com/musistudio/claude-code-router), [llxprt-code](https://github.com/acoliver/llxprt-code), and [aio-cli](https://github.com/adobe/aio-cli). We sincerely thank these excellent open-source projects and their contributors.

## 🤝 Contributing

Issues and pull requests are welcome!

## 📄 License

Apache License 2.0
