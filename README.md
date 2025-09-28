# Code CLI Any LLM

> A unified gateway for the Gemini, opencode, crush, and Qwen Code AI CLIs

For the Chinese version of this document, see [README_CN.md](./README_CN.md).

## 🎯 Project Overview

Code CLI Any LLM (CAL) acts as a universal proxy that can masquerade as the Gemini, opencode, or crush CLI while sending traffic to any OpenAI-compatible backend (Claude Code, Codex, OpenAI, ZhipuAI, Qwen, and more). You keep the same CLI UX you already know and gain the flexibility to switch providers or spread requests across several vendors with consistent tooling.

**Core Features**
- 🔄 **Multi-facade gateway** – keep the default Gemini experience or switch to gemini/opencode/crush/qwencode via `--cli-mode`
- 🔌 **Provider agnostic** – proxy to Claude Code, Codex, OpenAI, ZhipuAI, Qwen, or any OpenAI-compatible service
- ⚡ **Streaming & tools** – preserve SSE streaming, tool-calling, and reasoning outputs for each CLI experience
- 🧩 **Automatic configuration** – generate/merge CLI config files (`~/.config/opencode`, `~/.config/crush`, and `~/.qwen/settings.json` + `~/.qwen/.env`), refresh `gateway.apiMode/cliMode`, and restart the gateway for you
- 🛡️ **Operational helpers** – built-in restart/kill utilities, health reporting, and PID auto-recovery

## 🚀 Quick Start

### Installation

1. *(Optional)* **Install the Gemini CLI** if you plan to use the Gemini AI Code CLI tool:
   ```bash
   npm install -g @google/gemini-cli@latest --registry https://registry.npmmirror.com
   npm install -g @google/gemini-cli-core@latest --registry https://registry.npmmirror.com
   ```

2. *(Optional)* **Install additional AI Code CLI tools** if you want to try opencode, crush, or Qwen Code:
   ```bash
   # opencode
   npm install -g opencode-ai@latest

   # crush
   brew install charmbracelet/tap/crush   # or follow the official crush installation guide

   # qwen-code
   npm install -g @qwen-code/qwen-code@latest
   ```

3. **Install the CAL gateway**:
   ```bash
   npm install -g @kdump/code-cli-any-llm@latest --registry https://registry.npmmirror.com
   ```

### First Run

Launch CAL with your preferred CLI facade:

```bash
cal code --cli-mode opencode
# cal code --cli-mode crush
# cal code --cli-mode qwencode
# cal code  # defaults to the Gemini CLI experience
```

**First-run wizard**
- Collects the primary provider (`claudeCode`, `codex`, or `openai`) and connection settings:
  - **Base URL** (pre-filled, editable)
  - **Default model**
  - **Authentication mode** (Codex supports `ApiKey` and `ChatGPT`)
  - **API key** (when required by the provider)
- Automatically generates CLI config files for opencode/crush/qwencode on first use (`~/.config/opencode/opencode.json`, `~/.config/crush/crush.json`, and `~/.qwen/settings.json` + `~/.qwen/.env`)
- Saves the new configuration, restarts the gateway (`cal restart`), and waits for the health check to pass
- When `gateway.apiKey` is missing in `qwencode` mode, CAL writes a placeholder into `~/.qwen/.env` and prompts you to fill in a real key so the Qwen Code CLI can connect successfully
- Finally launches the selected AI Code CLI (Gemini by default; switch with `--cli-mode` at any time)

💡 **Codex ChatGPT mode**: Choosing `Codex + ChatGPT` prompts the CLI to open a browser-based OAuth login on the first request. The login URL appears in your terminal, and successful authentication writes `auth.json` to `~/.code-cli-any-llm/codex/`. Tokens refresh automatically, so repeat logins are not required.

### Reconfigure

Run this command whenever you need to update credentials or switch providers:

```bash
cal auth
```

## 💡 Usage Examples

### Basic conversations

```bash
# Start a conversation
cal code "Write an HTTP service in TypeScript"

# Explain code
cal code "Explain what this code does"

# Optimization tips
cal code "Help me optimize this algorithm"
```

### Work with local files

```bash
# Analyze the current project structure
cal code "Please analyze the architecture of this project"

# Request a code review
cal code "Please review my code and suggest improvements"
```

### Explore more options

```bash
# Show all Gemini CLI options
cal code --help

# Use additional Gemini CLI parameters
cal code --temperature 0.7 "Write a creative story"

# Launch alternate CLI experiences
cal code --cli-mode opencode
cal code --cli-mode crush
cal code --cli-mode qwencode
```

## 📖 User Guide

### Command overview

`cal` provides the following primary commands:

- **`cal code [prompt]`** – Chat with the AI assistant (main entry point)
- **`cal auth`** – Configure AI service credentials
- **`cal start`** – Manually start the background gateway service
- **`cal stop`** – Stop the gateway service
- **`cal restart`** – Restart the gateway service
- **`cal status`** – Check the gateway status
- **`cal kill`** – Force-terminate stuck processes (troubleshooting)
- **`cal update`** – Check for updates and install the latest version
- **`cal version`** – Display the current CAL version
- **`cal --help`** – Show CLI help information

### Codex ChatGPT (OAuth) mode

1. Run `cal auth`, select **Codex**, and choose the **ChatGPT** authentication mode.
2. The next time you run `cal code` or `cal start`, the terminal prints an OAuth link (e.g., `https://auth.openai.com/oauth/authorize?...`). Open the link in a browser to complete the login.
3. During login the CLI spins up a temporary callback service on `127.0.0.1:1455`. If the port is in use, free it or retry; the CLI automatically retries and explains failures.
4. After successful authorization you’ll see “Login successful, you may return to the terminal.” Tokens are stored in `~/.code-cli-any-llm/codex/auth.json`.
5. Tokens refresh automatically. Deleting `auth.json` triggers a fresh browser login on the next request.

Set `CODEX_HOME` to change where OAuth tokens are stored (default `~/.code-cli-any-llm/codex`).

### Configuration hierarchy

CAL merges configuration from three layers (higher priority overrides lower priority):

1. **Project configuration** – `./config/config.yaml`
2. **Global configuration** – `~/.code-cli-any-llm/config.yaml`
3. **Environment variables** – baseline defaults

### Gateway modes

- `gateway.apiMode`: determines which API surface the gateway exposes (`gemini` or `openai`). Set to `openai` to enable `/api/v1/openai/v1/...` endpoints.
- `gateway.cliMode`: sets the default CLI launched by `cal code` (`gemini`, `opencode`, `crush`, or `qwencode`). Override per run with `--cli-mode`.
- `gateway.apiKey`: optional shared key forwarded to OpenAI-compatible CLIs. Use it in opencode/crush configs or via environment variables such as `CODE_CLI_API_KEY`.

When `gateway.apiMode` is `openai`, the gateway exposes:
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
| Other OpenAI-compatible services | Custom URL | Model name provided by the vendor |

### Configure with environment variables

Baseline settings can be provided through environment variables. Examples:

```bash
# Primary provider (claudeCode / codex / openai)
export CAL_AI_PROVIDER="codex"

# Codex configuration
export CAL_CODEX_AUTH_MODE="chatgpt"              # apikey or chatgpt (default apikey)
export CAL_CODEX_API_KEY="your-codex-api-key"     # only required for ApiKey mode
export CAL_CODEX_BASE_URL="https://chatgpt.com/backend-api/codex"
export CAL_CODEX_MODEL="gpt-5-codex"
export CAL_CODEX_TIMEOUT="1800000"
export CAL_CODEX_REASONING='{"effort":"medium"}'
export CAL_CODEX_TEXT_VERBOSITY="medium"
export CODEX_HOME="$HOME/.custom-codex"           # optional OAuth token directory

# Claude Code configuration
export CAL_CLAUDE_CODE_API_KEY="your-claude-code-api-key"
export CAL_CLAUDE_CODE_BASE_URL="https://open.bigmodel.cn/api/anthropic"
export CAL_CLAUDE_CODE_MODEL="claude-sonnet-4-20250514"
export CAL_CLAUDE_CODE_TIMEOUT="1800000"
export CAL_CLAUDE_CODE_VERSION="2023-06-01"
export CAL_CLAUDE_CODE_BETA="claude-code-20250219,interleaved-thinking-2025-05-14"
export CAL_CLAUDE_CODE_USER_AGENT="claude-cli/1.0.119 (external, cli)"
export CAL_CLAUDE_CODE_X_APP="cli"
export CAL_CLAUDE_CODE_DANGEROUS_DIRECT="true"
export CAL_CLAUDE_CODE_MAX_OUTPUT="64000"

# OpenAI / compatible providers
export CAL_OPENAI_API_KEY="your-api-key"
export CAL_OPENAI_BASE_URL="https://api.openai.com/v1"
export CAL_OPENAI_MODEL="gpt-4"
export CAL_OPENAI_TIMEOUT="1800000"
export CAL_OPENAI_ORGANIZATION="org-xxxxxx"       # optional organization ID

# Gateway configuration
export CAL_PORT="23062"
export CAL_HOST="0.0.0.0"
export CAL_LOG_LEVEL="info"
export CAL_GATEWAY_LOG_DIR="$HOME/.code-cli-any-llm/logs"
export CAL_GATEWAY_API_MODE="openai"
export CAL_GATEWAY_CLI_MODE="opencode"
export CAL_GATEWAY_API_KEY="shared-demo-key"
export CAL_DISABLE_UPDATE_CHECK="1"               # disable automatic update prompts

# Advanced controls
export CAL_RATE_LIMIT_MAX="100"                   # per-15-minute rate limit cap
export CAL_REQUEST_TIMEOUT="3600000"              # request timeout in milliseconds
export CAL_ALLOWED_ORIGINS="http://localhost:3000,http://localhost:8080"
export CAL_LOG_DIR="/custom/log/path"             # custom log directory
```

### Project configuration

For project-specific defaults, create `config/config.yaml` in your project root:

```yaml
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
```

To make Codex the default provider for a project:

```yaml
aiProvider: codex
codex:
  authMode: ApiKey
  apiKey: "project-codex-key"
  baseURL: "https://chatgpt.com/backend-api/codex"
  model: "gpt-5-codex"
  timeout: 1800000
  reasoning:
    effort: medium
  textVerbosity: medium
```

For OAuth mode:

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

- **`aiProvider`** – primary provider (`openai`, `codex`, or `claudeCode`)
- **`codex.authMode`** – `ApiKey` (static key) or `ChatGPT` (OAuth login with automatic refresh)
- **`openai.apiKey`** – API key for OpenAI or compatible services
- **`openai.baseURL`** – OpenAI-compatible endpoint URL
- **`openai.model`** – default model name (default `glm-4.5`)
- **`openai.timeout`** – request timeout in milliseconds (default 1,800,000 ≈ 30 minutes)
- **`codex.apiKey`** – Codex API key (required in `ApiKey` mode)
- **`codex.baseURL`** – Codex endpoint URL (default `https://chatgpt.com/backend-api/codex`)
- **`codex.model`** – Codex model name (default `gpt-5-codex`)
- **`codex.timeout`** – Codex timeout in milliseconds (default 1,800,000)
- **`codex.reasoning`** – reasoning configuration following the Codex Responses API schema
- **`codex.textVerbosity`** – verbosity level: `low`, `medium`, or `high`

### Gateway settings

- **`gateway.port`** – service port (default 23062)
- **`gateway.host`** – bind address (default `0.0.0.0`)
- **`gateway.logLevel`** – log level (`debug`, `info`, `warn`, `error`)
- **`gateway.logDir`** – log directory (default `~/.code-cli-any-llm/logs`)

## 🛠️ Troubleshooting

### AI assistant not responding

**Symptom**: `cal code` hangs or prints no output.

**Solution**:
```bash
cal kill                          # clean up stuck processes
cal code "Hello"                  # retry the conversation
```

### Authentication failure

**Symptom**: API key rejected or authentication errors.

**Solution**:
```bash
cal auth                          # rerun the configuration wizard
```

**Checklist**
- Confirm the API key is correct and active
- Ensure the base URL matches the provider
- Verify the account has sufficient quota

### Service fails to start

**Symptom**: gateway fails to boot or health check reports errors.

**Solution**:
```bash
cal status                        # inspect current gateway health
cal restart                       # restart the service
cal kill && cal start             # force cleanup if the problem persists
```

**Checklist**
- Test network connectivity to the AI provider
- Ensure port 23062 is free
- Verify the configuration file format

### Port conflict

**Symptom**: port 23062 is already in use.

**Solution**:
1. Change the port in the configuration file:
   ```yaml
   # ~/.code-cli-any-llm/config.yaml
   gateway:
     port: 23063
   ```
2. Or set it via environment variables:
   ```bash
   export PORT=23063
   ```

### Configuration issues

**Symptom**: configuration validation fails.

**Solution**
1. Check the syntax in `~/.code-cli-any-llm/config.yaml`
2. Ensure all required fields are present
3. Validate file permissions (`chmod 600`)

### Permission issues

**Symptom**: unable to read or write configuration files.

**Solution**:
```bash
chmod 700 ~/.code-cli-any-llm
chmod 600 ~/.code-cli-any-llm/config.yaml
```

### Network connectivity problems

**Symptom**: requests time out or the provider is unreachable.

**Solution**
1. Check your network connection
2. Try an alternate `baseURL` (for example, a local relay)
3. Increase the timeout:
   ```yaml
   openai:
     timeout: 1800000
   ```

### View gateway logs

Inspect detailed logs when diagnosing issues:

```bash
tail -n 300 -f ~/.code-cli-any-llm/logs/gateway-*.log

export LOG_LEVEL=debug
cal restart
```

## ❓ FAQ

### Q: What if the input length exceeds the model limit?

**Symptom**
- Gemini CLI reports “Model stream ended with an invalid chunk or missing finish reason.”
- Gateway logs contain `InternalError.Algo.InvalidParameter: Range of input length should be [1, 98304]`.

**Cause**: the prompt or file exceeds the model’s default token limit.

**Solution**
1. Increase the maximum input tokens via `extraBody.max_input_tokens`:
   ```yaml
   # ~/.code-cli-any-llm/config.yaml
   openai:
     apiKey: "your-api-key"
     baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
     model: "qwen-plus-latest"
     extraBody:
       max_input_tokens: 200000
   ```
2. Review the vendor’s documentation for exact limits (for example, some Qwen models allow up to 1,000,000 tokens).

### Q: How can I switch to another provider?

Run the wizard again:
```bash
cal auth
```

Select the provider you need, or set `CAL_AI_PROVIDER` before running the wizard.

### Q: How do I override models for a specific project?

Create `config/config.yaml` in the project root:
```yaml
openai:
  apiKey: "project-key"
  model: "gpt-4"
  baseURL: "https://api.openai.com/v1"
  timeout: 1800000
gateway:
  logLevel: "debug"
```

Project-level configuration has the highest priority.

### Q: The service becomes slow or unreachable after starting?

1. Check the gateway status with `cal status`.
2. Verify connectivity to the provider.
3. Increase the timeout if needed.
4. Restart the service with `cal restart`.

## 📚 More Resources

- 📋 [Development Guide](./DEVELOPMENT.md) – Environment setup and build instructions
- 🧠 [Architecture Guide](./CLAUDE.md) – Technical architecture and design notes
- 🧪 [Testing Guide](./CLAUDE.md#testing-architecture) – Testing strategy and instructions

### Automatic updates

- Interactive `cal` commands check `~/.code-cli-any-llm/version.json` and refresh the cache every 20 hours. Network issues never block execution.
- When `cal code` detects a newer version, the prompt offers `y` (update now), `n` (skip), `skip` (ignore this release), or `off` (disable future checks and restart the gateway).
- Run `cal update` at any time to synchronously refresh and install the latest package.
- Set `CAL_DISABLE_UPDATE_CHECK=1` or choose `off` in the prompt to opt out permanently.

## 🙏 Acknowledgements

CAL draws inspiration from [claude-code-router](https://github.com/musistudio/claude-code-router), [llxprt-code](https://github.com/acoliver/llxprt-code), and [aio-cli](https://github.com/adobe/aio-cli). Huge thanks to these outstanding open-source projects and their contributors.

## 🤝 Contributing

Issues and pull requests are welcome!

## 📄 License

Apache License 2.0
# Qwen Code config directory override (optional, defaults to ~/.qwen)
export CAL_QWEN_HOME="$HOME/.qwen"
