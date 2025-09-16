#!**Language**: Please always communicate and generate tasks documents in Chinese.
# Tasks: Gemini API Gateway

**Input**: Design documents from `/specs/001-1-gemini-cli/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → If not found: ERROR "No implementation plan found"
   → Extract: tech stack, libraries, structure
2. Load optional design documents:
   → data-model.md: Extract entities → model tasks
   → contracts/: Each file → contract test task
   → research.md: Extract decisions → setup tasks
3. Generate tasks by category:
   → Setup: project init, dependencies, linting
   → Tests: contract tests, integration tests
   → Core: models, services, CLI commands
   → Integration: DB, middleware, logging
   → Polish: unit tests, performance, docs
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   → All contracts have tests?
   → All entities have models?
   → All endpoints implemented?
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Single project**: `src/`, `tests/` at repository root
- **Web app**: `backend/src/`, `frontend/src/`
- **Mobile**: `api/src/`, `ios/src/` or `android/src/`
- Paths shown below assume single project - adjust based on plan.md structure

## Phase 3.1: Setup
- [ ] T001 安装 OpenAI SDK 和相关依赖（openai, @nestjs/config, class-validator）
- [ ] T002 配置环境变量模块（ConfigModule）
- [ ] T003 [P] 配置 DTO 验证管道和异常过滤器

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**
- [ ] T004 [P] 合约测试 POST /v1/models/{model}:generateContent 在 test/contract/test-generate-content.spec.ts
- [ ] T005 [P] 合约测试 POST /v1/models/{model}:streamGenerateContent 在 test/contract/test-stream-generate-content.spec.ts
- [ ] T006 [P] 合约测试 GET /health 在 test/contract/test-health.spec.ts
- [ ] T007 [P] 集成测试基本对话流程 在 test/integration/test-basic-conversation.e2e-spec.ts
- [ ] T008 [P] 集成测试流式响应 在 test/integration/test-streaming.e2e-spec.ts
- [ ] T009 [P] 集成测试工具调用 在 test/integration/test-tool-calling.e2e-spec.ts

## Phase 3.3: Core Implementation (ONLY after tests are failing)
- [ ] T010 [P] 创建配置模型和验证 在 src/config/config.schema.ts
- [ ] T011 [P] 创建 Gemini 请求/响应 DTO 在 src/models/gemini/
- [ ] T012 [P] 创建 OpenAI 请求/响应模型 在 src/models/openai/
- [ ] T013 [P] 创建请求转换器（RequestTransformer）在 src/transformers/request.transformer.ts
- [ ] T014 [P] 创建响应转换器（ResponseTransformer）在 src/transformers/response.transformer.ts
- [ ] T015 [P] 创建流式转换器（StreamTransformer）在 src/transformers/stream.transformer.ts
- [ ] T016 [P] 创建 OpenAI 提供商服务 在 src/providers/openai/openai.provider.ts
- [ ] T017 [P] 创建 Gemini 控制器 在 src/controllers/gemini.controller.ts
- [ ] T018 [P] 创建健康检查控制器 在 src/controllers/health.controller.ts
- [ ] T019 更新应用模块以包含所有新模块 在 src/app.module.ts

## Phase 3.4: Integration
- [ ] T020 实现错误处理中间件
- [ ] T021 添加 CORS 配置
- [ ] T022 配置日志记录
- [ ] T023 优化性能和添加超时处理

## Phase 3.5: Polish
- [ ] T024 [P] 为转换器添加单元测试 在 test/unit/transformers/
- [ ] T025 [P] 为提供商服务添加单元测试 在 test/unit/providers/
- [ ] T026 [P] 为控制器添加单元测试 在 test/unit/controllers/
- [ ] T027 运行性能测试确保响应时间 <500ms
- [ ] T028 更新 README.md 和 API 文档
- [ ] T029 移除重复代码和优化

## Dependencies
- Tests (T004-T009) before implementation (T010-T019)
- Models (T010-T012) before transformers (T013-T015)
- Transformers before providers (T016) and controllers (T017-T018)
- All implementation before integration (T020-T023)
- Integration before polish (T024-T029)

## Parallel Example
```
# Launch T004-T009 together:
Task: "合约测试 POST /v1/models/{model}:generateContent 在 test/contract/test-generate-content.spec.ts"
Task: "合约测试 POST /v1/models/{model}:streamGenerateContent 在 test/contract/test-stream-generate-content.spec.ts"
Task: "合约测试 GET /health 在 test/contract/test-health.spec.ts"
Task: "集成测试基本对话流程 在 test/integration/test-basic-conversation.e2e-spec.ts"
Task: "集成测试流式响应 在 test/integration/test-streaming.e2e-spec.ts"
Task: "集成测试工具调用 在 test/integration/test-tool-calling.e2e-spec.ts"

# Launch T010-T012 together:
Task: "创建配置模型和验证 在 src/config/config.schema.ts"
Task: "创建 Gemini 请求/响应 DTO 在 src/models/gemini/"
Task: "创建 OpenAI 请求/响应模型 在 src/models/openai/"
```

## Notes
- [P] tasks = different files, no dependencies
- Verify tests fail before implementing
- Commit after each task
- Avoid: vague tasks, same file conflicts

## Task Generation Rules
*Applied during main() execution*

1. **From Contracts**:
   - api.yaml → 3 contract test tasks [P]
   - 3 endpoints → 3 implementation tasks

2. **From Data Model**:
   - GeminiRequest/Response → DTO tasks [P]
   - OpenAIRequest/Response → model tasks [P]
   - Transformer interfaces → transformer tasks [P]

3. **From User Stories**:
   - Basic conversation → integration test [P]
   - Streaming response → integration test [P]
   - Tool calling → integration test [P]
   - Quickstart scenarios → validation tasks

4. **Ordering**:
   - Setup → Tests → Models → Services → Endpoints → Polish
   - Dependencies block parallel execution

## Validation Checklist
*GATE: Checked by main() before returning*

- [x] All contracts have corresponding tests
- [x] All entities have model tasks
- [x] All tests come before implementation
- [x] Parallel tasks truly independent
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task

## Dependency Graph
```
T001 → T002 → T003
    ↓
T004 → T005 → T006 → T007 → T008 → T009
    ↓
T010 → T011 → T012
    ↓
T013 → T014 → T015
    ↓
T016 → T017 → T018 → T019
    ↓
T020 → T021 → T022 → T023
    ↓
T024 → T025 → T026 → T027 → T028 → T029
```

## Estimated Timeline
- **Phase 3.1 (Setup)**: 1-2 hours
- **Phase 3.2 (Tests)**: 3-4 hours
- **Phase 3.3 (Core)**: 8-10 hours
- **Phase 3.4 (Integration)**: 2-3 hours
- **Phase 3.5 (Polish)**: 4-5 hours
- **Total**: 18-24 hours

## Key Implementation Notes
1. **Minimal Implementation**: Only copy core conversion logic from reference projects
2. **NestJS Built-ins**: Use framework features instead of custom implementations
3. **Focus on Core**: API format conversion is the primary goal
4. **Reference Code**: Use AionCLI's openaiContentGenerator.ts for conversion patterns
5. **Avoid**: CLI code, configuration systems, telemetry, caching, authentication