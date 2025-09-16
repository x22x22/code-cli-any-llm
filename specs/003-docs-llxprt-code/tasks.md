# Tasks: 报文转换代码移植与智谱优化

**Input**: 设计文档来自 `/specs/003-docs-llxprt-code/`
**Prerequisites**: plan.md (已完成), research.md, data-model.md, contracts/, quickstart.md

## 执行流程概览
```
1. 分析设计文档: plan.md 技术栈(TypeScript+NestJS), data-model.md 实体设计, contracts/ API接口
2. 识别核心移植组件: ToolFormatter, doubleEscapeUtils, EnhancedProvider
3. 按TDD原则生成任务: 合约测试 → 集成测试 → 核心实现 → 优化完善
4. 应用并行标记: 不同文件可并行[P], 相同文件需串行
5. 验证完整性: 所有合约有测试, 所有组件有实现, 所有优化有验证
```

## 格式: `[ID] [P?] 描述`
- **[P]**: 可并行执行 (不同文件，无依赖关系)
- 包含任务中涉及的确切文件路径

## Phase 3.1: 环境准备

- [ ] T001 验证 llxprt-code 源码文件完整性和可访问性
- [ ] T002 [P] 创建移植目标目录结构 src/transformers/enhanced/, src/utils/zhipu/
- [ ] T003 [P] 安装可能需要的额外依赖包 (基于源码分析)

## Phase 3.2: 合约测试 (TDD) ⚠️ 必须在 3.3 之前完成
**关键: 这些测试必须编写并且必须失败，然后才能进行任何实现**

- [ ] T004 [P] ToolFormatter接口合约测试 in test/contract/tool-formatter.contract.spec.ts
- [ ] T005 [P] doubleEscapeUtils接口合约测试 in test/contract/double-escape-utils.contract.spec.ts
- [ ] T006 [P] EnhancedProvider接口合约测试 in test/contract/enhanced-provider.contract.spec.ts
- [ ] T007 [P] 智谱GLM-4.5模型工具调用集成测试 in test/integration/zhipu-integration.spec.ts
- [ ] T008 [P] 工具格式转换端到端测试 in test/integration/tool-format-conversion.spec.ts

## Phase 3.3: 核心组件移植 (仅在测试失败后进行)

- [ ] T009 [P] 移植 ToolFormatter 类到 src/transformers/enhanced/ToolFormatter.ts
- [ ] T010 [P] 移植 doubleEscapeUtils 模块到 src/utils/zhipu/doubleEscapeUtils.ts
- [ ] T011 [P] 创建 ToolFormatterAdapter 适配器 in src/transformers/enhanced/ToolFormatterAdapter.ts
- [ ] T012 [P] 创建 ZhipuOptimizer 智谱优化器 in src/utils/zhipu/ZhipuOptimizer.ts
- [ ] T013 扩展 OpenAIProvider 集成工具格式检测 in src/providers/OpenAIProvider.ts
- [ ] T014 创建 EnhancedProviderMixin 混入类 in src/providers/EnhancedProviderMixin.ts
- [ ] T015 更新 RequestTransformer 使用新的 ToolFormatter in src/transformers/RequestTransformer.ts
- [ ] T016 更新 ResponseTransformer 集成智谱优化 in src/transformers/ResponseTransformer.ts

## Phase 3.4: 智谱模型特殊处理

- [ ] T017 实现智谱模型自动检测逻辑 in src/providers/OpenAIProvider.ts (detectToolFormat方法)
- [ ] T018 实现双重转义检测和修复 in src/utils/zhipu/doubleEscapeUtils.ts (processToolParameters方法)
- [ ] T019 实现智谱流式响应缓冲优化 in src/providers/OpenAIProvider.ts (流式处理部分)
- [ ] T020 实现工具调用时禁用流式响应逻辑 in src/providers/OpenAIProvider.ts (shouldDisableStreamingForTools方法)

## Phase 3.5: 配置和集成

- [ ] T021 [P] 扩展配置系统支持智谱模型配置 in src/config/ConfigService.ts
- [ ] T022 [P] 添加工具格式配置验证 in src/config/ConfigValidation.ts
- [ ] T023 更新健康检查包含新组件状态 in src/controllers/HealthController.ts
- [ ] T024 集成新的错误处理和日志记录 in src/filters/ 和 src/middleware/

## Phase 3.6: 验证和优化

- [ ] T025 [P] 运行现有测试套件确保无回退 in test/
- [ ] T026 [P] 智谱GLM-4.5模型端到端功能验证 in test/integration/gemini-cli-integration.spec.ts
- [ ] T027 [P] 性能基准测试对比移植前后 in test/performance/
- [ ] T028 [P] 更新项目文档和CLAUDE.md in docs/ 和 CLAUDE.md
- [ ] T029 代码清理和重构优化 (移除重复代码，优化接口)
- [ ] T030 最终集成验证和快速开始指南验证 in quickstart.md

## 依赖关系

**严格顺序要求:**
- 环境准备 (T001-T003) → 合约测试 (T004-T008) → 核心移植 (T009-T016)
- T009-T012 可并行执行 (不同文件)
- T013-T016 依赖 T009-T012 完成
- T017-T020 依赖 T013-T016 完成
- T021-T024 可在 T017-T020 完成后并行执行
- T025-T030 为最终验证阶段

**关键阻塞关系:**
- T009 (ToolFormatter) 阻塞 T015 (RequestTransformer)
- T010 (doubleEscapeUtils) 阻塞 T016 (ResponseTransformer)
- T013 (OpenAIProvider扩展) 阻塞 T017-T020 (智谱特殊处理)
- T025 (现有测试) 必须在 T026 (新功能验证) 之前通过

## 并行执行示例

### 合约测试阶段 (T004-T008)
```bash
# 可同时启动所有合约测试任务:
Task: "ToolFormatter接口合约测试 in test/contract/tool-formatter.contract.spec.ts"
Task: "doubleEscapeUtils接口合约测试 in test/contract/double-escape-utils.contract.spec.ts"
Task: "EnhancedProvider接口合约测试 in test/contract/enhanced-provider.contract.spec.ts"
Task: "智谱GLM-4.5模型工具调用集成测试 in test/integration/zhipu-integration.spec.ts"
Task: "工具格式转换端到端测试 in test/integration/tool-format-conversion.spec.ts"
```

### 核心移植阶段 (T009-T012)
```bash
# 可同时启动核心组件移植:
Task: "移植 ToolFormatter 类到 src/transformers/enhanced/ToolFormatter.ts"
Task: "移植 doubleEscapeUtils 模块到 src/utils/zhipu/doubleEscapeUtils.ts"
Task: "创建 ToolFormatterAdapter 适配器 in src/transformers/enhanced/ToolFormatterAdapter.ts"
Task: "创建 ZhipuOptimizer 智谱优化器 in src/utils/zhipu/ZhipuOptimizer.ts"
```

### 配置集成阶段 (T021-T022)
```bash
# 配置相关任务可并行:
Task: "扩展配置系统支持智谱模型配置 in src/config/ConfigService.ts"
Task: "添加工具格式配置验证 in src/config/ConfigValidation.ts"
```

## 关键验证点

### ✅ 合约测试阶段验证
- 所有接口合约测试编写完成且失败
- 集成测试场景覆盖智谱模型关键功能
- 测试代码符合现有项目测试规范

### ✅ 核心移植验证
- 源码成功移植且无编译错误
- 适配器正确集成到现有架构
- 新组件通过基础功能测试

### ✅ 智谱优化验证
- GLM-4.5模型正确检测和格式切换
- 双重转义问题自动检测和修复
- 流式响应缓冲机制正常工作

### ✅ 最终集成验证
- 现有所有测试通过 (无回退)
- 新功能端到端测试通过
- 性能无明显下降
- 快速开始指南可执行

## 任务规则应用

1. **来自合约接口**: 每个contract/*.ts文件 → 对应合约测试任务 [P]
2. **来自数据模型**: 每个核心实体 → 移植和适配任务 [P]
3. **来自用户故事**: 智谱优化场景 → 集成测试 [P]
4. **移植特殊性**: 保持源码逻辑完整性，专注于接口适配

## 风险缓解

- **依赖缺失**: T003 提前分析和安装依赖
- **接口不兼容**: T011-T012 创建适配器层
- **回归问题**: T025 严格运行现有测试
- **性能影响**: T027 建立性能基准对比

## 成功标准

1. **功能性**: 智谱GLM-4.5模型工具调用无双重转义问题
2. **兼容性**: 现有API 100%兼容，所有测试通过
3. **稳定性**: 新增错误处理，增强系统鲁棒性
4. **扩展性**: 支持更多工具格式，为未来provider扩展做好准备
5. **可维护性**: 代码结构清晰，文档完整，易于后续开发

本任务清单提供了完整的移植路径，确保在保持现有功能完整的前提下，成功集成llxprt-code项目的核心转换优化能力。