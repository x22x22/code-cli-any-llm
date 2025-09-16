# Implementation Plan: 全局配置文件读取功能

**Branch**: `002-home-home-gemini` | **Date**: 2025-01-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-home-home-gemini/spec.md`

## Summary
实现一个在用户home目录下自动读取和管理全局配置文件的功能。系统启动时检查 `~/.gemini-any-llm/config.yaml` 配置文件，如不存在则自动创建带默认值的模板，并验证apiKey字段的有效性，确保系统能够可靠启动并使用统一的全局配置。

## Technical Context
**Language/Version**: TypeScript with Node.js 18+
**Primary Dependencies**: js-yaml (现有依赖), fs/path (Node.js内置)
**Storage**: YAML文件存储，无需数据库
**Testing**: Jest (现有测试框架)
**Target Platform**: Linux/macOS/Windows (跨平台home目录支持)
**Project Type**: single - 扩展现有NestJS项目
**Performance Goals**: <10ms配置文件加载时间
**Constraints**: 在保证代码健壮性的前提下，用最小的代码量实现这个功能
**Scale/Scope**: 单文件配置，低复杂度功能

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 1 (扩展现有项目，无新项目)
- Using framework directly? ✅ (直接使用Node.js fs, js-yaml)
- Single data model? ✅ (只有配置对象结构)
- Avoiding patterns? ✅ (无Repository/UoW，直接文件操作)

**Architecture**:
- EVERY feature as library? ✅ (全局配置服务作为可复用库)
- Libraries listed: GlobalConfigService (配置文件读取、创建、验证)
- CLI per library: 不适用 (此功能为内部服务，无独立CLI需求)
- Library docs: 将在代码中提供充分注释

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? ✅
- Git commits show tests before implementation? ✅
- Order: Contract→Integration→E2E→Unit strictly followed? ✅
- Real dependencies used? ✅ (实际文件系统操作)
- Integration tests for: 配置文件创建、读取、验证流程
- FORBIDDEN: Implementation before test, skipping RED phase

**Observability**:
- Structured logging included? ✅ (使用现有NestJS Logger)
- Frontend logs → backend? N/A (后端服务)
- Error context sufficient? ✅ (详细的错误信息和用户指导)

**Versioning**:
- Version number assigned? 继承项目版本
- BUILD increments on every change? ✅
- Breaking changes handled? N/A (新功能，无破坏性变更)

## Project Structure

### Documentation (this feature)
```
specs/002-home-home-gemini/
├── plan.md              # 本文件
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (不适用于此功能)
└── tasks.md             # Phase 2 output (将由/tasks命令生成)
```

### Source Code (repository root)
```
src/
├── config/
│   ├── global-config.service.ts     # 新增：全局配置服务
│   └── global-config.interface.ts   # 新增：配置接口定义
├── main.ts                          # 修改：集成全局配置加载
└── ...

tests/
├── integration/
│   └── global-config.spec.ts        # 新增：集成测试
└── unit/
    └── global-config.service.spec.ts # 新增：单元测试
```

**Structure Decision**: Option 1 (单项目扩展) - 在现有NestJS项目中添加全局配置功能

## Phase 0: Outline & Research

1. **Extract unknowns from Technical Context**:
   - ✅ 所有技术选择已明确，无NEEDS CLARIFICATION项

2. **Generate and dispatch research agents**:
   ```
   Task 1: "研究Node.js跨平台home目录获取最佳实践 (os.homedir() vs process.env.HOME)"
   Task 2: "研究YAML配置文件的错误处理和用户友好提示模式"
   Task 3: "研究NestJS应用启动时的配置加载和验证最佳实践"
   ```

3. **Consolidate findings** in `research.md`

**Output**: research.md with all technical decisions documented

## Phase 1: Design & Contracts

1. **Extract entities from feature spec** → `data-model.md`:
   - GlobalConfig: 全局配置对象
   - ConfigValidationResult: 验证结果对象
   - DefaultConfigTemplate: 默认配置模板

2. **Generate API contracts**:
   - 不适用 (内部服务，无HTTP API)
   - 内部接口: IGlobalConfigService

3. **Generate contract tests**:
   - 配置文件创建测试
   - 配置读取和验证测试
   - 错误处理测试

4. **Extract test scenarios**:
   - 从user stories提取集成测试场景
   - 生成quickstart验证步骤

5. **Update agent file incrementally**:
   - 运行update-agent-context.sh更新CLAUDE.md
   - 添加全局配置功能说明

**Output**: data-model.md, failing tests, quickstart.md, updated CLAUDE.md

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- 基于最小代码量原则，生成精简任务列表
- 每个功能组件一个任务
- 测试优先，实现跟随

**Ordering Strategy**:
- TDD顺序: 测试 → 实现
- 依赖顺序: 接口 → 服务 → 集成
- 标记[P]用于并行执行

**Estimated Output**: 8-12个有序任务，专注于核心功能

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution
**Phase 4**: Implementation following constitutional principles
**Phase 5**: Validation with quickstart and tests

## Complexity Tracking
*无宪章违规项 - 设计符合简单性原则*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete
- [x] Phase 1: Design complete
- [x] Phase 2: Task planning approach described (NOT executed)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (无违规)

---
*Based on Constitution template - See `/memory/constitution.md`*