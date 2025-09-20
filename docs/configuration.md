# 配置指南

## 概述

本项目使用 YAML 配置文件进行配置管理，支持多个 LLM 提供商的配置和网关设置。

## 配置文件位置

主配置文件位于 `config/config.yaml`。首次使用时，请从示例文件复制：

```bash
cp config/config.example.yaml config/config.yaml
```

## 配置结构

### OpenAI 配置

```yaml
openai:
  apiKey: 'your-api-key-here'        # API 密钥
  baseURL: 'https://api.openai.com/v1'  # API 基础URL
  model: 'gpt-3.5-turbo'              # 默认模型
  timeout: 1800000                    # 请求超时时间（毫秒，约 30 分钟）
  organization: 'optional-org-id'     # 组织ID（可选）
```

### 网关配置

```yaml
gateway:
  port: 23062              # 服务端口
  host: '0.0.0.0'        # 监听地址
  logLevel: 'info'        # 日志级别
```

### 限流配置

```yaml
rateLimit:
  windowMs: 60000         # 时间窗口（毫秒）
  maxRequests: 100        # 最大请求数
```

### 安全配置

```yaml
security:
  cors:
    origin: ['http://localhost:3000']  # 允许的源
    credentials: false                 # 是否允许凭证
  allowedHeaders: ['Content-Type']     # 允许的请求头
  allowedMethods: ['GET', 'POST']      # 允许的方法
```

## 环境变量支持

除了 YAML 配置文件，项目还支持通过环境变量覆盖配置（所有应用相关环境变量使用 GAL_ 前缀）：

```bash
# OpenAI 配置
GAL_OPENAI_API_KEY=your-key
GAL_OPENAI_BASE_URL=https://api.example.com/v1
GAL_OPENAI_MODEL=gpt-4
GAL_OPENAI_TIMEOUT=1800000
GAL_OPENAI_ORGANIZATION=org-xxxxxx

# 网关配置
GAL_PORT=8080
GAL_HOST=0.0.0.0
GAL_LOG_LEVEL=debug
GAL_GATEWAY_LOG_DIR=~/.gemini-any-llm/logs

# 性能和安全配置（可选）
GAL_RATE_LIMIT_MAX=100
GAL_REQUEST_TIMEOUT=3600000
GAL_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
```

## 配置优先级

1. 项目配置文件 (`./config/config.yaml`) - 最高优先级
2. 全局配置文件 (`~/.gemini-any-llm/config.yaml`) - 中等优先级
3. 环境变量（GAL_ 前缀）- 最低优先级，作为基础配置
3. 默认值（最低优先级）

## 多提供商配置

项目支持配置多个 LLM 提供商，示例：

```yaml
providers:
  openai:
    apiKey: 'sk-...'
    baseURL: 'https://api.openai.com/v1'
    models:
      - 'gpt-3.5-turbo'
      - 'gpt-4'

  anthropic:
    apiKey: 'sk-ant-...'
    baseURL: 'https://open.bigmodel.cn/api/anthropic'
    models:
      - 'claude-3-sonnet-20240229'
      - 'claude-3-opus-20240229'

  qwen:
    apiKey: 'your-key'
    baseURL: 'https://dashscope.aliyuncs.com/api/v1'
    models:
      - 'qwen-turbo'
      - 'qwen-plus'
      - 'qwen-max'
```

## 配置验证

应用启动时会自动验证配置文件：

- 检查必需字段是否存在
- 验证数据类型是否正确
- 确保 API 密钥格式有效

如果配置有问题，应用会在启动时显示错误信息。

## 配置热重载

开发环境下，修改配置文件后会自动重载。生产环境需要重启应用。

## 示例配置

以下是完整的配置示例：

```yaml
# OpenAI Configuration
openai:
  apiKey: 'changeme'
  baseURL: 'https://open.bigmodel.cn/api/paas/v4'
  model: 'glm-4.5'
  timeout: 1800000

# Gateway Configuration
gateway:
  port: 23062
  host: '0.0.0.0'
  logLevel: 'info'
  requestTimeout: 3600000

# Rate Limiting
rateLimit:
  windowMs: 60000
  maxRequests: 100

# Security
security:
  cors:
    origin: ['http://localhost:3000', 'http://localhost:4200']
    credentials: true
  allowedHeaders: ['Content-Type', 'Authorization']
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE']

# Request Configuration
request:
  timeout: 1800000
  maxRetries: 3
  retryDelay: 1000

# Logging
logging:
  level: 'info'
  format: 'json'
  file:
    enabled: false
    path: './logs/app.log'
    maxSize: '20M'
    maxFiles: 5
```

## 故障排查

### 常见配置错误

1. **配置文件格式错误**
   - 使用 YAML 验证工具检查语法
   - 确保缩进使用空格而非制表符

2. **API 密钥无效**
   - 检查密钥是否正确复制
   - 确认密钥仍有有效余额

3. **端口占用**
   - 检查端口是否被其他程序占用
   - 修改 `gateway.port` 使用其他端口

4. **CORS 错误**
   - 在 `security.cors.origin` 中添加前端域名
   - 开发时可使用 '*' 允许所有源

### 调试配置

启用调试日志查看配置加载过程：

```yaml
gateway:
  logLevel: 'debug'
```

或使用环境变量：

```bash
GAL_LOG_LEVEL=debug pnpm run start:dev
```
