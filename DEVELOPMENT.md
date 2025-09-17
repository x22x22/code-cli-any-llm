# 开发手册

## 本地环境准备

```bash
git clone https://github.com/your-repo/gemini-any-llm.git
cd gemini-any-llm
pnpm install
```

开发调试时建议提前全局安装 Gemini CLI 相关工具，便于验证 `gal code`：

```bash
npm install -g @google/gemini-cli --registry https://registry.npmmirror.com
npm install -g @google/gemini-cli-core --registry https://registry.npmmirror.com
```

> 若需验证全量发布流程，可使用 `npm install -g @kdump/gemini-any-llm --registry https://registry.npmmirror.com` 安装最近一次构建产物。

## 构建与运行

```bash
# 启动开发服务（热重载）
pnpm run start:dev

# 编译并以生产模式启动（依赖 dist/main.js）
pnpm run start:prod

# 仅构建 TypeScript
pnpm run build
```

本地调试 `gal` CLI 时，可在项目根目录执行：

```bash
pnpm run build
node dist/cli/gal.js code "你好，请介绍一下自己"
```

首次运行会引导填写 API Key / Base URL / 模型，并写入 `~/.gemini-any-llm/config.yaml`，同时自动确保 `~/.gemini/settings.json` 的 `selectedAuthType` 为 `gemini-api-key`。

## 测试与质量

```bash
# 单元测试
pnpm run test

# E2E 测试
pnpm run test:e2e

# 覆盖率
pnpm run test:cov

# 代码风格检查
pnpm run lint
```

## 其他参考

更多架构说明、测试策略与故障排查，请参阅 [CLAUDE.md](./CLAUDE.md)。
