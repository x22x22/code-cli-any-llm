# 快速启动指南

## 环境要求

- Node.js 18+
- pnpm 8+

## 安装步骤

1. **克隆项目**
```bash
git clone <repository-url>
cd code-cli-any-llm
```

2. **安装依赖**
```bash
pnpm install
```

3. **配置应用**
```bash
cp config/config.example.yaml config/config.yaml
```

编辑 `config/config.yaml` 文件，填入你的配置：
```yaml
# OpenAI Configuration
openai:
  apiKey: 'your-api-key-here'
  baseURL: 'https://api.openai.com/v1'  # 或其他兼容的API地址
  model: 'gpt-3.5-turbo'  # 或其他支持的模型
  timeout: 1800000

# Gateway Configuration
gateway:
  port: 23062  # 网关服务端口
  host: '0.0.0.0'
  logLevel: 'info'
```

4. **启动服务**
```bash
# 开发模式（带热重载）
pnpm run start:dev

# 或生产模式
pnpm run build
pnpm run start:prod
```

服务将在 `http://localhost:23062` 启动。

## 测试连通性

### 健康检查
```bash
curl http://localhost:23062/api/v1/health
```

### Gemini API兼容测试
```bash
# 普通请求
curl -X POST http://localhost:23062/api/v1/models/gemini-2.5-pro:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "role": "user",
      "parts": [{"text": "Hello, world!"}]
    }]
  }'

# 流式请求
curl -X POST http://localhost:23062/api/v1/models/gemini-2.5-pro:streamGenerateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "role": "user",
      "parts": [{"text": "Tell me a joke"}]
    }]
  }'
```

## 与Gemini CLI配合使用

设置环境变量：
```bash
export GEMINI_API_KEY=dummy
export GEMINI_BASE_URL=http://localhost:23062/api/v1
```

然后正常使用Gemini CLI，它会自动通过网关转发请求到OpenAI。

## 故障排查

### 常见问题

1. **API密钥错误**
   - 检查 `config/config.yaml` 文件中的 `openai.apiKey` 是否正确
   - 确认API密钥有效且有足够余额

2. **端口占用**
   - 修改 `config/config.yaml` 文件中的 `gateway.port` 值
   - 或停止占用23062端口的进程

3. **CORS错误**
   - 在 `ALLOWED_ORIGINS` 中添加你的前端域名
   - 开发环境可以设置 `ALLOWED_ORIGINS=*`

### 日志查看

应用日志会输出到控制台，包含：
- 请求/响应信息
- 错误详情
- 性能指标

## 开发指南

### 运行测试
```bash
# 所有测试
pnpm test

# 单元测试
pnpm run test:unit

# E2E测试
pnpm run test:e2e

# 测试覆盖率
pnpm run test:cov
```

### 代码检查
```bash
# ESLint
pnpm run lint

# 格式化
pnpm run format
```

### 项目结构说明

- `src/config/` - 配置管理
- `src/controllers/` - HTTP控制器
- `src/providers/` - LLM提供商实现
- `src/transformers/` - API格式转换
- `src/middleware/` - 中间件
- `src/filters/` - 异常过滤器

## 下一步

查看 [实现状态报告](./implementation-status.md) 了解已完成的功能和后续开发计划。
