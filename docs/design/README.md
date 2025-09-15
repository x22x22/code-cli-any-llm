# 设计文档

本文档目录包含 Gemini API 网关的完整设计方案，基于对 llxprt-code 和 aioncli 项目的深度调研分析。

## 文档列表

### 核心设计文档

- [**实现方案**](./implementation-plan.md) - 整体架构设计和实现方案
- [**核心接口**](./core-interfaces.md) - 详细的接口和数据结构定义
- [**实施路线图**](./implementation-roadmap.md) - 9周详细实施计划

### 快速开始

1. **阅读 [实现方案](./implementation-plan.md)** 了解整体架构
2. **查看 [核心接口](./core-interfaces.md)** 理解系统设计
3. **参考 [实施路线图](./implementation-roadmap.md)** 了解开发计划

## 设计原则

### 1. 完全兼容性
- 100% 兼容 Gemini API 接口
- 无需修改 Gemini CLI 代码
- 支持所有 Gemini API 功能

### 2. 高性能
- 低延迟响应
- 支持高并发
- 流式传输优化

### 3. 可扩展性
- 模块化架构
- 插件化提供商
- 易于添加新功能

### 4. 生产就绪
- 完整的监控
- 错误处理
- 安全考虑

## 架构概览

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│ Gemini CLI  │────▶│  Gemini Gateway  │────▶│ LLM Providers│
│             │     │                 │     │             │
│ - 无需修改  │     │ - API 路由      │     │ - OpenAI     │
│ - 无感知    │     │ - 格式转换      │     │ - Anthropic  │
│             │     │ - 负载均衡      │     │ - Qwen       │
└─────────────┘     └─────────────────┘     └─────────────┘
```

## 技术栈

- **框架**: NestJS (TypeScript)
- **HTTP**: Express.js
- **流式**: Server-Sent Events
- **配置**: 环境变量 + YAML
- **监控**: OpenTelemetry
- **部署**: Docker + Compose

## 核心特性

### API 兼容性
- ✅ `POST /v1/models/{model}:generateContent`
- ✅ `POST /v1/models/{model}:streamGenerateContent`
- ✅ `GET /v1/models`
- ✅ 工具调用支持
- ✅ 流式响应
- ✅ 多模态支持

### 提供商支持
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- Qwen (通义千问)
- DeepSeek
- 更多提供商...

### 企业特性
- 健康检查
- 指标监控
- 错误重试
- 请求缓存
- 安全验证

## 快速开始

### 本地开发

```bash
# 克隆项目
git clone <repository>
cd gemini-gateway

# 安装依赖
pnpm install

# 启动开发服务器
pnpm run start:dev

# 服务运行在 http://localhost:3000
```

### 配置 Gemini CLI

```bash
# 设置环境变量
export GEMINI_API_ENDPOINT=http://localhost:3000/v1

# 或配置在 ~/.config/gemini/config.yaml
echo 'api_endpoint: "http://localhost:3000/v1"' >> ~/.config/gemini/config.yaml
```

### Docker 部署

```bash
# 构建镜像
docker build -t gemini-gateway .

# 运行容器
docker run -p 3000:3000 \
  -e OPENAI_API_KEY=your_key \
  gemini-gateway
```

## 实现进度

- [x] 调研分析
- [x] 设计方案
- [ ] MVP 实现 (Week 1-4)
- [ ] 功能增强 (Week 5-7)
- [ ] 企业特性 (Week 8-9)

## 贡献指南

1. 阅读设计文档
2. 创建功能分支
3. 提交 Pull Request
4. 代码审查
5. 合并到主分支

## 许可证

MIT License