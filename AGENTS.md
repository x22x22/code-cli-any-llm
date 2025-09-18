# Repository Guidelines

## 项目结构与模块组织
- `src/` 是 NestJS 核心代码：`controllers/` 暴露 HTTP 接口，`services/` 与 `providers/` 封装模型编排、分词和限流策略，`transformers/` 负责上下游协议转换，`utils/` 与 `common/` 承担共享工具、异常过滤与守卫。
- `config/` 汇总 YAML 示例与校验方案，配合 `src/config/*.ts` 的 `ConfigModule`，支持在同构代理和模型适配间复用配置；`proxy.ts` 描述网关入口，若新增代理需同步这里。
- `test/` 按职责拆分 `unit/`、`integration/`、`contract/` 与 `app.e2e-spec.ts`，测试夹具共享在各目录；`specs/` 记录端到端对话脚本，`docs/`、`DEVELOPMENT.md` 和 `CLAUDE.md` 提供深入架构与运维说明，构建产物进入 `dist/`，运行日志默认写入 `logs/`。
- 工程配置优先级：环境变量 < 用户目录 `~/.gemini-any-llm/config.yaml` < 仓库 `config/config.yaml`，便于团队共享默认值同时允许个人覆盖。

## 构建、测试与开发命令
- 初始化环境：`pnpm install`，需要重新生成依赖时执行 `pnpm install --frozen-lockfile` 以保持锁文件一致。
- 本地服务：`pnpm run start:dev` 热重载，`pnpm run start` 快速验证编译后代码，`pnpm run start:prod` 基于 `dist/main.js` 模拟发布，调试可使用 `pnpm run start:debug` 附加 Inspector。
- 构建与运维：`pnpm run build` 编译 TypeScript，`pnpm run kill` 清理僵尸进程；CI 建议执行 `pnpm run lint && pnpm run test` 作为最小质量门禁。
- 质量与测试：`pnpm run lint` 调用 ESLint + Prettier 修复，`pnpm run format` 处理格式化；测试矩阵涵盖 `pnpm run test`、`pnpm run test:watch`、`pnpm run test:e2e`、`pnpm run test:cov` 与 `pnpm run test:debug`（在调试器下串行执行）。

## 编码风格与命名约定
- 全仓库 TypeScript，保持 Prettier 默认两空格缩进、分号结尾与单引号；避免手工对齐，提交前运行 `pnpm run format` 并确认无 diff。
- 类、装饰器与 DTO 使用 `PascalCase`，方法与变量采用 `camelCase`，文件建议 `kebab-case`（例如 `tokenizer.service.ts`），测试文件追加 `.spec.ts` 或 `.test.ts` 后缀。
- 遵循 `eslint.config.mjs`：业务层允许必要 `any` 但对 `no-unsafe-*` 保持警告级别；测试目录享有放宽规则，但仍需删除无用断言并使用 `expect.assertions` 保障异步安全。
- 路径导入使用别名 `@/`（由 `tsconfig.json` 暴露），请勿混用相对路径与别名；公共常量优先放置在 `src/common/constants` 或相邻模块内的 `constants.ts`。

## 测试指南
- Jest + ts-jest 驱动单元与集成测试，自动收集 `src/**/*.(t|j)s` 覆盖；运行 `pnpm run test:cov` 会在 `coverage/` 输出报告并供 CI 阈值使用。
- 新增特性时至少补齐单位测试和一条集成或契约测试，目录命名参考 `test/unit/rate-limit/`、`test/integration/tokenizer/`，文件使用 `<feature>.spec.ts`。
- 端到端脚本在 `app.e2e-spec.ts` 或 `test/e2e/` 扩展，若依赖外部 API，使用 `supertest` + 可配置 baseURL，并通过 `GAL_OPENAI_API_KEY=stub` 等环境变量模拟。
- 目标覆盖率保持关键模块 ≥80%，若因外部依赖或代理流程无法覆盖，需在 PR 中说明风险与手动验证步骤。

## 提交与 PR 指南
- Git 历史偏好中文动词短句（示例：“优化代码格式，增强可读性”），建议结构为“动作 + 范围 + 结果”，必要时追加 issue 或 ticket 编号，例如 `修复: proxy 500 错误 (#123)`。
- 提交前务必执行 `pnpm run lint && pnpm run test` 并在消息中注明主要验证；多文件改动可分拆为逻辑上独立的 commits，便于回滚。
- PR 描述需覆盖变更动机、接口或配置影响、测试结论及回滚策略；涉及文档、脚本或配置调整时同步更新 `docs/`、`specs/`、`config/` 并在清单中列出。
- 默认要求至少一名代码所有者评审；若引入破坏性更改，请附截图、日志片段或 Postman collection 说明现象，并在 PR 讨论中约定发布时间窗。

## 配置与安全提示
- 配置加载顺序为项目配置 > 全局配置 > 环境变量；敏感字段（如 `GAL_OPENAI_API_KEY`、`GAL_OPENAI_BASE_URL`、`GAL_HOST`、`GAL_LOG_LEVEL`）须通过环境或私有 YAML 提供，严禁提交到版本库。
- 若需新增配置项，请同步更新 `src/config/config.schema.ts` 与 `DefaultConfigTemplate`，并在 README 或 `docs/` 撰写迁移指南，保障旧版部署可平滑升级。
- 调试代理位于 `src/proxy.ts` 及相关 `controllers/`，提交前确认未开放临时端口、未遗留测试凭据；安全审查时优先检查 `http-proxy-middleware` 与速率限制设置是否匹配部署环境。
