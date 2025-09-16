# Gemini Any LLM Gateway

> 让 Gemini CLI 访问任何大语言模型提供商

## 🎯 项目简介

Gemini Any LLM Gateway 是一个 API 网关服务，让您可以通过 Gemini CLI 无缝访问各种大语言模型提供商（如 OpenAI、智谱AI、千问等）。无需修改 Gemini CLI，即可享受多样化的 AI 模型服务。

**核心特性**：
- 🔌 **即插即用** - 无需修改 Gemini CLI，完全兼容
- 🌐 **多提供商支持** - 支持 OpenAI、智谱AI、千问等多种提供商
- ⚡ **高性能流式响应** - 实时流式输出，体验流畅
- 🛠️ **智能工具调用** - 完整支持 Function Calling
- 📁 **灵活配置管理** - 全局配置 + 项目配置，使用便捷

## 🚀 快速开始

### 1. 安装和启动

```bash
# 克隆项目
git clone https://github.com/your-repo/gemini-any-llm.git
cd gemini-any-llm

# 安装依赖
pnpm install

# 首次启动（会自动创建配置文件）
pnpm run start:dev
```

### 2. 配置 API Key

首次启动后，系统会在您的用户目录下创建全局配置文件 `~/.gemini-any-llm/config.yaml`：

```yaml
# Global configuration for gemini-any-llm
openai:
  # 必须配置：从您的 AI 提供商获取 API Key
  apiKey: "your-api-key-here"

  # API 端点（默认智谱AI）
  baseURL: "https://open.bigmodel.cn/api/paas/v4"

  # 默认模型
  model: "glm-4.5"

  # 请求超时时间
  timeout: 30000

gateway:
  port: 3002
  host: "0.0.0.0"
  logLevel: "info"
```

**编辑配置文件，设置您的 API Key 后重新启动服务。**

### 3. 配置 Gemini CLI

```bash
# 安装 Gemini CLI（如果未安装）
npm install -g @google/gemini-cli

# 设置 Gemini CLI 使用本地网关
export GOOGLE_GEMINI_BASE_URL="http://localhost:3002/api"

# 开始使用
gemini "你好，请介绍一下自己"
```

## 📖 使用指南

### 配置优先级

系统支持灵活的配置管理：

1. **全局配置** (`~/.gemini-any-llm/config.yaml`) - 默认配置，适用于所有项目
2. **项目配置** (`./config/config.yaml`) - 项目特定配置，优先级更高
3. **环境变量** - 最高优先级，可覆盖任何配置

**重要**：如果项目目录下存在 `config/config.yaml`，将完全不读取全局配置。

### 支持的提供商

| 提供商 | baseURL | 推荐模型 |
|--------|---------|----------|
| 智谱AI | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.5` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4` |
| 千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-max` |

### 项目特定配置

如果您需要为特定项目使用不同的模型或配置：

```bash
# 在项目目录下创建配置
mkdir config
cat > config/config.yaml << EOF
openai:
  apiKey: "project-specific-key"
  model: "gpt-4"
  baseURL: "https://api.openai.com/v1"
gateway:
  port: 3003
EOF
```

### 常见使用场景

```bash
# 日常对话
gemini "解释一下量子计算的基本原理"

# 代码生成
gemini "用 Python 写一个快速排序算法"

# 流式输出（实时响应）
gemini --stream "写一篇关于人工智能发展的文章"
```

## 🔧 配置说明

### 基础配置

- `openai.apiKey` - **必需** AI 提供商的 API 密钥
- `openai.baseURL` - API 端点地址
- `openai.model` - 默认使用的模型名称
- `openai.timeout` - 请求超时时间（毫秒）

### 网关配置

- `gateway.port` - 服务端口（默认 3002）
- `gateway.host` - 绑定地址（默认 0.0.0.0）
- `gateway.logLevel` - 日志级别（debug/info/warn/error）

## 🛠️ 常见问题

### 启动失败

**问题**：服务启动失败，提示 API Key 未配置
**解决**：检查 `~/.gemini-any-llm/config.yaml` 文件，确保 `openai.apiKey` 已正确设置

### 端口冲突

**问题**：端口 3002 已被占用
**解决**：修改配置文件中的 `gateway.port` 为其他端口

### Gemini CLI 连接失败

**问题**：Gemini CLI 无法连接到网关
**解决**：
1. 确认服务正在运行：`curl http://localhost:3002/api/v1/health`
2. 检查 `GOOGLE_GEMINI_BASE_URL` 环境变量设置是否正确
3. 确认防火墙未阻止端口访问

### 响应速度慢

**问题**：AI 响应速度较慢
**解决**：
1. 检查网络连接到 AI 提供商的速度
2. 尝试使用不同的 `baseURL`（如国内的镜像服务）
3. 调整 `timeout` 设置

## 📚 更多资源

- 📋 [开发手册](./DEVELOPMENT.md) - 开发环境设置和构建说明
- 🧠 [架构文档](./CLAUDE.md) - 详细的技术架构和开发指南
- 🧪 [测试说明](./CLAUDE.md#testing-architecture) - 测试架构和运行方式

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License
