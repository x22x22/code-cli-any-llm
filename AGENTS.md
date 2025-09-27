# Repository Guidelines

## 项目结构与模块组织
核心代码位于 `src/`，其中 `controllers/` 提供 HTTP 接口，`services/` 与 `providers/` 负责模型编排、限流和分词策略，`transformers/` 统一协议转换；共享工具与守卫集中在 `utils/` 与 `common/`。配置示例与校验位于 `config/`，需同步维护 `src/config/*.ts`。测试拆分于 `test/unit/`、`test/integration/`、`test/contract/` 及 `app.e2e-spec.ts`，端到端脚本收录在 `specs/`，构建产物输出 `dist/`，日志写入 `logs/`。

## 构建、测试与开发命令
初次克隆后执行 `pnpm install` 安装依赖；如需确保锁文件一致，使用 `pnpm install --frozen-lockfile`。本地开发建议运行 `pnpm run start:dev` 获取热重载，发布模拟可用 `pnpm run start:prod`。构建 TypeScript 产物运行 `pnpm run build`，开发排障可借助 `pnpm run start:debug`，必要时用 `pnpm run kill` 清理僵尸进程。

## 编码风格与命名约定
项目全量使用 TypeScript，并遵循 Prettier 默认：两空格缩进、分号结尾、单引号。类、装饰器、DTO 采用 PascalCase，方法与变量使用 camelCase，文件名推荐 kebab-case（示例：`tokenizer.service.ts`）。路径导入优先使用 `@/` 别名，公共常量请放置于 `src/common/constants` 或模块内 `constants.ts`。

## 测试指南
测试框架为 Jest + ts-jest，自动收集 `src/**/*.(t|j)s`。日常质量门禁为 `pnpm run lint && pnpm run test`，覆盖率基线参考关键模块 ≥80%。新增特性需至少补齐一个单元测试与一条集成或契约测试；端到端用例放在 `test/e2e/` 或 `app.e2e-spec.ts`，并通过可配置环境变量（例如 `CAL_OPENAI_API_KEY=stub`）隔离外部依赖。

## 提交与 PR 指南
提交信息建议使用中文动词短句，结构如“动作 + 范围 + 结果”，必要时追加 Issue 号码。PR 描述需说明变更动机、接口或配置影响、验证结论与回滚策略；涉及配置、脚本或文档改动时同步更新 `docs/`、`specs/`、`config/` 并列出清单。

## 安全与配置提示
配置优先级为环境变量 < `~/.code-cli-any-llm/config.yaml` < 仓库 `config/config.yaml`，敏感字段只应通过私有配置或环境变量提供。新增配置项时务必更新 `src/config/config.schema.ts` 与默认模板，并在 README 或 `docs/` 记录迁移指引；提交前确认未留下临时端口或测试密钥。
