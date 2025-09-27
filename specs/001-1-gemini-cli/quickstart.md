# Gemini API 网关快速启动指南

## 概述

本指南将帮助您快速设置和运行 Gemini API 网关服务，使您能够通过 Gemini CLI 使用任何 OpenAI 兼容的 LLM 提供商。

## 前置要求

- Node.js >= 18.0.0
- pnpm 包管理器
- Gemini CLI (可选，用于测试)
- OpenAI 兼容的 API 密钥

## 快速开始

### 1. 安装依赖

```bash
# 克隆项目
git clone <repository-url>
cd code-cli-any-llm

# 安装依赖
pnpm install
```

### 2. 配置环境变量

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入您的配置：

```bash
# 服务器配置
PORT=3000
NODE_ENV=development

# OpenAI 兼容提供商配置
GAL_OPENAI_API_KEY=your-api-key-here
GAL_OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4

# 可选：其他提供商示例
# OPENAI_BASE_URL=https://openrouter.ai/api/v1
# OPENAI_MODEL=anthropic/claude-2
```

### 3. 启动服务

```bash
# 开发模式（带热重载）
pnpm run start:dev

# 生产模式
pnpm run build
pnpm run start:prod
```

服务将在 `http://localhost:3000` 启动。

### 4. 验证服务

检查健康状态：

```bash
curl http://localhost:3000/health
```

预期响应：

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "uptime": 42,
  "version": "1.0.0"
}
```

### 5. 配置 Gemini CLI

如果您使用 Gemini CLI，可以通过以下方式配置：

```bash
# 设置 Gemini CLI 指向网关
export GEMINI_API_BASE=http://localhost:3000/v1

# 或者在 CLI 中直接使用
gemini --api-base=http://localhost:3000/v1 "你的提示"
```

## API 使用示例

### 基本文本对话

```bash
curl -X POST http://localhost:3000/v1/models/gemini-pro:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{ "text": "Hello, how are you?" }]
      }
    ]
  }'
```

### 流式响应

```bash
curl -X POST http://localhost:3000/v1/models/gemini-pro:streamGenerateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{ "text": "Tell me a story" }]
      }
    ]
  }'
```

### 工具调用

```bash
curl -X POST http://localhost:3000/v1/models/gemini-pro:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{ "text": "What'\''s the weather like in Boston?" }]
      }
    ],
    "tools": [
      {
        "functionDeclarations": [
          {
            "name": "get_current_weather",
            "description": "Get the current weather in a given location",
            "parameters": {
              "type": "object",
              "properties": {
                "location": {
                  "type": "string",
                  "description": "The city and state, e.g. San Francisco, CA"
                }
              },
              "required": ["location"]
            }
          }
        ]
      }
    ]
  }'
```

## 支持的提供商

### OpenAI
```env
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4
```

### Azure OpenAI
```env
OPENAI_BASE_URL=https://your-resource.openai.azure.com/openai/deployments/your-deployment
GAL_OPENAI_MODEL=gpt-4
GAL_OPENAI_API_KEY=your-api-key
```

### OpenRouter
```env
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=anthropic/claude-2
```

### 本地模型 (Ollama)
```env
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=llama2
```

## 故障排除

### 常见错误

1. **连接超时**
   - 检查网络连接
   - 验证 `OPENAI_BASE_URL` 是否正确
   - 确认目标服务是否正常运行

2. **认证失败**
   - 验证 `GAL_OPENAI_API_KEY` 是否正确
   - 检查 API 密钥是否有效
   - 确认是否有足够的配额

3. **模型不存在**
   - 验证 `OPENAI_MODEL` 是否存在
   - 检查提供商是否支持该模型

4. **CORS 错误**
   - 如果从浏览器访问，确保配置了正确的 CORS 头
   - 检查网关的 CORS 配置

### 调试模式

启用调试日志：

```bash
DEBUG=gemini-gateway:* pnpm run start:dev
```

## 性能优化

### 1. 启用压缩
在生产环境中，确保启用了响应压缩以减少带宽使用。

### 2. 连接池
网关自动管理到提供商的连接池，无需额外配置。

### 3. 缓存
考虑在网关前添加 Redis 缓存层以缓存重复请求。

## 安全建议

1. **保护 API 密钥**
   - 不要在代码中硬编码 API 密钥
   - 使用环境变量或密钥管理服务
   - 定期轮换 API 密钥

2. **访问控制**
   - 在生产环境中添加认证层
   - 使用 API 网关或反向代理
   - 实施速率限制

3. **日志记录**
   - 启用请求日志以进行监控
   - 不要记录敏感信息
   - 定期审查日志

## 下一步

- 阅读 [API 文档](./contracts/api.yaml) 了解完整的 API 规范
- 查看 [数据模型](./data-model.md) 了解内部数据结构
- 探索 [实现任务](./tasks.md) 了解开发进度