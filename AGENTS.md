# Repository Guidelines

## Project Structure & Module Organization
- 主干代码位于 `src/`，其中 `controllers/` 暴露 HTTP 接口，`services/` 与 `providers/` 统筹模型路由、限流与分词策略，`transformers/` 负责协议与响应格式转换。
- 通用工具集中在 `src/utils/` 与 `src/common/`，公共常量建议放入 `src/common/constants/` 或模块内 `constants.ts`；配置模板与校验逻辑保存在 `config/` 并需与 `src/config/*.ts` 同步维护。
- 测试按层级拆分至 `test/unit/`、`test/integration/`、`test/contract/` 与 `test/e2e/`；端到端脚本位于 `specs/`，构建产物生成到 `dist/`，运行日志写入 `logs/`。

## Build, Test, and Development Commands
- `pnpm install --frozen-lockfile`：CI 与复现环境锁定依赖；初次开发可执行 `pnpm install`。
- `pnpm run start:dev`：启用 Nest 热重载调试；需要断点时使用 `pnpm run start:debug` 并配合 `--inspect`。
- `pnpm run build`：编译 TypeScript 产物至 `dist/`；`pnpm run start:prod` 用于模拟生产部署。
- `pnpm run lint`：执行 ESLint + Prettier 修复；合并前需配合 `pnpm run test`、`pnpm run test:cov` 或 `pnpm run test:e2e` 视场景验收。
- 如遇端口或子进程遗留问题，运行 `pnpm run kill` 快速清理。

## Coding Style & Naming Conventions
- 全量采用 TypeScript 与 ECMAScript 模块语法，格式化由根目录 `prettier` 与 ESLint 规则控制，默认两空格缩进、句尾保留分号、字符串使用单引号。
- 类、装饰器、DTO 统一 PascalCase；服务方法、变量使用 camelCase；文件命名推荐 kebab-case，例如 `tokenizer.service.ts` 与 `rate-limit.constants.ts`。
- 导入路径优先使用 `@/` 别名，确保公共拦截器、守卫与管道自 `src/common/` 复用。

## Testing Guidelines
- 测试框架为 Jest + ts-jest，`pnpm run test` 覆盖单元与集成用例，`pnpm run test:e2e` 运行端到端脚本，`pnpm run test:cov` 汇总覆盖率。
- 新特性至少补充一条单测和一条集成或契约测试，关键模块覆盖率目标保持 ≥80%；可通过 `pnpm run test -- --coverage` 或读取 `coverage/` 报告核对。
- 调用外部 API 时设置 `CAL_OPENAI_API_KEY=stub pnpm run test` 隔离依赖；端到端脚本应同步更新 `specs/` 文档说明。

## Commit & Pull Request Guidelines
- 建议提交信息遵循“动作 + 范围 + 结果”，示例：`优化 controllers 响应缓存`、`修复 providers 限流策略`；避免“fix bug”等笼统描述。
- PR 描述需说明变更动机、接口或配置影响、验证结果及回滚策略，并在涉及配置、脚本或文档时列出已同步更新的 `docs/`、`specs/`、`config/` 清单。
- 合并前确认 `pnpm run lint`、`pnpm run test`、`pnpm run test:e2e` 均通过，必要时附上截图、日志或关联 issue 链接方便审核。

## Security & Configuration Tips
- 配置优先级依次为环境变量 < `~/.code-cli-any-llm/config.yaml` < 仓库 `config/config.yaml`，敏感密钥不得进入版本控制。
- 引入新配置项时同步修改 `src/config/config.schema.ts`、默认模板与 README 或 `docs/` 中的迁移说明，确保代理部署在多环境可复现。
