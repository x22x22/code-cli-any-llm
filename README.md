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

### 安装步骤

1. **安装 Gemini CLI**（如果尚未安装）：
```bash
npm install -g @google/gemini-cli@latest --registry https://registry.npmmirror.com
npm install -g @google/gemini-cli-core@latest --registry https://registry.npmmirror.com
```

2. **安装本工具**：
```bash
npm install -g @kdump/gemini-any-llm@latest --registry https://registry.npmmirror.com
```

### 首次使用

直接运行以下命令开始使用：

```bash
gal code
```

**首次运行流程**：
- 系统会自动触发配置向导，要求填写：
  - **OpenAI Base URL**（默认：`https://open.bigmodel.cn/api/paas/v4`）
  - **默认模型**（默认：`glm-4.5`）  
  - **API Key**（必填）
- 配置将保存到 `~/.gemini-any-llm/config.yaml`
- 自动生成或更新 `~/.gemini/settings.json`，设置认证类型为 `gemini-api-key`
- 自动启动后台网关服务并等待就绪
- 启动 Gemini CLI 进行对话

### 重新配置

如需重新配置或切换AI提供商：

```bash
gal auth
```

## 💡 使用示例

### 基本对话

```bash
# 开始对话
gal code "请用TypeScript写一个HTTP服务"

# 解释代码
gal code "解释一下这段代码的作用"

# 优化建议
gal code "帮我优化这个算法"
```

### 传递文件内容

```bash
# 分析当前目录下的代码文件
gal code "请帮我分析这个项目的架构"

# 请求代码审查
gal code "请审查一下我的代码并提出改进建议"
```

### 查看更多选项

```bash
# 查看 gemini CLI 的所有选项
gal code --help

# 使用其他 gemini CLI 参数
gal code --temperature 0.7 "写一个创意故事"
```

## 📖 使用指南

### 命令概述

`gal` 提供以下主要命令：

- **`gal code [prompt]`** - 与 AI 助手对话（主要功能）
- **`gal auth`** - 配置 AI 服务认证信息
- **`gal start`** - 手动启动后台网关服务
- **`gal stop`** - 停止后台网关服务
- **`gal restart`** - 重启网关服务
- **`gal status`** - 查看网关运行状态
- **`gal kill`** - 强制终止异常进程（故障排除）
- **`gal version`** - 查看当前版本
- **`gal --help`** - 查看帮助信息

### 配置管理

系统支持灵活的配置层次结构，优先级如下（高优先级覆盖低优先级）：

1. **项目配置** (`./config/config.yaml`) - 最高优先级，项目特定配置
2. **全局配置** (`~/.gemini-any-llm/config.yaml`) - 中等优先级，用户默认配置  
3. **环境变量** - 最低优先级，作为基础配置

### 支持的提供商

| 提供商 | baseURL | 推荐模型 |
|--------|---------|----------|
| **智谱AI**（默认） | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.5` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4`, `gpt-4o` |
| 千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus`, `qwen-turbo` |
| 其他兼容 OpenAI API 的服务 | 自定义 URL | 对应模型名 |

### 环境变量配置

支持通过环境变量进行配置（作为基础配置，优先级最低）：

```bash
# API 配置
export GAL_OPENAI_API_KEY="your-api-key"
export GAL_OPENAI_BASE_URL="https://api.openai.com/v1"
export GAL_OPENAI_MODEL="gpt-4"
export GAL_OPENAI_TIMEOUT="30000"

# 网关配置
export GAL_PORT="23062"
export GAL_HOST="0.0.0.0"
export GAL_LOG_LEVEL="info"
export GAL_GATEWAY_LOG_DIR="~/.gemini-any-llm/logs"

# 可选的高级配置
export GAL_OPENAI_ORGANIZATION="org-xxxxxx"    # OpenAI 组织 ID
export GAL_RATE_LIMIT_MAX="100"                # API 限流上限（每15分钟）
export GAL_REQUEST_TIMEOUT="120000"            # 请求超时时间（毫秒）
export GAL_ALLOWED_ORIGINS="http://localhost:3000,http://localhost:8080"  # CORS 允许的来源
export GAL_LOG_DIR="/custom/log/path"          # 自定义日志目录
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
  timeout: 30000
gateway:
  port: 23062
  host: "0.0.0.0"
  logLevel: "info"
  logDir: "./logs"
EOF
```

## 🔧 详细配置说明

### API 配置项

- **`openai.apiKey`** - AI 提供商的 API 密钥（必需）
- **`openai.baseURL`** - API 端点地址（默认：智谱AI）
- **`openai.model`** - 默认使用的模型名称（默认：`glm-4.5`）
- **`openai.timeout`** - 请求超时时间，毫秒（默认：30000）

### 网关配置项

- **`gateway.port`** - 服务端口（默认：23062）
- **`gateway.host`** - 绑定地址（默认：0.0.0.0）
- **`gateway.logLevel`** - 日志级别：`debug`/`info`/`warn`/`error`（默认：info）
- **`gateway.logDir`** - 日志目录（默认：`~/.gemini-any-llm/logs`）

## 🛠️ 故障排除

### AI 助手无响应

**现象**：执行 `gal code` 后无响应或长时间卡住

**解决方案**：
```bash
# 1. 清理异常进程
gal kill

# 2. 重新尝试对话
gal code "你好"
```

### 认证失败

**现象**：提示 API Key 无效或认证失败

**解决方案**：
```bash
# 重新配置认证信息
gal auth
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
gal status

# 2. 手动重启服务
gal restart

# 3. 如果仍有问题，强制清理
gal kill
gal start
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
# ~/.gemini-any-llm/config.yaml
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
1. 检查配置文件语法：`~/.gemini-any-llm/config.yaml`
2. 确保所有必需字段已填写
3. 验证文件权限（应为 600）

### 权限问题

**现象**：无法读写配置文件

**解决方案**：
```bash
# 确保目录权限正确
chmod 700 ~/.gemini-any-llm
chmod 600 ~/.gemini-any-llm/config.yaml
```

### 网络连接问题

**现象**：连接超时或网络错误

**解决方案**：
1. 检查网络连接
2. 尝试使用不同的 `baseURL`（如国内镜像服务）
3. 增加超时时间：
```yaml
openai:
  timeout: 60000  # 60秒
```

### 查看日志

如需调试，可以查看详细日志：

```bash
# 查看网关日志
tail -n 300 -f ~/.gemini-any-llm/logs/gateway.log

# 启用调试模式
export LOG_LEVEL=debug
gal restart
```

## 📚 更多资源

- 📋 [开发手册](./DEVELOPMENT.md) - 开发环境设置和构建说明
- 🧠 [架构文档](./CLAUDE.md) - 详细的技术架构和开发指南
- 🧪 [测试说明](./CLAUDE.md#testing-architecture) - 测试架构和运行方式

## 🙏 致谢

本项目复刻、借鉴了 [claude-code-router](https://github.com/musistudio/claude-code-router)、[llxprt-code](https://github.com/acoliver/llxprt-code) 与 [aio-cli](https://github.com/adobe/aio-cli) 的实现方式与代码，在此向这些优秀的开源项目与贡献者表示诚挚感谢。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

Apache License 2.0
