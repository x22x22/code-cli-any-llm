#!**Language**: Please always communicate and generate plan documents in Chinese.
# Implementation Plan: 报文转换代码移植与智谱优化

**Branch**: `003-docs-llxprt-code` | **Date**: 2025-09-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-docs-llxprt-code/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
4. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
5. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, or `GEMINI.md` for Gemini CLI).
6. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
7. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
8. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
移植 llxprt-code 项目中经过充分测试和优化的报文转换代码到当前项目，特别是 OpenAI、Qwen、智谱模型的转换逻辑。重点包括 ToolFormatter 类的 7+ 种工具格式转换、doubleEscapeUtils 模块的智谱双重转义处理、以及流式响应优化机制，以替换现有的转换实现并提升智谱模型兼容性。

## Technical Context
**Language/Version**: TypeScript 5.7.3, Node.js 18+
**Primary Dependencies**: NestJS, OpenAI SDK, class-validator, js-yaml
**Storage**: YAML configuration files (global + project-specific)
**Testing**: Jest 30.0.0, supertest for HTTP testing
**Target Platform**: Linux server, production HTTP gateway
**Project Type**: single - HTTP gateway service
**Performance Goals**: 保持现有 API 兼容性，支持流式响应，无性能回退
**Constraints**: 100% Gemini API 兼容性，通过现有测试用例
**Scale/Scope**: 核心转换逻辑移植，涉及 7+ 文件，保持现有架构
**用户指定详情**: 注意 llxprt-code 项目包含很多 CLI 相关代码，我们只需要核心的报文转换部分，因为我们是 HTTP server

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 1 (只有当前 HTTP gateway 项目)
- Using framework directly? ✅ (直接使用 NestJS 和 OpenAI SDK)
- Single data model? ✅ (复用现有数据模型，增强转换器)
- Avoiding patterns? ✅ (移植经过验证的代码，避免过度设计)

**Architecture**:
- EVERY feature as library? ✅ (ToolFormatter 和 doubleEscapeUtils 作为独立模块)
- Libraries listed: ToolFormatter(工具格式转换), doubleEscapeUtils(智谱优化), EnhancedProvider(提供者增强)
- CLI per library: N/A (HTTP 服务，无需 CLI)
- Library docs: ✅ (生成详细的接口文档)

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? ✅ (先写失败测试，再移植实现)
- Git commits show tests before implementation? ✅ (合约测试 → 集成测试 → 实现)
- Order: Contract→Integration→E2E→Unit strictly followed? ✅
- Real dependencies used? ✅ (实际 API 调用测试)
- Integration tests for: 合约变更, 工具格式转换, 智谱模型处理
- FORBIDDEN: 严禁未测试就移植代码

**Observability**:
- Structured logging included? ✅ (移植详细的日志记录)
- Frontend logs → backend? N/A (纯后端服务)
- Error context sufficient? ✅ (增强错误处理和上下文)

**Versioning**:
- Version number assigned? ✅ (MINOR 版本增量，新功能)
- BUILD increments on every change? ✅
- Breaking changes handled? ✅ (保持 100% API 兼容性)

## Project Structure

### Documentation (this feature)
```
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure]
```

**Structure Decision**: [DEFAULT to Option 1 unless Technical Context indicates web/mobile app]

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:
   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate contract tests** from contracts:
   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `/scripts/bash/update-agent-context.sh claude` for your AI assistant
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (contracts, data model, quickstart)
- 每个合约接口 → 合约测试任务 [P]
- 每个核心组件 → 移植和适配任务 [P]
- 每个智谱优化 → 专项测试任务
- 集成任务使现有测试通过

**Ordering Strategy**:
- TDD order: 合约测试 → 移植实现 → 集成验证
- Dependency order: 工具类 → 增强Provider → 集成层
- Mark [P] for parallel execution: ToolFormatter, doubleEscapeUtils 可并行移植
- 智谱测试依赖于核心组件完成

**移植任务分类**:
1. **核心移植任务** (P1): ToolFormatter, doubleEscapeUtils 的直接移植
2. **适配任务** (P2): 与现有系统的接口适配
3. **增强任务** (P3): OpenAIProvider 智谱检测集成
4. **测试任务** (P4): 智谱 GLM-4.5 端到端测试
5. **验证任务** (P5): 现有功能无回退验证

**Estimated Output**: 18-22 numbered, ordered tasks in tasks.md

**Special Considerations**:
- 移植任务需要保持原有逻辑完整性
- 智谱优化需要详细的兼容性测试
- 每个任务都需要明确的成功标准

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |


## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented

---
*Based on Constitution v2.1.1 - See `/memory/constitution.md`*